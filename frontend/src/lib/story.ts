// The KaigoAI story, written once and shown two ways: the long-scroll landing page and Present mode.

export type Petal = "trust" | "fit" | "continuity";

export interface Chapter {
  id: Petal;
  number: string;
  name: string;
  title: string;
  body: string;
  extra?: string;
  roles: { who: string; what: string; style: "ai" | "rule" | "human" }[];
  links: { label: string; to: string; primary?: boolean }[];
  tourStep: number;
  /** The website's three columns: a short headline, one sentence, one link. */
  site: { title: string; text: string; link: { label: string; to: string } };
}

// Brand v1 (12 Oct 2026): Trust = teal, Fit = sunshine, Continuity = tangerine. The "ink" shades are for text.
export const PETAL_COLOUR: Record<Petal, string> = { trust: "#0FA3A3", fit: "#FFC93C", continuity: "#FF7A2F" };
export const PETAL_INK: Record<Petal, string> = { trust: "#0B7C7C", fit: "#7A5600", continuity: "#B8460F" };

export const HERO = {
  eyebrow: "For home-care agencies in India",
  title: "A nurse cancels at 21:32.",
  emphasis: "Care carries on.",
  body: "KaigoAI checks caregivers’ papers, matches them to clients and replans the moment someone drops out. A person approves every change.",
};

export const PROBLEM = {
  time: "21:32",
  text: "A nurse messages that she can’t do tomorrow night. Most staffing tools ask who is free.",
  turn: "KaigoAI asks how to keep this patient’s care continuous.",
};

export const CHAPTERS: Chapter[] = [
  {
    id: "trust", number: "01", name: "Trust", title: "Verify the right people.",
    body: "Upload a nurse’s registration. Gemini reads it, seven rules check it (expiry, number format, eligibility, evidence), and anything uncertain is flagged for a person.",
    roles: [
      { who: "Gemini", what: "reads the document", style: "ai" },
      { who: "Rules", what: "decide validity", style: "rule" },
      { who: "You", what: "approve", style: "human" },
    ],
    links: [{ label: "Open Verify", to: "/verify", primary: true }],
    tourStep: 1,
    site: { title: "Papers, checked.", text: "Gemini reads each registration certificate. Seven plain rules decide what’s valid, and anything unclear goes to a person.", link: { label: "See verification", to: "/verify" } },
  },
  {
    id: "fit", number: "02", name: "Fit", title: "Turn a request into the right match.",
    body: "Describe the need in plain words. KaigoAI builds the requirements, asks when something is ambiguous, then ranks every caregiver on seven transparent factors, including real driving time and whether they already know the client.",
    roles: [
      { who: "Gemini", what: "understands the request", style: "ai" },
      { who: "Rules", what: "decide who is eligible", style: "rule" },
      { who: "You", what: "assign", style: "human" },
    ],
    links: [
      { label: "Open Book", to: "/requests/new", primary: true },
      { label: "See all bookings", to: "/requests" },
    ],
    tourStep: 2,
    site: { title: "The right person, nearby.", text: "Describe the need in your own words. KaigoAI ranks who fits, with real driving times and the reasons shown.", link: { label: "See matching", to: "/requests" } },
  },
  {
    id: "continuity", number: "03", name: "Continuity", title: "When the night changes, replan in minutes.",
    body: "A caregiver messages in the app. KaigoAI finds the affected shift, rechecks everyone and lays out the trade-offs. You approve, and the new caregivers get their booking and a handover note.",
    extra: "It also works ahead: every night it spots registrations that will lapse before a shift ends.",
    roles: [
      { who: "Gemini", what: "reads the message, explains options", style: "ai" },
      { who: "Rules", what: "build and check every plan", style: "rule" },
      { who: "You", what: "approve the change", style: "human" },
    ],
    links: [
      { label: "Open Replan", to: "/continuity", primary: true },
      { label: "Open Messages", to: "/messages" },
    ],
    tourStep: 4,
    site: { title: "Cover, before the panic.", text: "When someone cancels, KaigoAI drafts cover options and a handover note.", link: { label: "See replanning", to: "/continuity" } },
  },
];

export const PROOF = [
  { value: "31/31", label: "credential fields read correctly" },
  { value: "34/34", label: "request checks passed" },
  { value: "8/8", label: "change messages understood" },
  { value: "~3 s", label: "per AI step" },
];
export const PROOF_NOTE = "Synthetic test set, three runs, Gemini on Google Cloud.";
export const STACK = ["Gemini", "Cloud Run", "Firestore", "Firebase", "Maps Routes", "Cloud Scheduler"];

export const PRINCIPLES = [
  { title: "People decide", text: "Every staffing change waits for a coordinator’s approval." },
  { title: "Rules stay rules", text: "Expiry, availability, overlaps and coverage are fixed code, never AI." },
  { title: "Nothing invented", text: "AI output must fit a strict format; explanations quoting unknown figures are withheld." },
  { title: "Not clinical", text: "No diagnoses or treatment advice. The score is operational only." },
];
