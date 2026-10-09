"""Diagnostics for the TMDB credential.

Run it directly from `backend/`:

    python test_tmdb.py

Exit code 0 means the key authenticated and the exact discover call the app
relies on returned films. Anything else prints the failing step, so a broken
key can be told apart from a broken filter.
"""

import asyncio
import os
import sys
from datetime import date
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")

TMDB_BASE = "https://api.themoviedb.org/3"
TIMEOUT = 15


def load_key() -> str | None:
    """The key from `backend/.env`, or the shell environment if it is set there."""
    key = os.getenv("TMDB_API_KEY")
    if key:
        return key.strip()
    env_path = ROOT / "backend" / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "TMDB_API_KEY":
            return value.strip().strip('"').strip("'") or None
    return None


def describe_key(key: str) -> str:
    return f"{key[:4]}…{key[-4:]} (length {len(key)})" if len(key) > 8 else f"length {len(key)}"


def check_configuration(key: str | None) -> str | None:
    if not key:
        return "TMDB_API_KEY is missing. Add it to backend/.env as TMDB_API_KEY=<v3 key>."
    if key.startswith("eyJ"):
        return "TMDB_API_KEY looks like a v4 read access token, not a v3 API key. Use the v3 key from your TMDB account settings."
    if len(key) != 32:
        return f"TMDB_API_KEY has an unexpected length ({len(key)}); a v3 key is 32 hex characters."
    return None


def test_tmdb_api_key() -> bool:
    """Validate the key end to end. Prints a report; returns True when usable."""
    key = load_key()
    problem = check_configuration(key)
    if problem:
        print(f"FAIL  {problem}")
        return False
    print(f"key   {describe_key(key)}")

    with httpx.Client(timeout=TIMEOUT) as client:
        try:
            response = client.get(f"{TMDB_BASE}/configuration", params={"api_key": key})
        except httpx.HTTPError as error:
            print(f"FAIL  cannot reach {TMDB_BASE}: {error}")
            return False
        if response.status_code == 401:
            print(f"FAIL  key rejected by TMDB (401). Copy a fresh v3 API key. Body: {response.text[:200]}")
            return False
        if response.status_code != 200:
            print(f"FAIL  unexpected status {response.status_code}. Body: {response.text[:200]}")
            return False
        print("PASS  /configuration authenticated")

        try:
            response = client.get(
                f"{TMDB_BASE}/discover/movie",
                params={
                    "api_key": key,
                    "with_genres": "18",
                    "vote_average.gte": 7.0,
                    "vote_count.gte": 1000,
                    "release_date.lte": date.today().isoformat(),
                    "sort_by": "popularity.desc",
                    "page": 1,
                },
            )
        except httpx.HTTPError as error:
            print(f"FAIL  discover request failed: {error}")
            return False
        if response.status_code != 200:
            print(f"FAIL  discover returned {response.status_code}. Body: {response.text[:200]}")
            return False
        results = response.json().get("results", [])
        if not results:
            print("FAIL  discover authenticated but matched nothing; the filters are too strict.")
            return False
        print(f"PASS  discover returned {len(results)} films, e.g. {', '.join(movie['title'] for movie in results[:3])}")
    return True


async def check_profiles() -> None:
    """One request per genre, exactly as `main.fetch_movies` does it."""
    from main import CONFIG, MIN_VOTE_COUNT, discover_by_genre

    key = load_key()
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for color, profile in CONFIG["colorProfiles"].items():
            pages = await asyncio.gather(
                *(discover_by_genre(client, genre, profile["minimumRating"]) for genre in profile["genres"]),
                return_exceptions=True,
            )
            merged: dict[int, dict] = {}
            for page in pages:
                if isinstance(page, BaseException):
                    print(f"FAIL  {color}: {page}")
                    continue
                for movie in page:
                    merged.setdefault(movie["id"], movie)
            ranked = sorted(merged.values(), key=lambda movie: movie.get("popularity", 0), reverse=True)[:4]
            titles = ", ".join(movie["title"] for movie in ranked) or "nothing"
            print(f"{color:<7} min {profile['minimumRating']} (count >= {MIN_VOTE_COUNT}): {len(merged)} films -> {titles}")


if __name__ == "__main__":
    healthy = test_tmdb_api_key()
    if healthy:
        asyncio.run(check_profiles())
    sys.exit(0 if healthy else 1)
