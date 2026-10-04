"""Care Continuity Score: a transparent, operational score for comparing staffing plans.

Seven factors, each with a fixed maximum set per vertical. Not a medical or clinical score.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime

from models.domain import Caregiver, Client, Factor, Location
from rules.config import VerticalConfig, skill_label
from rules.scheduling import Interval, intersect, merge, total_hours

FACTOR_META = {
    "qualification": ("Qualification", "trust"),
    "skills": ("Skills", "fit"),
    "coverage": ("Coverage", "fit"),
    "location": ("Location", "fit"),
    "familiarity": ("Familiarity", "continuity"),
    "stability": ("Stability", "continuity"),
    "handoffs": ("Handoffs", "continuity"),
}
FACTOR_ORDER = ["qualification", "skills", "coverage", "location", "familiarity", "stability", "handoffs"]


@dataclass
class Piece:
    """A stretch of time a caregiver would work in a plan."""
    caregiver: Caregiver
    start: datetime
    end: datetime


def straight_line_km(a: Location, b: Location) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


distance_km = straight_line_km  # backwards-compatible name


def familiarity_share(visits: int, config: VerticalConfig) -> float:
    return min(visits, config.familiarity_full_at_visits) / config.familiarity_full_at_visits


def location_share(km: float, config: VerticalConfig) -> float:
    full, zero = config.location_full_within_km, config.location_zero_at_km
    if km <= full:
        return 1.0
    return max(0.0, 1 - (km - full) / (zero - full))


def travel_share(minutes: float, config: VerticalConfig) -> float:
    full, zero = config.travel_full_within_min, config.travel_zero_at_min
    if minutes <= full:
        return 1.0
    return max(0.0, 1 - (minutes - full) / (zero - full))


def _points(weight: int, share: float) -> int:
    return int(weight * max(0.0, min(1.0, share)) + 0.5)


def score_plan(
    pieces: list[Piece],
    demand: list[Interval],
    client: Client,
    config: VerticalConfig,
    required_skills: list[str],
    work_until: date,
    extra_handoffs: int,
    travel: dict | None = None,
) -> list[Factor]:
    w = config.weights
    demand = merge(demand)
    demand_hours = total_hours(demand)

    # Hours each caregiver actually works inside the demanded time.
    worked: dict[str, float] = {}
    by_id: dict[str, Caregiver] = {}
    covered: list[Interval] = []
    for piece in pieces:
        for d in demand:
            part = intersect((piece.start, piece.end), d)
            if part:
                covered.append(part)
                worked[piece.caregiver.id] = worked.get(piece.caregiver.id, 0.0) + total_hours([part])
                by_id[piece.caregiver.id] = piece.caregiver
    covered_hours = total_hours(covered)
    coverage = covered_hours / demand_hours if demand_hours else 0.0
    people = [by_id[cid] for cid in worked]

    # Trust: every credential in date beyond the end of the work, with a renewal margin.
    qual_share, qual_detail = 1.0, "All credentials verified and in date"
    for cg in people:
        if cg.credential_valid_until and (cg.credential_valid_until - work_until).days < config.expiry_warning_days:
            qual_share = 0.75
            qual_detail = f"{cg.name.split()[0]}'s registration expires soon after this work"

    skills_detail = ("Required skills evidenced: " + ", ".join(skill_label(s) for s in required_skills)
                     if required_skills else "No specialist skills required")

    def weighted(fn) -> float:
        if not covered_hours:
            return 0.0
        return sum(worked[cg.id] * fn(cg) for cg in people) / covered_hours

    fam = weighted(lambda cg: familiarity_share(client.visit_history.get(cg.id, 0), config))
    fam_detail = "; ".join(
        f"{cg.name.split()[0]}: {client.visit_history.get(cg.id, 0) or 'no'} previous visit"
        f"{'' if client.visit_history.get(cg.id, 0) == 1 else 's'}" for cg in people) or "Nobody assigned"

    travel = travel or {}

    def place_share(cg: Caregiver) -> float:
        est = travel.get(cg.id)
        if est is not None and est.minutes is not None:
            return travel_share(est.minutes, config)
        return location_share(est.km if est else straight_line_km(cg.location, client.location), config)

    def place_text(cg: Caregiver) -> str:
        est = travel.get(cg.id)
        if est is not None and est.minutes is not None:
            return f"{cg.name.split()[0]} {est.minutes:.0f} min by road"
        km = est.km if est else straight_line_km(cg.location, client.location)
        return f"{cg.name.split()[0]} {km:.1f} km away (straight line)"

    loc = weighted(place_share)
    loc_detail = "; ".join(place_text(cg) for cg in people) or "Nobody assigned"

    if len(people) == 1:
        stab_share = coverage
        stab_detail = ("One caregiver for the whole period" if coverage >= 0.999
                       else "One caregiver, but someone else is needed for the gaps")
    elif len(people) == 2:
        stab_share, stab_detail = 0.6, "Two caregivers share the work"
    else:
        stab_share, stab_detail = (0.3, f"{len(people)} caregivers share the work") if people else (0.0, "Nobody assigned")

    hand_share = {0: 1.0, 1: 0.4}.get(extra_handoffs, 0.0)
    hand_detail = ("No extra handovers" if extra_handoffs == 0
                   else f"{extra_handoffs} extra handover{'s' if extra_handoffs > 1 else ''} during care")

    cov_detail = f"{covered_hours:g} of {demand_hours:g} hours covered"

    values = {
        "qualification": (qual_share, qual_detail),
        "skills": (1.0, skills_detail),
        "coverage": (coverage, cov_detail),
        "location": (loc, loc_detail),
        "familiarity": (fam, fam_detail),
        "stability": (stab_share, stab_detail),
        "handoffs": (hand_share, hand_detail),
    }
    factors = []
    for key in FACTOR_ORDER:
        share, detail = values[key]
        label, layer = FACTOR_META[key]
        factors.append(Factor(key=key, label=label, layer=layer, points=_points(w[key], share),
                              max_points=w[key], detail=detail))
    return factors
