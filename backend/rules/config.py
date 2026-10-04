"""Loads per-vertical configuration. The engine is shared; verticals differ only in config."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

from models.domain import Vertical

VERTICALS_DIR = Path(__file__).parent / "verticals"


@dataclass(frozen=True)
class VerticalConfig:
    vertical: Vertical
    label: str
    accepted_credential_types: tuple[str, ...]
    required_fields: tuple[str, ...]
    expiry_warning_days: int
    evidence_required_skills: tuple[str, ...]
    default_required_skills: tuple[str, ...]
    min_rest_hours: float
    max_shift_hours: float
    weights: dict[str, int]
    familiarity_full_at_visits: int
    location_full_within_km: float
    location_zero_at_km: float
    travel_full_within_min: float
    travel_zero_at_min: float
    ai_confidence_threshold: float
    require_full_coverage: bool


@lru_cache
def load_vertical(vertical: Vertical | str) -> VerticalConfig:
    vertical = Vertical(vertical)
    raw = yaml.safe_load((VERTICALS_DIR / f"{vertical.value}.yaml").read_text())
    continuity = raw["continuity"]
    return VerticalConfig(
        vertical=vertical,
        label=raw["label"],
        accepted_credential_types=tuple(raw["credentials"]["accepted_types"]),
        required_fields=tuple(raw["credentials"]["required_fields"]),
        expiry_warning_days=int(raw["credentials"]["expiry_warning_days"]),
        evidence_required_skills=tuple(raw["skills"]["evidence_required"]),
        default_required_skills=tuple(raw["skills"].get("default_required", [])),
        min_rest_hours=float(raw["scheduling"]["min_rest_hours"]),
        max_shift_hours=float(raw["scheduling"]["max_shift_hours"]),
        weights={k: int(v) for k, v in continuity["weights"].items()},
        familiarity_full_at_visits=int(continuity["familiarity_full_at_visits"]),
        location_full_within_km=float(continuity["location_full_within_km"]),
        location_zero_at_km=float(continuity["location_zero_at_km"]),
        travel_full_within_min=float(continuity["travel_full_within_min"]),
        travel_zero_at_min=float(continuity["travel_zero_at_min"]),
        ai_confidence_threshold=float(raw["review"]["ai_confidence_threshold"]),
        require_full_coverage=bool(raw["review"]["require_full_coverage"]),
    )


SKILL_LABELS = {
    "wound_care": "wound care",
    "iv_therapy": "IV therapy",
    "palliative_care": "palliative care",
    "tracheostomy_care": "tracheostomy care",
    "catheter_care": "catheter care",
    "medication_administration": "medication administration",
    "post_operative_care": "post-operative care",
    "diabetic_care": "diabetic care",
    "elderly_care": "elderly care",
    "family_communication": "family communication",
    "mobility_assistance": "mobility assistance",
}

# Free-text phrases Gemini or a coordinator may use, mapped to the skill catalogue.
SKILL_SYNONYMS = {
    "wound": "wound_care", "wound care": "wound_care", "wound-care": "wound_care", "dressing": "wound_care",
    "iv": "iv_therapy", "iv therapy": "iv_therapy", "intravenous": "iv_therapy", "cannula": "iv_therapy",
    "palliative": "palliative_care", "palliative care": "palliative_care", "end of life": "palliative_care",
    "hospice": "palliative_care",
    "tracheostomy": "tracheostomy_care", "catheter": "catheter_care",
    "medication": "medication_administration", "injections": "medication_administration",
    "post-op": "post_operative_care", "post operative": "post_operative_care", "post-operative": "post_operative_care",
    "diabetic": "diabetic_care", "diabetes": "diabetic_care", "insulin": "diabetic_care",
    "elderly": "elderly_care", "geriatric": "elderly_care",
    "family communication": "family_communication", "counselling": "family_communication",
    "mobility": "mobility_assistance",
}


def normalise_skill(text: str) -> str | None:
    key = text.strip().lower().replace("_", " ")
    if key.replace(" ", "_") in SKILL_LABELS:
        return key.replace(" ", "_")
    if key in SKILL_SYNONYMS:
        return SKILL_SYNONYMS[key]
    hits = [phrase for phrase in SKILL_SYNONYMS if phrase in key]
    return SKILL_SYNONYMS[max(hits, key=len)] if hits else None


def skill_label(skill: str) -> str:
    return SKILL_LABELS.get(skill, skill.replace("_", " "))


def normalise_credential_type(text: str | None) -> str | None:
    if not text:
        return None
    t = text.upper().replace("&", "AND").replace(".", "").strip()
    if t in {"RN", "RN-RM", "RNRM", "ANM", "GNM"}:
        return "RN-RM" if t == "RNRM" else t
    if "MIDWIFE" in t and "NURSE" in t:
        return "RN-RM"
    if "REGISTERED NURSE" in t:
        return "RN"
    if "AUXILIARY" in t:
        return "ANM"
    return text.strip()
