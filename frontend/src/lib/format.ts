// All operational times are shown in the agency's zone (India Standard Time).
const TZ = "Asia/Kolkata";

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const longDayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const isoDayFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

export const time = (iso: string) => timeFmt.format(new Date(iso));
export const day = (iso: string) => dayFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso));
/** A calendar date with the year, for documents: "11 Jun 2027". */
export const fullDate = (iso: string) => dateFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso));
export const longDay = (iso: string) => longDayFmt.format(new Date(iso));
export const isoDay = (d: Date) => isoDayFmt.format(d);
export const span = (start: string, end: string) => `${time(start)}–${time(end)}`;

export function relativeDay(iso: string, now = new Date()): string {
  const target = isoDay(new Date(iso));
  const today = isoDay(now);
  const tomorrow = isoDay(new Date(now.getTime() + 86_400_000));
  if (target === today) return "Today";
  if (target === tomorrow) return "Tomorrow";
  return day(iso);
}

export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const SKILLS: Record<string, string> = {
  wound_care: "wound care", iv_therapy: "IV therapy", palliative_care: "palliative care",
  tracheostomy_care: "tracheostomy care", catheter_care: "catheter care",
  medication_administration: "medication administration", post_operative_care: "post-operative care",
  diabetic_care: "diabetic care", elderly_care: "elderly care", family_communication: "family communication",
  mobility_assistance: "mobility assistance",
};
export const skill = (s: string) => SKILLS[s] ?? s.replace(/_/g, " ");
export const vertical = (v: string | null) => (v === "hospice" ? "Hospice" : v === "home_nursing" ? "Home nursing" : "");
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fieldLabel = (f: string) => ({
  caregiver_name: "Caregiver name", credential_type: "Credential type", registration_number: "Registration number",
  issuing_authority: "Issuing authority", issue_date: "Issue date", valid_until: "Valid until",
  care_type: "care type", skills: "skills", shift_times: "shift times", start_date: "start date",
  duration_days: "duration",
}[f] ?? f.replace(/_/g, " "));
