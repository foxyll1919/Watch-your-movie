# moviefriccs Agent Notes

## Repository state
- The planning documents remain in `prd.md`, `deepseek_markdown_20260924_9f164e.md`, and `moviefriccks.md`; `progress.md` records the design decision sheet and current build status.
- The runnable frontend is `frontend/`; the API is `backend/main.py`, documented in `backend/README.md`. The frontend uses local `config.json` data, calls the API when `VITE_API_URL` is set, and otherwise probes `http://localhost:8000/api/health` once before falling back to local data.
- `frontend/components.json` configures shadcn/ui with the Base UI preset. Local shadcn components are source files under `frontend/src/components/ui/`; do not hand-edit generated files without checking their upstream diff.

## Commands
- Run from `frontend/`: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`.
- Run from `backend/`: `python -m pip install -r requirements.txt`; start with `uvicorn main:app --reload`; syntax-check with `python -m py_compile main.py`; diagnose TMDB credentials with `python test_tmdb.py`.
- Run the design audit from `frontend/`: `node "C:\Users\SUYASH\.agents\skills\Anti-Slop (AJONAI)\scripts\check.mjs" src --json`.
- Validate the root data file with `python -c "import json; json.load(open(r'..\config.json', encoding='utf-8'))"` when working from `frontend/`.

## Product boundaries
- `config.json` is the MVP source for six color profiles and 30 weighted questions; `activeQuestionIds` selects the 15 the quiz serves, and the frontend shuffles that set once per run. Keep the six color keys and the existing `id`, `text`, and `weights` shape consistent.
- The current result calculation is local and deterministic: multiply each 1–5 answer by question weights, rank the six totals, and use the top two colors for main/contrast output. The backend must score against the same active set.
- The backend endpoint is `POST /api/quiz/submit`; TMDB credentials belong in backend `.env` as `TMDB_API_KEY`, and frontend API configuration is `VITE_API_URL`. Never commit real secrets.

## UI constraints
- Apply the Deliberate decision sheet in `progress.md` before changing the visual direction; the committed palette/type/spacing/shape values are intentional, not defaults.
- Keep interaction states explicit: `:active`, `:focus-visible`, disabled, loading, error, and `prefers-reduced-motion`. The audit currently passes with zero findings.
