"""Measure Kaigo's Gemini-powered steps against fixed ground truth.

  backend/.venv/bin/python scripts/evaluate.py [--runs 1]

Needs Gemini configured (GEMINI_BACKEND=vertex + GOOGLE_CLOUD_PROJECT, or api_key) in backend/.env or the
environment. Writes eval-results/report.json and eval-results/report.md. Only measured numbers are reported.
Cost is computed only if you pass current prices (per 1M tokens) via --price-in / --price-out.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.chdir(ROOT / "backend")  # so backend/.env is picked up

import yaml  # noqa: E402

from agents.continuity.understand import interpret_message  # noqa: E402
from agents.intake.extract import extract_credential  # noqa: E402
from agents.request.extract import extract_request  # noqa: E402
from agents.simulation.explain import explain_options  # noqa: E402
from config import get_settings  # noqa: E402
from models.domain import AICall  # noqa: E402
from rules.config import normalise_credential_type  # noqa: E402
from services import clock, seed  # noqa: E402
from services.gemini import AIOutputInvalid, AIUnavailable, GeminiService  # noqa: E402
from services.repository import MemoryRepository, Store  # noqa: E402

DOCS = ROOT / "data" / "synthetic" / "documents"
CASES = yaml.safe_load((ROOT / "tests" / "scenarios" / "eval_cases.yaml").read_text())
FIELDS = ["caregiver_name", "credential_type", "registration_number", "issuing_authority", "issue_date", "valid_until"]


def fresh_store(scenario: str = "after_assignment") -> Store:
    store = Store(MemoryRepository(), "eval")
    store.put_many(seed.build(clock.today(), scenario))
    return store


def norm(field: str, value):
    if value is None:
        return None
    if field == "credential_type":
        return normalise_credential_type(str(value))
    return str(value).strip().lower()


def eval_credentials(gemini: GeminiService, store: Store) -> dict:
    manifest = json.loads((DOCS / "manifest.json").read_text())
    field_hits = field_total = status_hits = status_total = 0
    rows = []
    for doc in manifest:
        path = DOCS / doc["file"]
        try:
            cred = extract_credential(gemini, store, path.read_bytes(), "image/png", doc["file"], doc["caregiver_id"])
        except (AIUnavailable, AIOutputInvalid) as exc:
            rows.append({"doc": doc["file"], "error": str(exc)})
            continue
        expected = doc["expected"]
        conf = {e.field: e.confidence for e in cred.evidence}
        doc_hits = doc_total = 0
        for f in FIELDS:
            if f not in expected:
                continue
            got = getattr(cred.fields, f)
            got = got.isoformat() if hasattr(got, "isoformat") else got
            want = expected[f]
            if want is None:  # unreadable on purpose: correct if Gemini didn't invent a value (or flagged it)
                ok = got is None or conf.get(f, 1) < 0.85
            else:
                ok = norm(f, got) == norm(f, want)
            doc_hits += ok
            doc_total += 1
        field_hits += doc_hits
        field_total += doc_total
        status_ok = None
        if doc["expected_status"]:
            status_total += 1
            status_ok = cred.status.value == doc["expected_status"]
            status_hits += status_ok
        rows.append({"doc": doc["file"], "fields": f"{doc_hits}/{doc_total}", "status": cred.status.value,
                     "expected_status": doc["expected_status"], "status_ok": status_ok})
    return {"field_accuracy": field_hits / field_total if field_total else None, "fields_scored": field_total,
            "verification_status_accuracy": status_hits / status_total if status_total else None,
            "documents": rows}


def eval_requests(gemini: GeminiService, store: Store) -> dict:
    today = clock.today()
    hits = total = 0
    rows = []
    for case in CASES["requests"]:
        exp = case["expect"]
        try:
            req = extract_request(gemini, store, case["client_id"], case["text"])
        except (AIUnavailable, AIOutputInvalid) as exc:
            rows.append({"id": case["id"], "error": str(exc)})
            continue
        r = req.requirements
        checks = {}
        if "care_type" in exp:
            checks["care_type"] = r.care_type.value == exp["care_type"]
        if "skills" in exp:
            checks["skills"] = set(exp["skills"]) <= set(r.required_skills)
        for f in ("shift_start", "shift_end", "duration_days"):
            if f in exp:
                checks[f] = getattr(r, f) == exp[f]
        if "start_day_options" in exp:
            options = [today + timedelta(days=d) for d in exp["start_day_options"]]
            if len(options) > 1:  # genuinely ambiguous: correct if flagged for the coordinator, or a valid reading
                checks["start_date"] = "start_date" in r.needs_review or r.start_date in options
            else:
                checks["start_date"] = r.start_date == options[0]
        for f in exp.get("must_flag", []):
            checks[f"flags_{f}"] = f in r.needs_review
        if exp.get("clinical_details_omitted"):
            stored = json.dumps(req.model_dump(mode="json", exclude={"raw_text"})).lower()
            checks["no_clinical_details_stored"] = "stroke" not in stored and "diabetic " not in stored
        hits += sum(checks.values())
        total += len(checks)
        rows.append({"id": case["id"], "correct": f"{sum(checks.values())}/{len(checks)}",
                     "failed": [k for k, v in checks.items() if not v], "needs_review": r.needs_review})
    return {"field_accuracy": hits / total if total else None, "fields_scored": total, "requests": rows}


def eval_events(gemini: GeminiService, stores: list[Store]) -> dict:
    today = clock.today()
    type_hits = cg_hits = cg_total = day_hits = day_total = review_hits = review_total = 0
    rows = []
    for case in CASES["events"]:
        store = fresh_store()
        stores.append(store)
        exp = case["expect"]
        try:
            event = interpret_message(gemini, store, case["text"])
        except (AIUnavailable, AIOutputInvalid) as exc:
            rows.append({"id": case["id"], "error": str(exc)})
            continue
        p = event.parsed
        type_ok = p.event_type.value == exp["event_type"]
        type_hits += type_ok
        row = {"id": case["id"], "event_type": p.event_type.value, "type_ok": type_ok, "status": event.status}
        if "caregiver_id" in exp:
            cg_total += 1
            cg_hits += p.caregiver_id == exp["caregiver_id"]
            row["caregiver_ok"] = p.caregiver_id == exp["caregiver_id"]
        if "day" in exp:
            day_total += 1
            day_ok = p.date == today + timedelta(days=exp["day"])
            day_hits += day_ok
            row["day_ok"] = day_ok
        if "routed_to_review" in exp:
            review_total += 1
            routed = event.status == "needs_review"
            review_hits += routed == exp["routed_to_review"]
            row["review_ok"] = routed == exp["routed_to_review"]
        rows.append(row)
    n = len(CASES["events"])
    return {"event_type_accuracy": type_hits / n, "caregiver_resolution_accuracy": cg_hits / cg_total if cg_total else None,
            "day_resolution_accuracy": day_hits / day_total if day_total else None,
            "review_routing_accuracy": review_hits / review_total if review_total else None, "events": rows}


def eval_affected_assignment(gemini: GeminiService, stores: list[Store]) -> dict:
    store = fresh_store()
    stores.append(store)
    event = interpret_message(gemini, store, CASES["events"][0]["text"])
    expected = "SH-0142-02"
    found = event.affected_shift_ids[:1] == [expected]
    feasible = [o for o in event.options if o.feasible]
    return {"affected_shift_correct": found, "options_generated": len(event.options), "feasible_options": len(feasible),
            "recommended": event.recommended_option_id, "status": event.status}


def eval_explanations(gemini: GeminiService, stores: list[Store], attempts: int = 3) -> dict:
    """Grounded trade-off explanations on the hero scenario: how often they pass the grounding check."""
    passed, rows = 0, []
    for _ in range(attempts):
        store = fresh_store()
        stores.append(store)
        event = interpret_message(gemini, store, CASES["events"][0]["text"])
        try:
            explained = explain_options(gemini, store, event)
            passed += 1
            rows.append({"ok": True, "summary": explained.explanation.summary})
        except AIOutputInvalid as exc:
            rows.append({"ok": False, "withheld_because": str(exc)})
    return {"grounding_pass_rate": passed / attempts, "attempts": attempts, "samples": rows}


def summarise_calls(stores: list[Store], price_in: float | None, price_out: float | None) -> dict:
    calls = [c for s in stores for c in s.all(AICall)]
    by_task: dict[str, list[AICall]] = {}
    for c in calls:
        by_task.setdefault(c.task, []).append(c)
    out = {}
    for task, items in by_task.items():
        lat = sorted(c.latency_ms for c in items)
        tin = sum(c.input_tokens or 0 for c in items) / len(items)
        tout = sum(c.output_tokens or 0 for c in items) / len(items)
        out[task] = {"calls": len(items), "success_rate": sum(c.ok for c in items) / len(items),
                     "median_latency_s": round(statistics.median(lat) / 1000, 2),
                     "p95_latency_s": round(lat[max(0, int(len(lat) * 0.95) - 1)] / 1000, 2),
                     "avg_input_tokens": round(tin), "avg_output_tokens": round(tout)}
        if price_in is not None and price_out is not None:
            out[task]["avg_cost_usd"] = round(tin / 1e6 * price_in + tout / 1e6 * price_out, 6)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--price-in", type=float, help="USD per 1M input tokens (from the current pricing page)")
    parser.add_argument("--price-out", type=float, help="USD per 1M output tokens")
    args = parser.parse_args()

    settings = get_settings()
    gemini = GeminiService(settings)
    if not gemini.available:
        sys.exit("Gemini isn't configured. Set GEMINI_BACKEND and credentials in backend/.env first.")

    started = time.time()
    cred_store, req_store = fresh_store("fresh"), fresh_store("fresh")
    report = {
        "model": settings.gemini_model,
        "run_at": clock.now().isoformat(),
        "credentials": eval_credentials(gemini, cred_store),
        "requests": eval_requests(gemini, req_store),
    }
    event_stores: list[Store] = []
    report["events"] = eval_events(gemini, event_stores)
    report["affected_assignment"] = eval_affected_assignment(gemini, event_stores)
    report["explanations"] = eval_explanations(gemini, event_stores)
    report["ai_calls"] = summarise_calls([cred_store, req_store, *event_stores], args.price_in, args.price_out)
    report["duration_s"] = round(time.time() - started, 1)

    out = ROOT / "eval-results"
    out.mkdir(exist_ok=True)
    (out / "report.json").write_text(json.dumps(report, indent=2, default=str))
    pct = lambda v: "n/a" if v is None else f"{v * 100:.0f}%"  # noqa: E731
    lines = [
        f"# Kaigo evaluation: {report['run_at'][:16]} · model {report['model']}", "",
        "| Metric | Result |", "|---|---|",
        f"| Credential field extraction accuracy | {pct(report['credentials']['field_accuracy'])} ({report['credentials']['fields_scored']} fields) |",
        f"| Verification outcome accuracy | {pct(report['credentials']['verification_status_accuracy'])} |",
        f"| Requirement extraction accuracy | {pct(report['requests']['field_accuracy'])} ({report['requests']['fields_scored']} checks) |",
        f"| Event type detection | {pct(report['events']['event_type_accuracy'])} |",
        f"| Caregiver resolution | {pct(report['events']['caregiver_resolution_accuracy'])} |",
        f"| Day resolution | {pct(report['events']['day_resolution_accuracy'])} |",
        f"| Low-confidence routing | {pct(report['events']['review_routing_accuracy'])} |",
        f"| Affected-assignment detection | {'correct' if report['affected_assignment']['affected_shift_correct'] else 'wrong'} |",
        f"| Feasible replacements generated | {report['affected_assignment']['feasible_options']} of {report['affected_assignment']['options_generated']} options |",
        f"| Explanations passing the grounding check | {pct(report['explanations']['grounding_pass_rate'])} ({report['explanations']['attempts']} attempts) |",
        "", "| Task | Calls | Median latency | p95 | Avg tokens in/out |" + (" Avg cost |" if args.price_in else ""),
        "|---|---|---|---|---|" + ("---|" if args.price_in else ""),
    ]
    for task, t in report["ai_calls"].items():
        lines.append(f"| {task} | {t['calls']} | {t['median_latency_s']} s | {t['p95_latency_s']} s | "
                     f"{t['avg_input_tokens']} / {t['avg_output_tokens']} |" + (f" ${t['avg_cost_usd']} |" if args.price_in else ""))
    (out / "report.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
