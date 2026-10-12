"""Gemini explains trade-offs that the rules already computed. Explanations that cite facts
not in the data, or that contradict the rules' recommendation, are withheld."""

from __future__ import annotations

import json

from agents.matching.match import MatchResult
from models.ai_schemas import ExplanationOut, MatchExplanationOut
from models.domain import ActorType, Caregiver, ChangeEvent, Client, OptionExplanation
from services import audit
from services.gemini import AIOutputInvalid, GeminiService
from services.grounding import unsupported_numbers
from services.prompts import prompt
from services.repository import Store


class EventGone(Exception):
    """The change was removed while Gemini was working (e.g. the demo was reset). Nothing is written back."""


def explain_options(gemini: GeminiService, store: Store, event: ChangeEvent) -> ChangeEvent:
    if not event.options:
        raise AIOutputInvalid("There are no options to explain.")
    names = {c.id: c.name for c in store.all(Caregiver)}
    client = None
    if event.affected_shift_ids:
        from models.domain import Shift
        shift = store.get(Shift, event.affected_shift_ids[0])
        client = store.get(Client, shift.client_id) if shift else None
    facts = {
        "client": client.name if client else None,
        "situation": event.impact_summary,
        "recommended": event.recommended_option_id,
        "why_recommended": event.recommendation_note,
        "options": [{
            "id": o.id, "title": o.title, "feasible": o.feasible, "total_score": o.total,
            "max_score": sum(f.max_points for f in o.factors),
            "caregivers": [names.get(c, c) for c in o.caregiver_ids],
            "segments": [f"{names.get(s.caregiver_id, 'uncovered') if s.caregiver_id else 'uncovered'} "
                         f"{s.start:%H:%M}-{s.end:%H:%M}" for s in o.segments],
            "factors": [{"factor": f.label, "points": f.points, "max": f.max_points, "detail": f.detail}
                        for f in o.factors],
            "pros": o.pros, "cons": o.cons,
            "rule_violations": [v.detail for v in o.violations],
        } for o in event.options],
    }
    facts_text = json.dumps(facts, ensure_ascii=False)
    out = gemini.structured("option_explanation", ExplanationOut,
                            ["Explain these staffing options:\n" + facts_text],
                            system=prompt("option_explanation"), store=store)

    valid_ids = {o.id for o in event.options}
    text = " ".join([out.summary, out.caveat or "", *(n.explanation for n in out.options)])
    stray = unsupported_numbers(text, facts_text, [o.total for o in event.options])
    if any(n.option_id not in valid_ids for n in out.options):
        raise AIOutputInvalid("The explanation referred to an option that doesn't exist, so it was withheld.")
    if stray:
        raise AIOutputInvalid(f"The explanation included figures not in the data ({', '.join(sorted(stray))}), "
                              "so it was withheld.")

    event.explanation = OptionExplanation(summary=out.summary, per_option={n.option_id: n.explanation for n in out.options},
                                          caveat=out.caveat)
    # Gemini takes a few seconds. If the change disappeared meanwhile, saving would bring it back from the dead.
    if store.get(ChangeEvent, event.id) is None:
        raise EventGone("This change no longer exists, so the explanation was discarded.")
    store.put(event)
    audit.record(store, ActorType.AI, "Gemini", "event.explained",
                 f"Explained trade-offs between {len(event.options)} options (grounding check passed)", "event", event.id)
    return event


def explain_matches(gemini: GeminiService, store: Store, result: MatchResult) -> dict[str, str]:
    if not result.candidates:
        return {}
    facts = [{
        "caregiver_id": c.caregiver_id, "name": c.name, "total_score": c.total,
        "nights_fully_covered": f"{c.nights_full} of {c.nights_total}", "previous_visits": c.previous_visits,
        "distance_km": c.distance_km,
        "factors": [{"factor": f.label, "points": f.points, "max": f.max_points, "detail": f.detail} for f in c.factors],
    } for c in result.candidates[:5]]
    facts_text = json.dumps(facts, ensure_ascii=False)
    out = gemini.structured("match_explanation", MatchExplanationOut,
                            ["Explain each candidate:\n" + facts_text], system=prompt("match_explanation"), store=store)
    valid = {c.caregiver_id for c in result.candidates}
    notes = {n.caregiver_id: n.explanation for n in out.candidates if n.caregiver_id in valid}
    stray = unsupported_numbers(" ".join(notes.values()), facts_text, [c.total for c in result.candidates])
    if stray:
        raise AIOutputInvalid(f"Explanations included figures not in the data ({', '.join(sorted(stray))}), "
                              "so they were withheld.")
    audit.record(store, ActorType.AI, "Gemini", "match.explained",
                 f"Explained {len(notes)} candidate matches (grounding check passed)", "care_request", result.request_id)
    return notes
