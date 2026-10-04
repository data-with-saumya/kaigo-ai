# Architecture

```text
            Coordinator's browser
                    │  HTTPS
                    ▼
 ┌──────────────────────────────────────┐
 │ Firebase Hosting   React + Vite UI   │──── Firebase Auth (anonymous): one isolated workspace per visitor
 │  /api/** rewrite ──► Cloud Run       │◄─── Firestore listener (read-only, own workspace) → live updates
 └──────────────────┬───────────────────┘
                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ Cloud Run  ·  FastAPI  ·  service account "kaigo-api"             │
 │                                                                  │
 │  api/routes ── validation, error mapping, Firebase ID-token check │
 │  agents/                                                         │
 │    intake ─────── Gemini: document → credential fields           │
 │    verification ─ rules V-01…V-07 + coordinator approval         │
 │    request ────── Gemini: plain language → requirements          │
 │    matching ───── rules M-01…M-04, S-01…S-03 + continuity score   │
 │    scheduling ─── availability, overlaps, rest periods           │
 │    simulation ─── replacement plans (single / split / partial)   │
 │    continuity ─── Gemini: message → event; impact; decide; apply │
 │  services/ gemini · repository · audit · grounding · reference   │
 │  rules/    deterministic rules + per-vertical YAML                │
 └───────┬──────────────────────┬──────────────────────┬────────────┘
         ▼                      ▼                      ▼
   Gemini (Agent Platform,   Firestore              Cloud Logging
   formerly Vertex AI)       workspaces/{uid}/…     structured JSON logs
   structured output only    all operational state
```

## Components

| Component | Responsibility | AI? |
|---|---|---|
| Intake (`agents/intake`) | Reads credential images/PDFs into fields with per-field confidence and source text | Gemini (multimodal, schema) |
| Verification (`agents/verification`, `rules/verification.py`) | Expiry, number format, eligibility, name match, completeness, skill evidence, authority recognition; applies coordinator decisions | Rules only |
| Request (`agents/request`) | Turns a coordinator's request into requirements; flags ambiguity; drops clinical detail | Gemini + rules (priority, credentials, location) |
| Matching (`agents/matching`) | Eligibility with the rule that excluded each person; continuity score; assignment | Rules only (Gemini optionally explains) |
| Scheduling (`agents/scheduling`) | Free time = availability − existing shifts ± rest period; explains unavailability | Rules only |
| Simulation (`agents/simulation`) | Generates single, split and partial plans for an uncovered shift; scores and ranks; Gemini explains trade-offs | Rules + Gemini (explanation only) |
| Continuity (`agents/continuity`) | Message → structured event; affected shifts; options; coordinator decision; revalidation; optimistic locking; state update | Gemini (event reading) + rules |
| Audit (`services/audit.py`) | Every AI proposal, rule result and human decision, with actor type | — |

The components are functions behind one API, not separate agents negotiating with each other. That keeps the
workflow deterministic, testable and cheap, and each component can be split into its own service later.

## State (Firestore)

`workspaces/{workspace_id}/` holds `caregivers`, `credentials`, `clients`, `care_requests`, `assignments`, `shifts`,
`events`, `approvals`, `audit_logs` and `ai_calls`. In the demo the workspace is the visitor's anonymous Firebase UID,
so every judge gets their own synthetic agency. In production a workspace is an agency (multi-tenant by design).

Writes go only through the API (Admin SDK, least-privilege service account). Firestore security rules let a
signed-in user read only their own workspace. The UI uses that read access for live updates.

## Key flows

**Cancellation → approved replacement.** Gemini reads the message into a structured event. A rule cross-checks
relative dates ("tomorrow") against today. Events below 0.85 confidence, or with an unmatched sender, stop at
"needs a person". Otherwise rule S-04 finds the caregiver's shifts on that day and marks them uncovered. The
simulation agent rechecks every caregiver (credentials, skills, availability, overlaps, rest) and builds plans. The
coordinator approves; the plan is revalidated against live state (optimistic lock on the assignment version), then
the shift, assignment version, decision and audit entry are written.

## Failure handling

| Failure | Behaviour |
|---|---|
| Gemini not configured or down | `AIUnavailable` → HTTP 503 with a clear message; UI shows "Gemini unavailable"; manual entry paths for credentials, requests and events; matching and replanning unaffected |
| Gemini returns invalid JSON or schema | One retry, then `AIOutputInvalid` → HTTP 422 → routed to a person |
| Explanation cites figures not in the data | Withheld (`services/grounding.py`) |
| Schedule changed between proposal and approval | HTTP 409 with freshly generated options |
| Unexpected server error | Logged with stack trace; user sees "your data is unchanged" |

## Scaling path

- Cloud Run scales horizontally; agents are stateless (state lives in Firestore).
- Matching is O(caregivers × shifts) per request: fine for agencies with hundreds of caregivers. Next steps are
  Firestore queries scoped by date range and vertical, then a precomputed availability index.
- Document processing, notifications and event ingestion (Pub/Sub from SMS/WhatsApp providers) can split into
  their own Cloud Run services without changing the domain model.
