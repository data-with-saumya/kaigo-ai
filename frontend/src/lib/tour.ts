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
    doThis: "In the Document dropdown, choose “Priya Nair: registration (valid)” and press Check document. Read the result, then approve." },
  { n: 2, petal: "fit", title: "Describe the care needed", to: "/requests/new", scenario: "fresh",
    doThis: "Keep the example and press Continue. Answer when KaigoAI asks when care should start, then press Find caregivers." },
  { n: 3, petal: "fit", title: "Book the best caregiver", to: "/requests", scenario: "fresh",
    doThis: "Open Mrs Sharma’s booking and book the caregiver marked Best fit." },
  { n: 4, petal: "continuity", title: "A caregiver messages in", to: "/caregiver/CG-0101", scenario: "after_assignment",
    doThis: "You’re now Anjali, on her phone. Tap “I can’t make my shift tomorrow night”." },
  { n: 5, petal: "continuity", title: "Replan and approve", to: "/changes", scenario: "after_assignment",
    doThis: "Open the change waiting for you. The recommended plan is already chosen; read why, then approve it." },
  { n: 6, petal: "continuity", title: "Catch problems early", to: "/app", scenario: "after_assignment",
    doThis: "On Today, press “Plan replacements” to see KaigoAI spot a registration that lapses in the middle of a booking." },
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
