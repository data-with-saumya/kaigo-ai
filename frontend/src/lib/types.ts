// Shapes returned by the Kaigo API (see backend/models/domain.py).

export type Vertical = "home_nursing" | "hospice";
export type ActorType = "ai" | "rule" | "human" | "system";
export type VerificationStatus = "pending" | "blocked" | "needs_review" | "ready" | "verified" | "rejected";
export type Severity = "ok" | "info" | "review" | "block";

export interface Location { area: string; city: string; lat: number; lng: number }
export interface SkillClaim { skill: string; evidenced: boolean; evidence: string | null }

export interface Caregiver {
  id: string; name: string; credential_type: string; years_experience: number;
  skills: SkillClaim[]; location: Location; verticals: Vertical[];
  credential_id: string | null; credential_valid_until: string | null;
  verification_status: VerificationStatus;
}

export interface Client {
  id: string; name: string; location: Location; vertical: Vertical; prefer_familiar: boolean;
  visit_history: Record<string, number>; care_notes: string | null;
}

export interface CredentialFields {
  caregiver_name: string | null; credential_type: string | null; registration_number: string | null;
  issuing_authority: string | null; issue_date: string | null; valid_until: string | null; skills: string[];
}
export interface FieldEvidence { field: string; confidence: number; source_text: string | null }
export interface CheckResult { rule_id: string; label: string; passed: boolean; severity: Severity; detail: string; reference_id: string | null }

export interface Credential {
  id: string; caregiver_id: string | null; document_name: string; fields: CredentialFields;
  evidence: FieldEvidence[]; extraction_source: "gemini" | "seed" | "manual"; checks: CheckResult[];
  status: VerificationStatus; uploaded_at: string; decided_at: string | null; decision_note: string | null;
  storage_path: string | null; mime_type: string | null;
}

export interface Ambiguity { field: string; reason: string; choices: string[] }
export interface Requirements {
  care_type: Vertical; required_credentials: string[]; required_skills: string[];
  shift_start: string; shift_end: string; start_date: string; duration_days: number;
  location_area: string; prefer_familiar: boolean; priority: "low" | "normal" | "high"; needs_review: string[];
}
export interface CareRequest {
  id: string; client_id: string; raw_text: string | null; requirements: Requirements;
  field_confidence: Record<string, number>; ambiguities: Ambiguity[];
  extraction_source: "gemini" | "manual" | "seed"; status: "draft" | "confirmed" | "assigned"; created_at: string;
}

export interface Factor { key: string; label: string; layer: "trust" | "fit" | "continuity"; points: number; max_points: number; detail: string }
export interface NightCoverage { index: number; start: string; end: string; status: "full" | "partial" | "none"; covered: [string, string][] }
export interface Candidate {
  caregiver_id: string; name: string; credential_type: string; years_experience: number; area: string;
  distance_km: number; travel_minutes: number | null; travel_source: string; previous_visits: number; nights_full: number; nights_total: number;
  hours_covered: number; hours_demanded: number; full_coverage: boolean; nights: NightCoverage[];
  factors: Factor[]; total: number;
}
export interface Exclusion { caregiver_id: string; name: string; rule_id: string; reason: string }
export interface MatchResult { request_id: string; checked: number; candidates: Candidate[]; excluded: Exclusion[] }

export interface Segment { caregiver_id: string | null; start: string; end: string }
export interface SegmentView extends Segment { caregiver_name: string | null }
export interface ShiftView {
  id: string; assignment_id: string; index: number; client_id: string; client_name: string; vertical: Vertical | null;
  start: string; end: string; status: "covered" | "partial" | "uncovered"; segments: SegmentView[]; risk: string | null;
}

export interface ReplanOption {
  id: string; kind: "single" | "split" | "partial"; title: string; segments: Segment[]; caregiver_ids: string[];
  feasible: boolean; violations: CheckResult[]; factors: Factor[]; total: number; pros: string[]; cons: string[];
}
export type EventType = "caregiver_cancellation" | "shift_change" | "requirement_change" | "urgent_coverage_request" | "credential_expiry" | "other";
export interface ParsedEvent {
  event_type: EventType; caregiver_id: string | null; caregiver_name: string | null; client_id: string | null;
  date: string | null; confidence: number; summary: string;
}
export interface OptionExplanation { summary: string; per_option: Record<string, string>; caveat: string | null }
export interface Decision { action: "approved" | "rejected"; option_id: string | null; note: string | null; actor: string; at: string }
export interface ChangeEvent {
  id: string; raw_text: string | null; source: "sms" | "manual" | "system"; received_at: string;
  parsed: ParsedEvent | null; parse_source: "gemini" | "manual" | "rule";
  status: "needs_review" | "open" | "no_feasible_option" | "resolved" | "rejected" | "no_impact";
  review_reason: string | null; affected_shift_ids: string[]; assignment_id: string | null;
  assignment_version: number | null; impact_summary: string | null; options: ReplanOption[];
  recommended_option_id: string | null; recommendation_note: string | null; excluded: Exclusion[];
  explanation: OptionExplanation | null; decision: Decision | null; handover_notes: Record<string, string>;
}

export interface AuditEntry {
  id: string; at: string; actor_type: ActorType; actor: string; action: string;
  entity_type: string; entity_id: string | null; summary: string; details: Record<string, unknown>;
}

export interface Dashboard {
  now: string;
  kpis: {
    active_assignments: number; assignments_by_vertical: Record<string, number>; shifts_next_24h: number;
    uncovered_next_24h: number; uncovered_upcoming: number; pending_verifications: number;
    blocked_credentials: number; open_requests: number; requests_needing_confirmation: number; continuity_alerts: number;
    at_risk_shifts: number;
  };
  alerts: { event_id: string; status: ChangeEvent["status"]; received_at: string; caregiver_name: string | null; summary: string | null; options: number }[];
  upcoming_shifts: ShiftView[];
  pending_verifications: { caregiver_id: string; name: string; status: VerificationStatus; credential_id: string | null; reason: string }[];
  open_requests: { id: string; client_name: string; summary: string | null; status: string; needs_review: string[] }[];
  recent_audit: AuditEntry[];
}

export interface Health { status: string; gemini: "available" | "unavailable"; model: string | null; storage: string }
export interface Sample { file: string; kind: string; caregiver_id: string | null; label: string; demo: boolean }
export interface ReferenceDoc { id: string; title: string; publisher: string; url: string; used_for: string; summary: string }
export interface Authority { id: string; name: string; kind: string; synthetic: boolean; source_url: string | null; notes: string | null }
export interface Reference { authorities: Authority[]; documents: ReferenceDoc[] }
