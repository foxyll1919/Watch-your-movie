import asyncio
import json
import os
from datetime import date
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
load_dotenv(ROOT / "backend" / ".env")
with CONFIG_PATH.open(encoding="utf-8") as config_file:
    CONFIG = json.load(config_file)

TMDB_BASE = "https://api.themoviedb.org/3"
# Discover ANDs `with_genres` once the vote filters are in play, so a
# three-genre profile collapses to a handful of films. One request per genre,
# merged afterwards, keeps the shelves full.
MIN_VOTE_COUNT = 1000

ACTIVE_QUESTION_IDS: set[int] = set(
    CONFIG.get("activeQuestionIds") or [question["id"] for question in CONFIG["quizQuestions"]]
)
ACTIVE_QUESTIONS = [
    question for question in CONFIG["quizQuestions"] if question["id"] in ACTIVE_QUESTION_IDS
]
QUESTION_COUNT = len(ACTIVE_QUESTIONS)

app = FastAPI(title="CineColor API", version="0.1.0")
# Both the dev server (5173) and `vite preview` (4173) serve the frontend. A
# preview origin left out here fails closed and silently: the browser blocks the
# request, the app falls back to the local result, and the stub shows typographic
# stand-ins where TMDB posters should be — with no error on the page itself.
DEFAULT_ORIGINS = ",".join(
    [
        f"http://{host}:{port}"
        for host in ("localhost", "127.0.0.1")
        for port in ("5173", "4173")
    ]
)
origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
    if origin.strip()
]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["*"])


class QuizSubmission(BaseModel):
    answers: list[int] = Field(min_length=15, max_length=15)
    age: Literal["under25", "25to40", "over40"]
    sex: Literal["female", "male", "nonbinary"]

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, answers: list[int]) -> list[int]:
        if any(answer < 1 or answer > 5 for answer in answers):
            raise ValueError("Answers must be integers from 1 to 5")
        return answers


def score_answers(answers: list[int]) -> dict[str, int]:
    totals = {color: 0 for color in CONFIG["colorProfiles"]}
    for answer, question in zip(answers, ACTIVE_QUESTIONS):
        for color, weight in question["weights"].items():
            totals[color] += answer * weight
    return totals


def character_for(submission: QuizSubmission, color: str) -> str | None:
    # Every profile now carries male, female and nonbinary keys, so no branch is
    # needed here: a missing key simply means the pair was never written down.
    age_key = {"under25": "under_25", "25to40": "25_40", "over40": "over_40"}[submission.age]
    return CONFIG["colorProfiles"][color]["characters"].get(f"{submission.sex}_{age_key}")


def format_movie(movie: dict) -> dict:
    return {
        "id": movie["id"],
        "title": movie["title"],
        # Raw TMDB path, e.g. "/abc123.jpg". The client picks its own width per
        # surface, so the size never has to round-trip through this response.
        "poster_path": movie.get("poster_path"),
        "release_date": movie.get("release_date"),
        "vote_average": movie.get("vote_average"),
        "overview": movie.get("overview", ""),
    }


async def discover_by_genre(client: httpx.AsyncClient, genre: int, minimum_rating: float) -> list[dict]:
    response = await client.get(
        f"{TMDB_BASE}/discover/movie",
        params={
            "api_key": os.getenv("TMDB_API_KEY"),
            "with_genres": str(genre),
            "vote_average.gte": minimum_rating,
            "vote_count.gte": MIN_VOTE_COUNT,
            "release_date.lte": date.today().isoformat(),
            "sort_by": "popularity.desc",
            "page": 1,
        },
    )
    response.raise_for_status()
    return response.json().get("results", [])


async def fetch_movies(client: httpx.AsyncClient, genres: list[int], minimum_rating: float, limit: int) -> list[dict]:
    api_key = os.getenv("TMDB_API_KEY")
    if not api_key:
        return []
    pages = await asyncio.gather(
        *(discover_by_genre(client, genre, minimum_rating) for genre in genres),
        return_exceptions=True,
    )
    merged: dict[int, dict] = {}
    for page in pages:
        if isinstance(page, BaseException):
            continue
        for movie in page:
            merged.setdefault(movie["id"], movie)
    ranked = sorted(merged.values(), key=lambda movie: movie.get("popularity", 0), reverse=True)
    return [format_movie(movie) for movie in ranked[:limit]]


async def recommendations_for(main_color: str, contrast_color: str) -> tuple[list[dict], list[dict]]:
    api_key = os.getenv("TMDB_API_KEY")
    if not api_key:
        return [], []
    main_profile = CONFIG["colorProfiles"][main_color]
    contrast_profile = CONFIG["colorProfiles"][contrast_color]
    async with httpx.AsyncClient(timeout=10) as client:
        main_movies, contrast_movies = await asyncio.gather(
            fetch_movies(client, main_profile["genres"], main_profile["minimumRating"], 12),
            fetch_movies(client, contrast_profile["genres"], contrast_profile["minimumRating"], 4),
        )
    return main_movies, contrast_movies


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "questions": QUESTION_COUNT, "tmdb_key": bool(os.getenv("TMDB_API_KEY"))}


@app.post("/api/quiz/submit")
async def submit_quiz(submission: QuizSubmission) -> dict:
    if len(submission.answers) != QUESTION_COUNT:
        raise HTTPException(status_code=422, detail=f"Expected {QUESTION_COUNT} answers")
    totals = score_answers(submission.answers)
    ranking = sorted(totals, key=totals.get, reverse=True)
    main_color, contrast_color = ranking[:2]
    main_movies, contrast_movies = await recommendations_for(main_color, contrast_color)
    main_profile = CONFIG["colorProfiles"][main_color]
    contrast_profile = CONFIG["colorProfiles"][contrast_color]
    return {"main_color": main_color, "contrast_color": contrast_color, "scores": totals, "archetype": main_profile["archetype"], "character_match": character_for(submission, main_color), "stretch_text": main_profile["stretchText"], "main_genres": main_profile["genres"], "contrast_genres": contrast_profile["genres"], "main_movies": main_movies, "contrast_movies": contrast_movies}

