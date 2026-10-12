# KaigoAI — working rules for Claude Code

AI operations and Care Continuity Intelligence for home-care agencies. Google Cloud AI Builder Cup 2026 entry
(theme: Sustainability & Social Impact). Deadline 18 Oct 2026; the app must stay live through evaluation (to 6 Nov+).

## Competition rules that affect code
- Fresh code only (written during the hackathon). Commit small and often; history is evidence.
- Google Cloud stack only: Firebase Hosting/Auth, Cloud Run, Firestore, Gemini (Agent Platform / Vertex AI). No other clouds.
- Public repo: never commit secrets, `.env`, service-account keys, or real PII. Synthetic data only.
- Demo video must be under 3:00.

## Product principles (don't break these)
- Rules stay rules: expiry, eligibility, availability, overlap, rest, full coverage are deterministic code in `backend/rules/`.
- Every Gemini call goes through `services/gemini.py` with a Pydantic response schema. Never parse free text.
- AI never decides: options and eligibility come from rules; Gemini extracts and explains. Explanations pass `services/grounding.py`.
- Consequential changes need a coordinator's approval and write an audit entry (`services/audit.py`).
- No clinical judgements or diagnoses anywhere (prompts, UI copy, scores).
- If Gemini is unavailable, raise `AIUnavailable`; never fabricate a response.

## Layout
- `backend/` FastAPI (`main.py`), `agents/` (intake, request, verification, matching, scheduling, simulation, continuity),
  `rules/` (deterministic rules + per-vertical YAML), `services/` (storage, Gemini, audit, seed), `prompts/`.
- `frontend/` React + Vite + TS. Tokens in `src/styles/app.css` ("Linen & Gold": ivory #FAF6EF, ink #2E2412, gold-ink #7C5E1A;
  petals Trust=taupe, Fit=ochre, Continuity=rose; Source Serif 4 / Instrument Sans / Barlow Condensed).
- `data/reference/` public sources (cited) + synthetic entries (marked). `data/synthetic/documents/` fictional certificates.
- `tests/` unit, scenario and API tests. `scripts/evaluate.py` measures Gemini quality against ground truth.

## Commands
- Backend: `cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8080`
- Tests: `backend/.venv/bin/python -m pytest -q` (from repo root)
- Frontend: `cd frontend && npm run dev` · type check `npm run typecheck`
- Evaluate Gemini: `backend/.venv/bin/python scripts/evaluate.py` (needs GEMINI_BACKEND configured)
- Deploys (`gcloud run deploy`, `firebase deploy`) need the user's approval.
