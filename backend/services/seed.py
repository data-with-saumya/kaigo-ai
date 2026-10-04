"""Synthetic demo agency. Every person, document and number here is fictional.

Dates are anchored to the day the workspace is created, so the demo always reads
"tonight" and "tomorrow" correctly, whenever a judge opens it.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from pydantic import BaseModel

from models.domain import (
    ActorType,
    Assignment,
    AuditEntry,
    Caregiver,
    CareRequest,
    Client,
    Credential,
    CredentialFields,
    FieldEvidence,
    Location,
    Requirements,
    Segment,
    Shift,
    SkillClaim,
    VerificationStatus,
    Vertical,
    Window,
)
from rules.config import load_vertical
from rules.verification import run_checks, status_from_checks
from services import clock
from services.reference import load_reference

SCENARIOS = ("fresh", "after_assignment")

JAYANAGAR = (12.9250, 77.5938)
AUTHORITY = "Demo State Nursing Council"

RAHUL_EXPIRY = date(2026, 8, 14)  # matches his synthetic certificate; expired throughout the competition


def SANA_EXPIRY(d: date) -> date:  # noqa: N802
    """Sana's registration lapses partway through Lakshmi Pillai's visits: the expiry monitor's story."""
    return d + timedelta(days=3)


POST_OP_NURSES = {"CG-0112", "CG-0115"}  # day nurses with evidenced post-operative care
ANJALI, PRIYA, DEEPA, RAHUL, KIRAN, SANA, FATIMA = (
    "CG-0101", "CG-0107", "CG-0103", "CG-0104", "CG-0105", "CG-0106", "CG-0108")
MEERA, IYER, PILLAI = "CL-0031", "CL-0027", "CL-0019"


def _near(dx_km: float, dy_km: float, area: str) -> Location:
    """A point dx km east and dy km north of the Jayanagar client."""
    return Location(area=area, lat=round(JAYANAGAR[0] + dy_km / 110.57, 5),
                    lng=round(JAYANAGAR[1] + dx_km / 108.5, 5))


def _skills(*items: tuple[str, bool, str | None]) -> list[SkillClaim]:
    return [SkillClaim(skill=s, evidenced=e, evidence=src) for s, e, src in items]


def build(anchor: date, scenario: str = "fresh") -> list[BaseModel]:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario {scenario!r}")
    d = anchor
    start_of_horizon = clock.at(d - timedelta(days=3), "00:00")
    end_of_horizon = clock.at(d + timedelta(days=14), "00:00")
    always = [Window(start=start_of_horizon, end=end_of_horizon)]

    def days_only(hhmm_from: str = "08:00", hhmm_to: str = "16:00") -> list[Window]:
        return [Window(start=clock.at(d + timedelta(days=i), hhmm_from), end=clock.at(d + timedelta(days=i), hhmm_to))
                for i in range(-2, 14)]

    after = scenario == "after_assignment"
    v = Vertical.HOME_NURSING

    caregivers = [
        Caregiver(id=ANJALI, name="Anjali Rao", credential_type="RN", years_experience=9,
                  skills=_skills(("wound_care", True, "Wound-care training record"),
                                 ("medication_administration", True, None), ("diabetic_care", True, None)),
                  location=_near(2.5, -1.85, "BTM Layout"), verticals=[v], availability=always,
                  credential_id="CRD-0101", credential_valid_until=d + timedelta(days=900),
                  verification_status=VerificationStatus.VERIFIED),
        Caregiver(id=PRIYA, name="Priya Nair", credential_type="RN-RM", years_experience=5,
                  skills=_skills(("wound_care", True, "wound-care-training.png"), ("iv_therapy", True, "IV therapy course record"),
                                 ("palliative_care", False, None)),
                  location=_near(-5.1, 3.9, "Vijayanagar"), verticals=[v, Vertical.HOSPICE], availability=always,
                  credential_id="CRD-0107" if after else None,
                  credential_valid_until=date(2027, 6, 11) if after else None,
                  verification_status=VerificationStatus.VERIFIED if after else VerificationStatus.PENDING),
        Caregiver(id=DEEPA, name="Deepa Kurian", credential_type="RN", years_experience=7,
                  skills=_skills(("wound_care", True, "Wound-care training record"), ("elderly_care", True, None)),
                  location=_near(1.0, -1.96, "JP Nagar"), verticals=[v],
                  # Free tonight; tomorrow only until midnight; not the night after; then two full nights.
                  availability=[Window(start=start_of_horizon, end=clock.at(d + timedelta(days=1), "08:00")),
                                Window(start=clock.at(d + timedelta(days=1), "12:00"), end=clock.at(d + timedelta(days=2), "00:00")),
                                Window(start=clock.at(d + timedelta(days=3), "08:00"), end=end_of_horizon)],
                  credential_id="CRD-0103", credential_valid_until=d + timedelta(days=600),
                  verification_status=VerificationStatus.VERIFIED),
        Caregiver(id=RAHUL, name="Rahul Menon", credential_type="RN", years_experience=6,
                  skills=_skills(("wound_care", True, "Wound-care training record")),
                  location=_near(3.4, 1.2, "Koramangala"), verticals=[v], availability=always,
                  credential_id="CRD-0104", credential_valid_until=RAHUL_EXPIRY,
                  verification_status=VerificationStatus.BLOCKED),
        Caregiver(id=KIRAN, name="Kiran D'Souza", credential_type="RN", years_experience=11,
                  skills=_skills(("palliative_care", True, "Palliative care certificate"),
                                 ("family_communication", True, "Communication course record"),
                                 ("wound_care", True, "Wound-care training record")),
                  location=Location(area="Malleshwaram", lat=13.0035, lng=77.5710), verticals=[v, Vertical.HOSPICE],
                  availability=always, credential_id="CRD-0105", credential_valid_until=d + timedelta(days=700),
                  verification_status=VerificationStatus.VERIFIED),
        Caregiver(id=SANA, name="Sana Sheikh", credential_type="RN", years_experience=4,
                  skills=_skills(("post_operative_care", True, None), ("mobility_assistance", True, None),
                                 ("wound_care", False, None)),
                  location=Location(area="Indiranagar", lat=12.9784, lng=77.6408), verticals=[v], availability=always,
                  credential_id="CRD-0106", credential_valid_until=SANA_EXPIRY(d),
                  verification_status=VerificationStatus.VERIFIED),
        Caregiver(id=FATIMA, name="Fatima Khan", credential_type="RN", years_experience=3,
                  skills=_skills(("elderly_care", True, None)),
                  location=_near(-4.0, 0.1, "Banashankari"), verticals=[v], availability=always,
                  credential_id="CRD-0108", credential_valid_until=None,
                  verification_status=VerificationStatus.NEEDS_REVIEW),
    ]
    day_nurses = [
        ("CG-0110", "Neha Joshi", "Basavanagudi", (-1.6, 1.5)),
        ("CG-0111", "Vikram Shetty", "HSR Layout", (5.5, -2.6)),
        ("CG-0112", "Asha Thomas", "Wilson Garden", (1.2, 2.4)),
        ("CG-0113", "Rohan Das", "Shanthinagar", (1.4, 3.6)),
        ("CG-0114", "Kavya Hegde", "Padmanabhanagar", (-3.0, -2.2)),
        ("CG-0115", "Imran Qureshi", "Richmond Town", (2.2, 4.8)),
    ]
    for cid, name, area, (dx, dy) in day_nurses:
        extra = [("post_operative_care", True, "Post-operative care course record")] if cid in POST_OP_NURSES else []
        caregivers.append(Caregiver(
            id=cid, name=name, credential_type="RN", years_experience=5,
            skills=_skills(("wound_care", True, "Wound-care training record"), ("elderly_care", True, None), *extra),
            location=_near(dx, dy, area), verticals=[v], availability=days_only(),
            credential_id=None, credential_valid_until=d + timedelta(days=500),
            verification_status=VerificationStatus.VERIFIED))

    clients = [
        Client(id=MEERA, name="Meera Sharma", location=Location(area="Jayanagar", lat=JAYANAGAR[0], lng=JAYANAGAR[1]),
               vertical=v, prefer_familiar=True, visit_history={ANJALI: 4, DEEPA: 3},
               care_notes="Prefers caregivers she already knows. Family visits most evenings."),
        Client(id=IYER, name="Ramesh Iyer", location=Location(area="Malleshwaram", lat=13.0031, lng=77.5643),
               vertical=Vertical.HOSPICE, prefer_familiar=True, visit_history={KIRAN: 6},
               care_notes="Family would like the same night nurse wherever possible."),
        Client(id=PILLAI, name="Lakshmi Pillai", location=Location(area="Indiranagar", lat=12.9719, lng=77.6412),
               vertical=v, prefer_familiar=False, visit_history={SANA: 3, "CG-0115": 2},
               care_notes="Prefers morning visits. A family member is at home until 08:00."),
    ]

    records: list[BaseModel] = [*caregivers, *clients]
    records += _credentials(d, after, {c.id: c for c in caregivers})
    records += _assignment(
        "0127", IYER, Vertical.HOSPICE, KIRAN, ["palliative_care"], ["RN", "RN-RM"],
        [d + timedelta(days=i) for i in range(-2, 7)], "20:00", "08:00", created=clock.at(d - timedelta(days=3), "16:20"))
    records += _assignment(
        "0119", PILLAI, v, SANA, ["post_operative_care"], ["RN", "RN-RM"],
        [d + timedelta(days=i) for i in range(1, 6)], "08:00", "14:00", created=clock.at(d - timedelta(days=4), "11:00"))
    records.append(CareRequest(
        id="CR-0150", client_id=IYER,
        raw_text="Mr Iyer's family would like someone to sit with him on weekend afternoons.",
        requirements=Requirements(
            care_type=Vertical.HOSPICE, required_credentials=["RN", "RN-RM"], required_skills=["palliative_care"],
            shift_start="14:00", shift_end="20:00", start_date=d + timedelta(days=(5 - d.weekday()) % 7 or 7),
            duration_days=2, location_area="Malleshwaram", prefer_familiar=True, priority="normal",
            needs_review=["start_date"]),
        field_confidence={"start_date": 0.58}, extraction_source="seed", status="draft",
        created_at=clock.at(d - timedelta(days=1), "15:40")))

    if after:
        records += _meera_assignment(d)

    records += _history(d, after)
    return records


def _credentials(d: date, after: bool, caregivers: dict[str, Caregiver]) -> list[Credential]:
    reference, config = load_reference(), load_vertical(Vertical.HOME_NURSING)
    specs = [
        ("CRD-0101", ANJALI, "anjali-rao-registration.png", "Anjali Rao", "RN", "DSNC-RN-2017-02281",
         date(2017, 3, 2), d + timedelta(days=900), ["wound care", "diabetic care"], {}),
        ("CRD-0103", DEEPA, "deepa-kurian-registration.png", "Deepa Kurian", "RN", "DSNC-RN-2019-07716",
         date(2019, 8, 19), d + timedelta(days=600), ["wound care", "elderly care"], {}),
        ("CRD-0104", RAHUL, "rahul-menon-registration.png", "Rahul Menon", "RN", "DSNC-RN-2016-03390",
         date(2016, 8, 15), RAHUL_EXPIRY, ["wound care"], {}),
        ("CRD-0105", KIRAN, "kiran-dsouza-registration.png", "Kiran D'Souza", "RN", "DSNC-RN-2014-01128",
         date(2014, 2, 10), d + timedelta(days=700), ["palliative care", "wound care"], {}),
        ("CRD-0106", SANA, "sana-sheikh-registration.png", "Sana Sheikh", "RN", "DSNC-RN-2021-05530",
         date(2021, 11, 5), SANA_EXPIRY(d), ["post-operative care"], {}),
        ("CRD-0108", FATIMA, "fatima-khan-registration.png", "Fatima Khan", "RN", "DSNC-RN-2022-08802",
         date(2022, 1, 24), None, ["elderly care"], {"valid_until": 0.31}),
    ]
    if after:
        specs.append(("CRD-0107", PRIYA, "priya-nair-registration.png", "Priya Nair", "RN-RM",
                      "DSNC-RNRM-2019-04417", date(2019, 6, 12), date(2027, 6, 11),
                      ["wound care", "IV therapy", "palliative care"], {}))
    creds = []
    for cid, cg_id, doc, name, ctype, number, issued, valid, skills, low_conf in specs:
        fields = CredentialFields(caregiver_name=name, credential_type=ctype, registration_number=number,
                                  issuing_authority=AUTHORITY, issue_date=issued, valid_until=valid, skills=skills)
        evidence = [FieldEvidence(field=f, confidence=low_conf.get(f, 0.98))
                    for f in ("caregiver_name", "credential_type", "registration_number",
                              "issuing_authority", "issue_date", "valid_until")]
        checks = run_checks(fields, evidence, caregivers.get(cg_id), config, reference, d)
        status = status_from_checks(checks)
        approved = status != "blocked" and cg_id not in {FATIMA}
        creds.append(Credential(
            id=cid, caregiver_id=cg_id, document_name=doc, fields=fields, evidence=evidence,
            extraction_source="seed", checks=checks,
            status=VerificationStatus.VERIFIED if approved else status,
            uploaded_at=clock.at(d - timedelta(days=30), "10:00"),
            decided_at=clock.at(d - timedelta(days=29), "10:00") if approved else None))
    return creds


def _assignment(suffix: str, client_id: str, vertical: Vertical, caregiver_id: str, skills: list[str],
                creds: list[str], days: list[date], start: str, end: str, created: datetime) -> list[BaseModel]:
    aid = f"AS-{suffix}"
    out: list[BaseModel] = [Assignment(
        id=aid, care_request_id=f"CR-{suffix}", client_id=client_id, vertical=vertical, required_skills=skills,
        required_credentials=creds, created_at=created, updated_at=created)]
    for i, day in enumerate(days, start=1):
        s, e = clock.shift_window(day, start, end)
        out.append(Shift(id=f"SH-{suffix}-{i:02d}", assignment_id=aid, client_id=client_id, index=i,
                         start=s, end=e, segments=[Segment(caregiver_id=caregiver_id, start=s, end=e)]))
    return out


def _meera_assignment(d: date) -> list[BaseModel]:
    request = CareRequest(
        id="CR-0142", client_id=MEERA,
        raw_text="Mrs Sharma needs a wound-care nurse from 6 PM to 6 AM for the next five days.",
        requirements=Requirements(
            care_type=Vertical.HOME_NURSING, required_credentials=["RN", "RN-RM"], required_skills=["wound_care"],
            shift_start="18:00", shift_end="06:00", start_date=d, duration_days=5, location_area="Jayanagar",
            prefer_familiar=True, priority="high"),
        field_confidence={"start_date": 0.61}, extraction_source="seed", status="assigned",
        created_at=_ago(40))
    return [request, *_assignment("0142", MEERA, Vertical.HOME_NURSING, ANJALI, ["wound_care"], ["RN", "RN-RM"],
                                  [d + timedelta(days=i) for i in range(5)], "18:00", "06:00",
                                  created=_ago(30))]


def _ago(minutes: int) -> datetime:
    return clock.now() - timedelta(minutes=minutes)


def _history(d: date, after: bool) -> list[AuditEntry]:
    def entry(n: int, when: datetime, actor_type: ActorType, actor: str, action: str, summary: str,
              entity_type: str, entity_id: str) -> AuditEntry:
        return AuditEntry(id=f"AL-SEED{n:02d}", at=when, actor_type=actor_type, actor=actor, action=action,
                          summary=summary, entity_type=entity_type, entity_id=entity_id)

    items = [
        entry(1, clock.at(d - timedelta(days=3), "16:20"), ActorType.HUMAN, "Care coordinator", "assignment.approved",
              "Assigned Kiran D'Souza to Ramesh Iyer for 9 hospice nights", "assignment", "AS-0127"),
        entry(2, clock.at(d - timedelta(days=1), "09:30"), ActorType.RULE, "Rule V-01", "credential.blocked",
              "Blocked Rahul Menon: registration expired", "credential", "CRD-0104"),
        entry(3, clock.at(d - timedelta(days=1), "11:05"), ActorType.AI, "Gemini", "credential.extracted",
              "Read Fatima Khan's registration; expiry date unreadable (confidence 0.31)", "credential", "CRD-0108"),
    ]
    if after:
        items += [
            entry(4, _ago(50), ActorType.HUMAN, "Care coordinator", "credential.approved",
                  "Approved verification for Priya Nair", "credential", "CRD-0107"),
            entry(5, _ago(40), ActorType.AI, "Gemini", "care_request.extracted",
                  "Turned Meera Sharma's request into structured requirements", "care_request", "CR-0142"),
            entry(6, _ago(30), ActorType.HUMAN, "Care coordinator", "assignment.approved",
                  "Assigned Anjali Rao to Meera Sharma for 5 nights", "assignment", "AS-0142"),
        ]
    return items
