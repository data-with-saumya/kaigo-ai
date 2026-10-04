# Kaigo AI

> **AI operations for care agencies: verify the right people, match them to the right care, and keep that care running when circumstances change.**

Google Cloud AI Builder Cup 2026 · Theme: **Sustainability & Social Impact** · Team: Saumya Singh, Shambhavi

| | |
|---|---|
| Live prototype (v2, this branch) | https://kaigoai-v2.web.app |
| Live prototype (v1, `main` / tag `v1.0`) | https://kaigoai-v1-510607.web.app |
| Source code | https://github.com/data-with-saumya/kaigo-ai |
| Demo video (under 3 min) | _[link]_ |
| Pitch deck (PDF) | _[link]_ |

---

## What's new in v2

v2 moves Kaigo from a scripted demo towards a working operations tool. v1 stays live and unchanged on `main`.

| Capability | How it works | Google Cloud |
|---|---|---|
| **Real travel times** | The location factor uses actual driving time to the client, not straight-line distance. Results are cached; if Maps is unavailable it falls back to distance and says so | Maps Routes API, called with the service's own identity (no API key) |
| **Proactive continuity** (rule E-02) | Every night Kaigo finds shifts a caregiver can't legally finish because their registration lapses first, flags them as at risk, and opens an early replanning event. Approving one opens the next | Cloud Scheduler → Cloud Run, OIDC-verified job |
| **Handover notes** | After a replacement is approved, Gemini briefs each incoming caregiver: hours, who they take over from and hand over to, the client's stated preferences. Grounding-checked against the approved plan; never clinical | Gemini |
| **Tie-break rule C-02** | When plans tie on score, fewer handovers wins, and the UI says why | — |
| **Private document storage** | Uploaded originals are stored privately, only readable by their own workspace, and deleted after 30 days | Cloud Storage (public access prevented, lifecycle rule) |

v2 runs as a separate deployment: Hosting site `kaigoai-v2`, Cloud Run service `kaigo-api-v2`, Firestore root `workspaces_v2`.

## The problem

Home-nursing and hospice agencies don't only have a "who can fill this shift?" problem. They verify credentials
by hand, translate messy family requests into staffing needs, and when a nurse cancels the night before, they
scramble. A replacement who is technically qualified may still be wrong: they've never met the patient, can only
cover half the shift, or add another handover in the middle of the night. For a patient at home or at the end of
life, that loss of continuity matters.

**Most staffing tools answer "who can fill this shift?" Kaigo asks "how do we keep care running when the situation changes?"**

## What Kaigo does

**Trust → Fit → Continuity → Human decision → Updated state**

1. **Verify.** Upload a credential. Gemini reads it into structured fields with per-field confidence and the text it
   read from. Seven deterministic rules check it: expiry, number format, eligibility, name, completeness, skill
   evidence and issuing authority. A coordinator approves.
2. **Understand the request.** "Mrs Sharma needs a wound-care nurse from 6 PM to 6 AM for the next five days"
   becomes editable, schema-validated requirements. Ambiguity ("next five days" said at 9 PM: tonight or
   tomorrow?) is flagged for the coordinator instead of guessed.
3. **Match.** Rules decide eligibility and name the rule that excluded everyone else (expired, missing skill,
   overlapping shift, unavailable). Eligible caregivers are ranked by a transparent seven-factor **Care Continuity
   Score**: qualification, skills, coverage, location, familiarity, stability and handovers. It is not a medical score.
4. **Replan when something changes.** "Hi, it's Anjali, I can't do tomorrow night." Gemini reads the message, rules
   find the affected shift and recheck every caregiver, and Kaigo builds the alternatives. For example:
   - **A:** one new nurse for the whole night.
   - **B:** a familiar nurse until midnight, then a handover.
   - **C:** the familiar nurse alone, which leaves a gap. It is shown for transparency but can't be approved.

   Gemini explains the trade-offs using only the computed facts.
5. **A person decides.** The coordinator approves, picks another option or rejects. Kaigo revalidates the plan
   against the live schedule, then updates the care state and the audit trail.

Every value in the UI shows who produced it:
- **dashed** chip: Gemini proposed it
- **solid** chip: a rule checked it
- **filled** chip: a coordinator decided it

## How Gemini is used

| Task | Input | Output (schema-validated) | Guardrail |
|---|---|---|---|
| Credential understanding | Document image / PDF | Fields, confidence, source text | Rules decide validity; <0.85 confidence → person |
| Request understanding | Coordinator's free text + today's date | Care type, skills, shift, dates, ambiguities | Ambiguous fields must be confirmed; clinical details dropped |
| Event understanding | SMS/WhatsApp text + roster | Event type, caregiver, day, confidence | Relative-date cross-check; unmatched sender → person |
| Trade-off explanation | Options + factor scores (JSON) | Summary, per-option notes, caveat | Withheld if it cites figures not in the data or contradicts the rules |
| Match explanation | Candidates + factors | One sentence per caregiver | Same grounding check |

Gemini never decides eligibility, never picks the recommended option and never changes state. Gemini is called
with the Cloud Run service account through Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI),
so there are no API keys to leak.

## Google Cloud architecture

```text
Firebase Hosting (React UI) + Firebase Auth (anonymous: one isolated workspace per visitor)
        │  /api/** rewrite                         ▲ Firestore listener (live updates)
        ▼                                          │
Cloud Run · FastAPI agents ── Gemini ── Firestore (all state) ── Cloud Logging
```

- **Firebase:** hosts the coordinator UI, signs visitors in anonymously so every judge gets their own synthetic
  agency, and streams live updates from Firestore.
- **Cloud Run:** the API and the small agents: intake, request, verification, matching, scheduling, simulation and
  continuity. They are stateless, so they scale horizontally.
- **Firestore:** caregivers, credentials, clients, requests, assignments, shifts, events, approvals, audit logs and
  AI call metrics, under `workspaces/{id}`. Security rules allow reading only your own workspace; writes go only
  through the API.
- **Gemini:** multimodal document reading, language understanding and grounded explanation, with structured output.

Details: [docs/architecture.md](docs/architecture.md).

## Responsible AI

- People approve every consequential change.
- Critical checks are deterministic code.
- Every AI output is schema-validated.
- Explanations are grounded in the rules' own numbers.
- Low-confidence cases go to a person.
- No clinical judgements.
- Everything works when Gemini is down; nothing is fabricated.

Details: [docs/responsible-ai.md](docs/responsible-ai.md).

## Evaluation (measured, not claimed)

- 34 automated tests cover every scenario in the evaluation framework: valid, expired and incomplete credentials;
  skill present or missing; availability; overlaps; cancellation; partial cover; familiar versus unfamiliar;
  no feasible replacement; approval; out-of-date options.
- `scripts/evaluate.py` scores Gemini against ground truth: 7 documents, 6 requests and 8 messages. It also
  measures latency and tokens.

Results: [docs/evaluation.md](docs/evaluation.md).

## Data

- **Synthetic:** every caregiver, client, schedule and document is fictional. The demo certificates are "issued" by
  a fictional *Demo State Nursing Council*, with a visible SYNTHETIC watermark, no seals and no signatures.
- **Public reference:** Indian nursing registration sources, cited with URLs, in
  [data/reference/nursing_registration_india.yaml](data/reference/nursing_registration_india.yaml). Synthetic
  entries are marked.

## Try it

On the dashboard, **Demo controls** gives you two ways in:
- **Start from the beginning:** verify Priya, create Mrs Sharma's request, match, assign.
- **Jump to: cancellation:** go straight to the continuity flow.

On the Continuity screen, **Use example** sends Anjali's cancellation message.

## Run, test and deploy

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --reload --port 8080
```

```bash
cd frontend && npm install && npm run dev
```

```bash
backend/.venv/bin/python -m pytest -q
```

Google Cloud setup and deployment: [docs/setup-and-deployment.md](docs/setup-and-deployment.md).

## Repository

```text
backend/    FastAPI app: api/, agents/ (intake, request, verification, matching, scheduling, simulation, continuity),
            rules/ (deterministic rules + vertical YAML), services/ (Gemini, Firestore, audit, grounding), prompts/
frontend/   React + Vite + TypeScript coordinator UI
data/       reference/ (public, cited) · synthetic/ (fictional documents + manifest)
tests/      unit/ · scenarios/ · integration/
scripts/    evaluate.py · generate_synthetic_documents.py
docs/       architecture · responsible AI · evaluation · setup and deployment
```

## Beyond the competition

The same engine extends to childcare, elder care, post-operative care and disability support by changing
configuration, not code: credential rules, skills, continuity weights and safeguarding checks. Next steps:
- agency accounts and roles
- integration with the Indian Nursing Council's NRTS and state registers
- SMS and WhatsApp event ingestion
- handover summaries
- recurring-schedule optimisation

_Built for the Google Cloud AI Builder Cup 2026. See the competition terms on ownership and licensing before any reuse._
