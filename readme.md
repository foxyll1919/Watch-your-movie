# Watch-your-movie

A rule-based quiz that maps you to one of six movie-watching personalities and
recommends films you will probably love. No accounts, no tracking, no machine
learning: a weighted question set, six colour profiles, and TMDB.

## How it works

1. **Home** — the pitch and the `Begin` button.
2. **Intro** — age group and how you identify, used to pick a character match.
3. **Quiz** — 15 film synopses on a 1–5 scale, shuffled fresh on every run.
4. **Results** — main colour, contrast colour, character match with its film, and
   three recommended films plus four to stretch on.

Scoring is deterministic: every answer is multiplied by the question's per-colour
weights, the six totals are ranked, and the top two become the result.

## Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run typecheck
npm run build
```

The app runs on `config.json` alone. Set `VITE_API_URL` to a running backend to get
real TMDB film recommendations; when it is unset the app probes
`http://localhost:8000/api/health` once and uses the local server if it answers.

## Data

`config.json` is the brain:

- `colorProfiles` — the six colours with archetype, TMDB genres, minimum rating,
  stretch text, and the age/sex character matrix.
- `quizQuestions` — 30 weighted questions (`id`, `text`, `weights`).
- `activeQuestionIds` — the 15 ids the quiz serves; the rest stay in the file for
  future edits.

## Backend

The FastAPI service, TMDB key setup, key diagnostics, and endpoint reference are
documented in [`backend/README.md`](backend/README.md).
