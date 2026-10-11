// Smooth scrolling for the whole site (Lenis). Off for people who prefer reduced motion.
import Lenis from "lenis";
import "lenis/dist/lenis.css";

let lenis: Lenis | null = null;

export function startSmoothScroll() {
  if (lenis || typeof window === "undefined") return lenis;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.12,
    anchors: { offset: -24 },
    allowNestedScroll: true, // tables, chat lists and other scroll boxes keep their own scrolling
  });
  return lenis;
}

/** Jump to the top of a new page without animating through the old one. */
export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
}
