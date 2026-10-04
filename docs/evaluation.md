# Evaluation

Only measured numbers are reported here. Nothing is estimated.

## 1. Deterministic workflow tests

`backend/.venv/bin/python -m pytest -q` runs 35 tests covering the README's functional scenarios:

| Scenario | Test |
|---|---|
| Valid credential | `test_valid_credential_is_ready_for_approval` |
| Expired credential | `test_expired_credential_is_blocked`, matching exclusion V-01 |
| Incomplete / unreadable credential | `test_incomplete_credential_needs_review`, `test_low_confidence_value_goes_to_a_person` |
| Required skill present / missing | `test_matching_ranks_familiar_caregiver_first_and_explains_exclusions` (M-02) |
| Available / unavailable caregiver | same test (S-02) |
| Overlapping shift | same test (S-01) |
| Caregiver cancellation | `test_cancellation_detects_impact_and_builds_tradeoff_options` |
| Partial-coverage alternative | same test (partial option fails rule C-01) |
| Familiar vs unfamiliar caregiver | same test (familiarity points differ) |
| No feasible replacement | `test_no_feasible_replacement` |
| Human approval updates state | `test_approval_updates_state_version_and_audit` |
| Stale options refused | `test_stale_option_is_refused_and_refreshed` |
| Low-confidence event | `test_low_confidence_event_waits_for_a_person` |
| Works without Gemini | `tests/integration/test_api.py` |
| Ambiguous start date flagged by rule R-01 | `test_rule_r01_relative_window_without_start_is_ambiguous` |

**Result:** 35 / 35 passing (4 Oct 2026).

## 2. Gemini quality against ground truth

`backend/.venv/bin/python scripts/evaluate.py --price-in <USD/1M> --price-out <USD/1M>` scores:

- **Credential extraction:** 7 synthetic documents with known field values, including an expired registration, a
  smudged expiry date, an unknown council and a non-credential. Measures field accuracy and verification outcome.
- **Requirement extraction:** 6 requests, including ambiguous dates, clinical details that must be dropped, and a
  request missing times.
- **Event understanding:** 8 messages measuring event type, caregiver resolution, day resolution and review routing.
- **Affected-assignment detection** and **feasible replacement generation** on the hero scenario.
- **Latency and tokens** per task, with cost only if you pass current prices.

### Results: 4 Oct 2026, `gemini-3.8-flash` on Google Cloud (Agent Platform, global endpoint), thinking level LOW, 3 independent runs

| Metric | Run 1 | Run 2 | Run 3 | Sample per run |
|---|---|---|---|---|
| Credential field extraction accuracy | 100% | 100% | 100% | 31 fields, 7 documents |
| Verification outcome accuracy (rules after extraction) | 100% | 100% | 100% | 6 documents |
| Requirement extraction accuracy | 100% | 100% | 100% | 34 checks, 6 requests |
| Event type detection | 100% | 100% | 100% | 8 messages |
| Caregiver resolution | 100% | 100% | 100% | 7 messages |
| Day resolution | 100% | 100% | 100% | 7 messages |
| Low-confidence routing | 100% | 100% | 100% | 5 messages |
| Affected-assignment detection (hero scenario) | correct | correct | correct | 1 |
| Feasible replacements generated | 2 of 3 | 2 of 3 | 2 of 3 | the third option is the partial plan, shown for transparency |
| Explanations passing the grounding check | 3 / 3 | 3 / 3 | 3 / 3 | 3 attempts |

Notable cases handled correctly in every run:
- The smudged expiry date came back as unreadable instead of being invented.
- The handover note was recognised as not a credential.
- The unknown council was routed to review.
- The diagnosis in R5 ("stroke", "diabetic") was not stored.
- "Hey, can't come tomorrow" with no name went to a person.
- "The day after tomorrow, but tomorrow is fine" resolved to the right day.

| Task | Median latency (runs 1 / 2 / 3) | Avg tokens in / out |
|---|---|---|
| Credential extraction (image) | 4.7 s / 5.2 s / 6.7 s | 2,618 / ~285 |
| Request extraction | 2.7 s / 4.0 s / 3.5 s | 1,011 / ~210 |
| Event understanding | 2.1 s / 2.1 s / 2.2 s | 659 / 93 |
| Trade-off explanation | 2.8 s / 3.1 s / 2.6 s | 1,619 / ~250 |

One full replanning workflow (read the message, explain the options) uses about 2,300 input and 340 output
tokens. A full end-to-end demo (credential, request, message, explanation) uses about 5,900 input and 840 output
tokens. To turn this into a cost, multiply by current Gemini pricing; we don't quote a price we haven't checked.

**Design note from these measurements.** With the model's default reasoning level, request extraction took 15.9 s;
at MEDIUM, 25.2 s; at LOW, about 3 s. At LOW the model sometimes missed the ambiguity in "the next five days", so
that check is now a deterministic rule (R-01) rather than relying on model reasoning. The app is fast and safe
because rules, not model reasoning, guard the critical paths.

**Limits.** These are small, hand-built synthetic test sets (31 fields, 6 requests, 8 messages). They show the
workflow works reliably on the cases it was designed for. They don't establish accuracy on real-world documents,
which would need a larger, independently labelled set.
