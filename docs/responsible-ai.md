# Responsible AI

Kaigo is a care-operations product. AI assists; people decide. These are enforced in code, not just in policy.

| Principle | How it's enforced | Where |
|---|---|---|
| Human approval for consequential actions | Credential approval, assignment and replacement only happen through a coordinator's explicit action; each writes an audit entry with actor type `human` | `agents/verification/verify.py`, `agents/matching/match.py`, `agents/continuity/replan.py` |
| Deterministic critical logic | Expiry, eligibility, skills evidence, availability, overlaps, rest periods and full coverage are plain code with unit tests. Gemini never decides eligibility or picks the recommended plan | `rules/`, `agents/scheduling`, `agents/simulation/options.py` |
| Schema-constrained AI | Every call uses a Pydantic response schema (Gemini structured output) and is validated before use; one retry, then routed to a person | `services/gemini.py`, `models/ai_schemas.py` |
| Grounded explanations | Option and match explanations get the rules' facts as JSON; any number in the text that isn't in those facts makes the explanation get withheld; option IDs must exist | `agents/simulation/explain.py`, `services/grounding.py` |
| Low confidence goes to people | Credential fields under 0.85 confidence, ambiguous request fields and low-confidence or unmatched messages are flagged; nothing changes automatically | `rules/verification.py` V-05, `agents/request/extract.py`, `agents/continuity/replan.py` |
| Relative-date cross-check | "tomorrow" / "tonight" in a message must agree with the date Gemini resolved, or confidence is capped below the review threshold | `agents/continuity/understand.py` |
| No medical diagnosis | Prompts forbid clinical content; requests drop diagnoses (`clinical_details_omitted`); the score is labelled operational everywhere | `prompts/`, UI copy |
| Explainability | Every score shows seven factors with points, maximum and a plain-English detail; every exclusion names the rule | `rules/scoring.py`, Match and Replan screens |
| Provenance | UI marks every value as Gemini-proposed (dashed), rule-checked (solid) or human-decided (filled) | `frontend/src/components/ui.tsx` |
| Auditability | Audit trail of AI outputs, rule results and decisions; AI call log with latency and token counts | `services/audit.py`, `ai_calls` collection |
| Failure without fabrication | If Gemini is unavailable the UI says so and offers manual entry; no placeholder AI text is ever shown | `services/gemini.py`, `api` error handlers |
| Privacy | Synthetic people and documents only; uploaded files are processed in memory and not stored; real credentials must not be uploaded (stated in the UI) | `data/synthetic`, `api/routes.py` |
| Isolation | Each visitor's workspace is separate; Firestore rules allow reading only your own workspace; writes only via the API | `firestore.rules`, `api/deps.py` |

## Known limitations

- Self-reported model confidence isn't calibrated. It is one signal, combined with deterministic validation
  (date parsing, number formats, authority lookup) and measured against ground truth in `docs/evaluation.md`.
- The prototype doesn't query live registries. Production would integrate with the Indian Nursing Council's NRTS
  and state council registers, with verification history.
- The continuity score's weights are operational judgements, set per vertical in YAML. They should be tuned with
  agencies and reviewed for bias (for example, location weighting must not disadvantage caregivers from particular areas).
