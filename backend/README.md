# Backend

FastAPI service that scores the quiz and fetches film recommendations from TMDB.
The frontend can run entirely on local data; this service only adds real film
recommendations and the server-side character match.

## Setup

```bash
cd backend
python -m pip install -r requirements.txt
```

`backend/.env`:

```ini
TMDB_API_KEY=<your TMDB v3 API key>
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

- `TMDB_API_KEY` — the **v3 API key** from TMDB → Settings → API. Not the v4 read
  access token, and not quoted.
- `CORS_ORIGINS` — comma-separated origins allowed to call the API. Add your
  deployed frontend origin here, otherwise the browser blocks the response and the
  site silently falls back to its hardcoded films.

## Run

```bash
uvicorn main:app --reload        # http://127.0.0.1:8000
```

Port 8000 is the default. If the bind fails with `[Errno 10048]`, another process
already owns the port — run `Get-NetTCPConnection -LocalPort 8000 -State Listen`
to find it, or start on another port with `--port 8001` and point the frontend at
it.

## Verify the TMDB key

```bash
python test_tmdb.py
```

`test_tmdb.py` is the diagnostic for the API key. It loads the key from
`backend/.env` (falling back to the shell environment), checks that it looks like
a v3 key, authenticates against `/configuration`, runs the exact `discover/movie`
call the app uses, and then prints how many films each of the six colour profiles
currently matches. Exit code 0 means the key is good; otherwise the failing step is
printed, which separates "bad key" from "filters too strict".

## Endpoints

| Method | Path                | Purpose                                                     |
| ------ | ------------------- | ----------------------------------------------------------- |
| GET    | `/api/health`       | Liveness plus `questions` count and whether a key is loaded  |
| POST   | `/api/quiz/submit`  | Score answers, resolve type/contrast, fetch recommendations   |

`POST /api/quiz/submit` body:

```json
{ "answers": [5, 4, 3, 2, 5, 1, 4, 3, 5, 2, 4, 3, 5, 1, 4], "age": "25to40", "sex": "male" }
```

- `answers` — exactly 15 integers from 1 to 5, in the order the frontend served the
  questions. Scoring is order-independent because both sides use the same fixed set
  of active question ids.
- `age` — `under25` | `25to40` | `over40`.
- `sex` — `female` | `male` | `nonbinary`. `nonbinary` returns no character match by design.

Response highlights: `main_color`, `contrast_color`, `scores`, `archetype`,
`character_match` (`"Tyler Durden — Fight Club"`), `stretch_text`, `main_movies`,
`contrast_movies`. Movie objects carry `title`, `release_date`, `vote_average`,
`overview`, and `poster_path` as the raw TMDB path (`"/abc123.jpg"`), or `null`
when a film has no artwork. Prefix it with
`https://image.tmdb.org/t/p/<size>` at the width the surface needs.

Anything invalid returns `422` with the expected answer count in `detail`.

## Scoring

`config.json` holds 30 weighted questions; `activeQuestionIds` selects the 15 the
quiz serves (odd ids, so genre coverage stays even). The frontend shuffles those 15
per run, so `score_answers` zips the answers against `ACTIVE_QUESTIONS` — the same
fixed set, in config order.

Each answer (1–5) is multiplied by the question's per-colour weight and tallied. The
highest total is the main colour, the second highest the contrast colour. Characters
come from `colorProfiles[color].characters["<sex>_<age bracket>"]`.

## Recommendations

Each colour profile maps to TMDB genre ids and a minimum vote average. Two quirks
are handled in `fetch_movies`:

- TMDB effectively intersects `with_genres` once the vote filters apply, so a
  three-genre profile used to return one or two films. One request is issued per
  genre, the results are merged by id, then ranked by popularity.
- `vote_count.gte` is 1000 and `release_date.lte` is today, so unreleased titles and
  slop with a handful of votes stay off the shelf.

A per-genre failure is skipped rather than failing the whole response, and a missing
`TMDB_API_KEY` returns empty lists so the frontend falls back to its local data.

## Frontend wiring

The frontend reads `VITE_API_URL`. When it is unset, the app probes
`http://localhost:8000/api/health` once and uses the local server if it answers;
otherwise it skips the request and renders local data. Set `VITE_API_URL` for any
deployed build, e.g. `VITE_API_URL=https://your-api.onrender.com`.
