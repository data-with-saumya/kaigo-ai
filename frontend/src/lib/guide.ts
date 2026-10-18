// v6: KaigoAI explained per audience. Each tab is one audience; each function has a guide page and a "Try it now"
// that opens the real screen with the demo set up and a note listing the same steps.
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { isoDay } from "./format";

export type RoleKey = "coordinator" | "nurse" | "owner" | "family";
export type Who = "You" | "Gemini" | "Rules" | "Your coordinator" | "Your agency";

export interface GuideFn {
  key: string;
  title: string;
  /** What it does for this person, in one sentence. */
  forYou: string;
  /** How they use it, in one sentence. */
  howTo: string;
  details: string[];
  roles: { who: Who; does: string }[];
  /** The tour: what to press, in order. */
  steps: string[];
  tryIt: { label: string; scenario?: "fresh" | "after_assignment"; to?: string; setup?: "replan" | "approved" };
}

export interface Role { key: RoleKey; tab: string; short: string; title: string; who: string; intro: string; fns: GuideFn[] }

const replanTry = (label: string) => ({ label, setup: "replan" as const });
const bookedTry = (label: string) => ({ label, setup: "approved" as const });

export const ROLES: Role[] = [
  {
    key: "coordinator", tab: "Coordinator", short: "Coordinator", title: "For care coordinators",
    who: "You run the agency’s day: checking nurses’ papers, booking nurses for clients, and covering shifts when plans change.",
    intro: "Go through these in order the first time. Each one opens a short guide, then the real screen.",
    fns: [
      { key: "today", title: "See what needs you", forYou: "One list of everything waiting for you, most urgent first, with one button each.",
        howTo: "Open Today and work down the list.",
        details: ["Today brings together cancellations, shifts at risk, documents to check and bookings to finish.",
          "Below the list you see the shifts coming up and who covers each one."],
        roles: [{ who: "Rules", does: "flag shifts at risk and shifts nobody covers" }, { who: "You", does: "decide what to do with each item" }],
        steps: ["Open Today.", "Read the “Needs you” list from the top.", "Press the button on a row (Replan, Review, Check or Book) to deal with it.", "Scroll to “Coming up” to see who covers the next shifts."],
        tryIt: { label: "Open Today", scenario: "fresh", to: "/app" } },
      { key: "verify", title: "Verify a nurse’s registration", forYou: "Know a nurse’s registration is real and in date before they’re booked.",
        howTo: "Pick the document, let KaigoAI check it, then approve.",
        details: ["Gemini reads the certificate into fields (name, registration number, valid until, council) and says how sure it is about each.",
          "Seven plain rules then decide. Expired papers and unknown councils are blocked; anything unclear comes to you.",
          "Nobody can be booked until you approve."],
        roles: [{ who: "Gemini", does: "reads the certificate" }, { who: "Rules", does: "decide whether it is valid" }, { who: "You", does: "approve or reject" }],
        steps: ["In Document, choose “Priya Nair: registration (valid)”.", "Press Check document and wait a few seconds.", "Read “What we found”: the verdict and the key details.", "Press Approve. Priya can now be booked."],
        tryIt: { label: "Try verifying Priya", scenario: "fresh", to: "/verify?caregiver=CG-0107" } },
      { key: "book", title: "Book a nurse for a client", forYou: "Find the right nurse for a client in minutes, with the reasons shown.",
        howTo: "Describe the care in your own words, confirm the details, book the best fit.",
        details: ["Write the need the way a family would say it. Gemini turns it into requirements: skills, hours, first day and number of days.",
          "If something is unclear, such as the first day, KaigoAI asks you instead of guessing.",
          "Every nurse is checked against the rules. The best fits are ranked on seven factors, including real driving time and whether they already know the client."],
        roles: [{ who: "Gemini", does: "turns your words into requirements" }, { who: "Rules", does: "check every nurse and rank the fits" }, { who: "You", does: "confirm the details and choose" }],
        steps: ["Keep the example request and press Continue.", "Answer “When should care start?”.", "Press Find caregivers.", "Press Book on the nurse marked Best fit."],
        tryIt: { label: "Try a booking", scenario: "fresh", to: "/requests/new" } },
      { key: "replan", title: "Cover a shift when someone cancels", forYou: "When a nurse can’t come, get ready-made replacement plans instead of an evening of phone calls.",
        howTo: "Open the change, check the recommended plan, approve it.",
        details: ["A nurse’s message, or your own note, is read and the affected shift is found.",
          "KaigoAI rechecks everyone and builds plans: one nurse for the whole shift, a split with a handover, or partial cover. A plan that breaks a rule can’t be approved.",
          "Gemini explains the trade-offs using only the rules’ own numbers. Nothing changes until you approve; then the new nurse gets a booking and a handover note."],
        roles: [{ who: "Gemini", does: "reads the message and explains the plans" }, { who: "Rules", does: "find the shift and build safe plans" }, { who: "You", does: "approve one plan" }],
        steps: ["Read the change at the top: who can’t come, and when.", "Look at the plans. The recommended one is already chosen.", "Read “Why” under the plans.", "Press Approve. The new nurse is booked and briefed."],
        tryIt: replanTry("Try a replan") },
      { key: "checks", title: "Catch problems early", forYou: "Spot a nurse whose registration lapses in the middle of a booking, before it leaves a gap.",
        howTo: "Press “Plan replacements” on Today. The same check also runs every night.",
        details: ["Every night KaigoAI checks upcoming shifts against each nurse’s registration date.",
          "If a registration lapses before a shift ends, it opens a replan early, so you can cover it calmly."],
        roles: [{ who: "Rules", does: "check every upcoming shift each night (rule E-02)" }, { who: "You", does: "approve the replacement" }],
        steps: ["On Today, find “shifts are at risk”.", "Press Plan replacements.", "Approve the recommended plan, as in any replan."],
        tryIt: { label: "Try the checks", scenario: "after_assignment", to: "/app" } },
      { key: "messages", title: "Message your nurses", forYou: "Chat with each nurse in one place. A cancellation in a message turns into a replan by itself.",
        howTo: "Pick a nurse, read, reply.",
        details: ["Each nurse has one conversation with the agency.", "If a nurse writes that they can’t make a shift, KaigoAI recognises it and opens a replan for you."],
        roles: [{ who: "Gemini", does: "recognises changes in messages" }, { who: "You", does: "reply and decide" }],
        steps: ["Open Messages.", "Choose a nurse from the list at the top.", "Type a reply and press Send."],
        tryIt: { label: "Open Messages", scenario: "after_assignment", to: "/messages" } },
    ],
  },
  {
    key: "nurse", tab: "Nurse", short: "Nurse", title: "For nurses and caregivers",
    who: "You care for clients at home. KaigoAI keeps your shifts clear and gets cover when you can’t make it.",
    intro: "You use a simple phone app. No training needed.",
    fns: [
      { key: "shifts", title: "See your shifts", forYou: "Your next shifts, with the client and the hours, on your phone.",
        howTo: "Open the app. Your shifts are at the top.",
        details: ["Shifts appear as soon as your coordinator books you.", "In this demo you see the app as Anjali Rao."],
        roles: [{ who: "Your coordinator", does: "books you" }, { who: "You", does: "check your shifts" }],
        steps: ["Open the app (here, Anjali’s).", "Look at “My next shifts”."],
        tryIt: { label: "Open Anjali’s app", scenario: "after_assignment", to: "/caregiver/CG-0101" } },
      { key: "cancel", title: "Say you can’t make a shift", forYou: "Tell the agency in one tap or in your own words. They know straight away.",
        howTo: "Tap “I can’t make my shift tomorrow night”, or type a message.",
        details: ["KaigoAI understands your message and finds the shift it affects.", "Your coordinator gets ready-made cover plans. You get a reply at once, and another when the shift is covered."],
        roles: [{ who: "Gemini", does: "understands your message" }, { who: "Your coordinator", does: "approves the cover" }],
        steps: ["Open the app.", "Tap “I can’t make my shift tomorrow night”.", "Read KaigoAI’s reply in the chat."],
        tryIt: { label: "Try it as Anjali", scenario: "after_assignment", to: "/caregiver/CG-0101" } },
      { key: "booking", title: "Get your booking and handover note", forYou: "When you cover a shift, you get the booking and a short note on what to know.",
        howTo: "Open the app. The note is in your chat.",
        details: ["The note says when you start, who hands over to you, and the client’s stated preferences.", "It never includes medical advice."],
        roles: [{ who: "Gemini", does: "drafts the handover note" }, { who: "Rules", does: "check it against the approved plan" }],
        steps: ["Open the app (here, Priya’s).", "Read the booking message.", "Read the yellow handover note."],
        tryIt: bookedTry("See Priya’s booking") },
      { key: "chat", title: "Talk to your coordinator", forYou: "One chat with your agency for everything else.",
        howTo: "Type a message and press Send.",
        details: ["Your coordinator sees your message in their Messages screen and replies there."],
        roles: [{ who: "You", does: "write" }, { who: "Your coordinator", does: "replies" }],
        steps: ["Open the app.", "Type in the box at the bottom.", "Press Send."],
        tryIt: { label: "Open Anjali’s app", scenario: "after_assignment", to: "/caregiver/CG-0101" } },
    ],
  },
  {
    key: "owner", tab: "Agency owner", short: "Owner", title: "For agency owners",
    who: "You run the business. KaigoAI keeps care running, safely, at a low cost.",
    intro: "What you get, and where to see it.",
    fns: [
      { key: "overview", title: "See the whole operation", forYou: "Bookings, the next 24 hours of shifts and anything at risk, on one screen.",
        howTo: "Open Today.",
        details: ["The line under the greeting shows active bookings and the shifts in the next 24 hours.", "The list shows everything your coordinators need to act on."],
        roles: [{ who: "Rules", does: "keep the numbers and risks up to date" }, { who: "Your coordinator", does: "acts on the list" }],
        steps: ["Open Today.", "Read the line under the greeting.", "Look down the “Needs you” list."],
        tryIt: { label: "Open Today", scenario: "fresh", to: "/app" } },
      { key: "compliance", title: "Know every nurse is verified", forYou: "No unverified or expired nurse can be booked.",
        howTo: "Open All documents to see each nurse’s status.",
        details: ["Every registration is checked by rules: expiry, council, registration number and evidence for skills.", "Blocked documents can’t be approved, and booking only uses verified nurses."],
        roles: [{ who: "Rules", does: "block expired or unknown papers" }, { who: "Your coordinator", does: "approves the rest" }],
        steps: ["Open All documents.", "Check the status next to each nurse.", "Open one and press “Show details” to see every rule that was checked."],
        tryIt: { label: "Open All documents", scenario: "fresh", to: "/documents" } },
      { key: "continuity", title: "Fewer missed shifts", forYou: "Cancellations are covered in minutes, and lapsing registrations are caught early.",
        howTo: "Watch one replan from start to finish.",
        details: ["Coordinators approve a ready-made plan instead of phoning around.", "In pilots we will measure the time to cover a cancellation and the hours of care left uncovered."],
        roles: [{ who: "Rules", does: "build safe replacement plans" }, { who: "Your coordinator", does: "approves one" }],
        steps: ["Read the change at the top.", "See the plans, with the recommended one chosen.", "Press Approve."],
        tryIt: replanTry("See a replan") },
      { key: "audit", title: "A record of every decision", forYou: "Every AI suggestion, rule result and human decision is logged, with the time and who did it.",
        howTo: "Open Today, then “Activity log” at the bottom.",
        details: ["The log is written automatically as people and KaigoAI work.", "It shows whether Gemini, a rule or a person made each step."],
        roles: [{ who: "Rules", does: "write every step to the log" }],
        steps: ["Open Today.", "Open “Activity log” at the bottom.", "Read who did what, and when."],
        tryIt: { label: "Open Today", scenario: "fresh", to: "/app" } },
      { key: "cost", title: "Low running cost", forYou: "The AI behind one cancellation costs about $0.004, measured on the live app.",
        howTo: "Nothing to set up. It runs on Google Cloud.",
        details: ["Gemini on Vertex AI reads documents and messages and writes explanations. Measured on 12 Oct 2026, one cancellation end to end uses about 2,800 input and 550 output tokens: about $0.0042 at 2026 prices.",
          "Everything else runs on managed Google Cloud services that scale down when nobody is using them."],
        roles: [{ who: "Gemini", does: "the only paid AI step, a fraction of a cent each time" }],
        steps: ["Read how KaigoAI works.", "See which Google Cloud service does what."],
        tryIt: { label: "How KaigoAI works", to: "/how-it-works" } },
      { key: "safety", title: "Safe, responsible AI", forYou: "People decide. Rules decide what is valid. AI only reads and explains.",
        howTo: "Read how KaigoAI works.",
        details: ["Gemini never books anyone or decides who is eligible.", "Unclear information goes to a person instead of being guessed.",
          "Nothing clinical: diagnoses are dropped from requests.", "This demo uses only synthetic people and documents."],
        roles: [{ who: "Rules", does: "decide what is allowed" }, { who: "Gemini", does: "reads and explains" }, { who: "Your coordinator", does: "approves every change" }],
        steps: ["Read how KaigoAI works.", "Try any coordinator function and notice that nothing changes until a person approves."],
        tryIt: { label: "How KaigoAI works", to: "/how-it-works" } },
    ],
  },
  {
    key: "family", tab: "Patient & family", short: "Family", title: "For patients and families",
    who: "You receive care at home. You don’t need to install anything: your agency uses KaigoAI for you.",
    intro: "What it means for you, and how to see it working.",
    fns: [
      { key: "covered", title: "Care continues when a nurse cancels", forYou: "If your nurse can’t come, your agency has a replacement ready within minutes.",
        howTo: "Nothing to do. See how your agency handles it.",
        details: ["Your agency sees which shift is affected and gets safe replacement options straight away.", "A person at the agency approves the replacement before anyone is contacted."],
        roles: [{ who: "Your agency", does: "approves the replacement" }, { who: "Rules", does: "make sure the new nurse is qualified and free" }],
        steps: ["See the change your agency received.", "See the replacement plans.", "Watch your agency approve one."],
        tryIt: replanTry("See how your agency does it") },
      { key: "verified", title: "A verified nurse at your door", forYou: "Every nurse’s registration is checked before they’re booked.",
        howTo: "Nothing to do. See a check.",
        details: ["Expired or unknown registrations are blocked.", "Anything unclear is checked by a person at your agency."],
        roles: [{ who: "Rules", does: "check every registration" }, { who: "Your agency", does: "approves it" }],
        steps: ["Choose a nurse’s document.", "See what KaigoAI found.", "See the approval."],
        tryIt: { label: "See a check", scenario: "fresh", to: "/verify?caregiver=CG-0107" } },
      { key: "familiar", title: "A nurse who knows you", forYou: "KaigoAI prefers nurses who have cared for you before.",
        howTo: "Nothing to do. See how nurses are chosen.",
        details: ["Familiarity is one of seven factors when nurses are ranked for you.", "That means fewer new faces, and fewer handovers in one night."],
        roles: [{ who: "Rules", does: "rank nurses, including who knows you" }, { who: "Your agency", does: "books one" }],
        steps: ["See a care request turned into requirements.", "See the nurses ranked; “knows the client” is shown for each."],
        tryIt: { label: "See how nurses are chosen", scenario: "fresh", to: "/requests/new" } },
      { key: "handover", title: "The next nurse knows your preferences", forYou: "A replacement nurse gets a short handover note with your stated preferences.",
        howTo: "Nothing to do. See a handover note.",
        details: ["The note covers times, who hands over to whom, and your preferences.", "It never gives medical advice."],
        roles: [{ who: "Gemini", does: "drafts the note" }, { who: "Rules", does: "check it against the approved plan" }],
        steps: ["Open the replacement nurse’s app.", "Read the yellow handover note."],
        tryIt: bookedTry("See a handover note") },
      { key: "privacy", title: "Your medical details stay out", forYou: "Requests describe the care needed, not your diagnosis. Medical details are dropped.",
        howTo: "Nothing to do.",
        details: ["When a request mentions a diagnosis, KaigoAI keeps only what is needed for staffing.", "KaigoAI plans staffing. It makes no clinical decisions."],
        roles: [{ who: "Rules", does: "drop medical details" }, { who: "Your agency", does: "describes the care needed" }],
        steps: ["Read how KaigoAI works."],
        tryIt: { label: "How KaigoAI works", to: "/how-it-works" } },
    ],
  },
];

export const role = (key?: string) => ROLES.find((r) => r.key === key);
export const findFn = (roleKey?: string, fnKey?: string) => role(roleKey)?.fns.find((f) => f.key === fnKey);

/** Sets up the demo agency for a guide, then returns where to go. */
export async function prepare(fn: GuideFn): Promise<string> {
  const t = fn.tryIt;
  if (t.setup === "replan" || t.setup === "approved") {
    await api.reset("after_assignment");
    const tomorrow = isoDay(new Date(Date.now() + 86_400_000));
    const event = await api.reportEvent("CG-0101", tomorrow, "caregiver_cancellation", "Family emergency (demo)");
    if (t.setup === "replan") return `/continuity/${event.id}`;
    const option = event.recommended_option_id ?? event.options.find((o) => o.feasible)?.id;
    const decided = await api.decideEvent(event.id, "approved", option ?? undefined);
    await api.handover(decided.id).catch(() => decided);  // the note needs Gemini; the booking stands without it
    return "/caregiver/CG-0107";
  }
  if (t.scenario) await api.reset(t.scenario);
  return t.to ?? "/app";
}

// The guide you are following, kept across pages so the real screen can show its steps.
const KEY = "kaigo.guide";
export function readGuide(): { role: RoleKey; fn: string } | null {
  try { const v = localStorage.getItem(KEY); if (!v) return null; const [r, f] = v.split("/"); return { role: r as RoleKey, fn: f }; } catch { return null; }
}
export function setGuide(g: { role: RoleKey; fn: string } | null) {
  try { if (g) localStorage.setItem(KEY, `${g.role}/${g.fn}`); else localStorage.removeItem(KEY); } catch { /* the note simply won't show */ }
  window.dispatchEvent(new Event("kaigo:guide"));
}
export function useGuide() {
  const [g, setG] = useState(readGuide());
  useEffect(() => {
    const sync = () => setG(readGuide());
    window.addEventListener("kaigo:guide", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("kaigo:guide", sync); window.removeEventListener("storage", sync); };
  }, []);
  const clear = useCallback(() => setGuide(null), []);
  return { guide: g, fn: g ? findFn(g.role, g.fn) : undefined, clear };
}
