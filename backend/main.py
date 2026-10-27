import asyncio
import json
import os
import math
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
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
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


def format_movie(movie):
    return {
        "id": movie.get("id"),
        "title": movie.get("title"),
        "poster_path": movie.get("poster_path"),
        "release_date": movie.get("release_date"),
        "vote_average": movie.get("vote_average"),
        "overview": movie.get("overview"),
    }

def build_genre_affinity(totals, color_profiles):
    colors = list(color_profiles.keys())

    # Convert the quiz scores into relative color strengths.
    minimum_score = min(
        (float(totals.get(color, 0)) for color in colors),
        default=0.0,
    )

    strengths = {
        color: max(
            float(totals.get(color, 0)) - minimum_score,
            0.0,
        ) + 0.01
        for color in colors
    }

    total_strength = sum(strengths.values())

    color_affinity = {
        color: strength / total_strength
        for color, strength in strengths.items()
    }

    # Distribute each color's affinity across its genres.
    genre_affinity = {}

    for color, profile in color_profiles.items():
        genres = profile.get("genres", [])

        if not genres:
            continue

        genre_weight = color_affinity[color] / len(genres)

        for genre_id in genres:
            genre_affinity[genre_id] = (
                genre_affinity.get(genre_id, 0.0)
                + genre_weight
            )

    return color_affinity, genre_affinity


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


async def fetch_movies(
    client,
    genres,
    minimum_rating,
    limit,
    genre_affinity=None,
):
    if not TMDB_API_KEY or not genres:
        return []

    # Remove duplicate genre IDs while preserving order.
    genres = list(dict.fromkeys(genres))

    # Fetch movies for each genre.
    results = await asyncio.gather(
        *[
            discover_by_genre(client, genre, minimum_rating)
            for genre in genres
        ],
        return_exceptions=True,
    )

    # Merge results and remove duplicate movies.
    movies_by_id = {}

    for result in results:
        if isinstance(result, Exception):
            continue

        for movie in result:
            movie_id = movie.get("id")

            if movie_id is not None:
                movies_by_id[movie_id] = movie

    movies = list(movies_by_id.values())

    if not movies:
        return []

    # Rank candidates using genre relevance, rating, and popularity.
    def rank_movie(movie):
        movie_genres = set(movie.get("genre_ids", []))

        if genre_affinity:
            genre_score = sum(
                genre_affinity.get(genre_id, 0.0)
                for genre_id in movie_genres
            )
        else:
            # Preserve sensible behavior for existing callers.
            genre_score = (
                len(movie_genres.intersection(genres))
                / max(len(genres), 1)
            )

        rating = float(movie.get("vote_average") or 0)
        popularity = float(movie.get("popularity") or 0)

        popularity_score = min(
            math.log1p(max(popularity, 0)) / 10,
            1.0,
        )

        return (
            0.65 * genre_score
            + 0.30 * (rating / 10)
            + 0.05 * popularity_score
        )

    movies.sort(key=rank_movie, reverse=True)

    return [
        format_movie(movie)
        for movie in movies[:limit]
    ]


async def recommendations_for(
    main_color,
    contrast_color,
    totals=None,
):
    color_profiles = CONFIG["colorProfiles"]

    main_profile = color_profiles[main_color]
    contrast_profile = color_profiles[contrast_color]

    totals = totals or {
        color: 1 if color in (main_color, contrast_color) else 0
        for color in color_profiles
    }

    color_affinity, genre_affinity = build_genre_affinity(
        totals,
        color_profiles,
    )

    # Use the three strongest colors to broaden the candidate pool.
    top_colors = sorted(
        color_affinity,
        key=color_affinity.get,
        reverse=True,
    )[:3]

    candidate_genres = list(dict.fromkeys(
        genre
        for color in top_colors
        for genre in color_profiles[color].get("genres", [])
    ))

    minimum_rating = min(
        color_profiles[color].get("minimumRating", 0)
        for color in top_colors
    )

    # Build a separate ranking for the contrast shelf.
    contrast_genre_affinity = {}

    contrast_genres = contrast_profile.get("genres", [])

    for genre_id in contrast_genres:
        contrast_genre_affinity[genre_id] = 1 / max(
            len(contrast_genres),
            1,
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        main_movies = await fetch_movies(
            client=client,
            genres=candidate_genres,
            minimum_rating=minimum_rating,
            limit=12,
            genre_affinity=genre_affinity,
        )

        contrast_movies = await fetch_movies(
            client=client,
            genres=contrast_genres,
            minimum_rating=contrast_profile.get(
                "minimumRating",
                0,
            ),
            limit=4,
            genre_affinity=contrast_genre_affinity,
        )

    # Avoid showing the same movies in both shelves.
    main_ids = {
        movie["id"]
        for movie in main_movies
    }

    contrast_movies = [
        movie
        for movie in contrast_movies
        if movie["id"] not in main_ids
    ]

    return {
        "main_movies": main_movies,
        "contrast_movies": contrast_movies,
    }


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "questions": QUESTION_COUNT, "tmdb_key": bool(TMDB_API_KEY)}


@app.post("/api/quiz/submit")
async def submit_quiz(submission: QuizSubmission) -> dict:
    if len(submission.answers) != QUESTION_COUNT:
        raise HTTPException(status_code=422, detail=f"Expected {QUESTION_COUNT} answers")
    totals = score_answers(submission.answers)
    ranking = sorted(totals, key=totals.get, reverse=True)
    main_color, contrast_color = ranking[:2]
    recommendations = await recommendations_for(main_color, contrast_color, totals)
    main_movies = recommendations["main_movies"]
    contrast_movies = recommendations["contrast_movies"]
    main_profile = CONFIG["colorProfiles"][main_color]
    contrast_profile = CONFIG["colorProfiles"][contrast_color]
    return {"main_color": main_color, "contrast_color": contrast_color, "scores": totals, "archetype": main_profile["archetype"], "character_match": character_for(submission, main_color), "stretch_text": main_profile["stretchText"], "main_genres": main_profile["genres"], "contrast_genres": contrast_profile["genres"], "main_movies": main_movies, "contrast_movies": contrast_movies}
