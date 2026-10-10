// The Kaigo story, written once and shown two ways: the long-scroll landing page and Present mode.

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
}

export const PETAL_COLOUR: Record<Petal, string> = { trust: "#8F7A60", fit: "#C29A55", continuity: "#B48A84" };
export const PETAL_INK: Record<Petal, string> = { trust: "#6E5C46", fit: "#7A5F2E", continuity: "#8E5F58" };

export const HERO = {
  eyebrow: "Care operations for home-care agencies",
  title: "Keep care running when the night",
  emphasis: "changes.",
  body: "Kaigo verifies caregivers, matches them to each client’s needs, and replans in minutes when someone cancels. A coordinator approves every change.",
};

export const PROBLEM = {
  time: "21:32",
  text: "A nurse messages that she can’t do tomorrow night. Most staffing tools ask who is free.",
  turn: "Kaigo asks how to keep this patient’s care continuous.",
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
    links: [{ label: "Open Verification", to: "/verify", primary: true }],
    tourStep: 1,
  },
  {
    id: "fit", number: "02", name: "Fit", title: "Turn a request into the right match.",
    body: "Describe the need in plain words. Kaigo builds the requirements, asks when something is ambiguous, then ranks every caregiver on seven transparent factors, including real driving time and whether they already know the client.",
    roles: [
      { who: "Gemini", what: "understands the request", style: "ai" },
      { who: "Rules", what: "decide who is eligible", style: "rule" },
      { who: "You", what: "assign", style: "human" },
    ],
    links: [
      { label: "Open Care requests", to: "/requests/new", primary: true },
      { label: "Open Matching", to: "/requests" },
    ],
    tourStep: 2,
  },
  {
    id: "continuity", number: "03", name: "Continuity", title: "When the night changes, replan in minutes.",
    body: "A caregiver messages in the app. Kaigo finds the affected shift, rechecks everyone and lays out the trade-offs. You approve, and the new caregivers get their booking and a handover note.",
    extra: "It also works ahead: every night it spots registrations that will lapse before a shift ends.",
    roles: [
      { who: "Gemini", what: "reads the message, explains options", style: "ai" },
      { who: "Rules", what: "build and check every plan", style: "rule" },
      { who: "You", what: "approve the change", style: "human" },
    ],
    links: [
      { label: "Open Continuity", to: "/continuity", primary: true },
      { label: "Open Messages", to: "/messages" },
    ],
    tourStep: 4,
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
