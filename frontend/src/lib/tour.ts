// Guided tour: six steps through the whole workflow, each opening the right page with the right demo set up.
import { useCallback, useEffect, useState } from "react";

export interface TourStep {
  n: number;
  petal: "trust" | "fit" | "continuity";
  title: string;
  doThis: string;
  to: string;
  scenario: "fresh" | "after_assignment";
}

export const TOUR: TourStep[] = [
  { n: 1, petal: "trust", title: "Verify a new nurse", to: "/verify?caregiver=CG-0107", scenario: "fresh",
    doThis: "Under “Try a synthetic sample”, choose Priya Nair’s registration. Read what Gemini extracted and what the rules flagged, then approve." },
  { n: 2, petal: "fit", title: "Turn a request into requirements", to: "/requests/new", scenario: "fresh",
    doThis: "Keep the first example, press Extract, confirm the start date Kaigo asks about, then confirm." },
  { n: 3, petal: "fit", title: "Match and assign", to: "/requests", scenario: "fresh",
    doThis: "Open Mrs Sharma’s request. See why some caregivers were ruled out, then assign the top match." },
  { n: 4, petal: "continuity", title: "A caregiver messages in", to: "/caregiver/CG-0101", scenario: "after_assignment",
    doThis: "You’re now Anjali, on her phone. Tap “I can’t make my shift tomorrow night”." },
  { n: 5, petal: "continuity", title: "Replan and approve", to: "/continuity", scenario: "after_assignment",
    doThis: "Open the new change. Compare the options and Gemini’s explanation, then approve one." },
  { n: 6, petal: "continuity", title: "Catch problems early", to: "/app", scenario: "after_assignment",
    doThis: "Press “Plan replacements now” to see Kaigo spot a registration that lapses mid-assignment." },
];

const KEY = "kaigo.tour.step";

function read(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function setTourStep(n: number | null) {
  try {
    if (n === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(n));
  } catch { /* the tour simply won't persist */ }
  window.dispatchEvent(new Event("kaigo:tour"));
}

export function useTour() {
  const [step, setStep] = useState<number | null>(read());
  useEffect(() => {
    const sync = () => setStep(read());
    window.addEventListener("kaigo:tour", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("kaigo:tour", sync); window.removeEventListener("storage", sync); };
  }, []);
  const go = useCallback((n: number | null) => setTourStep(n), []);
  return { step, current: step ? TOUR[step - 1] : null, go };
}
