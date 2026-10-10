import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { broadcastRefresh } from "../lib/hooks";
import { PETAL_COLOUR } from "../lib/story";
import { TOUR, setTourStep, useTour } from "../lib/tour";
import { Spinner } from "./ui";

/** /tour/:n opens step n. With ?setup=1 it first resets the demo agency to the state that step needs. */
export function TourRoute() {
  const { n = "1" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const step = TOUR[Math.min(Math.max(Number(n) || 1, 1), TOUR.length) - 1];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (params.get("setup")) {
          await api.reset(step.scenario);
          broadcastRefresh();
        }
        if (cancelled) return;
        setTourStep(step.n);
        navigate(step.to, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't set up the tour.");
      }
    })();
    return () => { cancelled = true; };
  }, [step, params, navigate]);

  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {error ? <p className="notice risk">{error}</p> : <Spinner label={`Setting up step ${step.n}: ${step.title}…`} />}
    </div>
  );
}

export function TourCard() {
  const { current, step } = useTour();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [minimised, setMinimised] = useState(false);
  if (!current || step === null || pathname.startsWith("/tour") || pathname === "/" || pathname === "/present") return null;
  const onPhone = pathname.startsWith("/caregiver");

  if (minimised) {
    return (
      <button type="button" className="btn small" onClick={() => setMinimised(false)}
        style={{ position: "fixed", right: 20, [onPhone ? "top" : "bottom"]: 20, zIndex: 50 }}>
        Tour · step {current.n} of {TOUR.length}
      </button>
    );
  }
  return (
    <aside className="tour-card" aria-label="Guided tour" style={onPhone ? { top: 20, bottom: "auto" } : undefined}>
      <div className="spread" style={{ flexWrap: "nowrap" }}>
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: PETAL_COLOUR[current.petal] }} />
          Guided tour · step {current.n} of {TOUR.length}
        </span>
        <button type="button" className="link-btn small" style={{ color: "#c9c4ba" }} onClick={() => setMinimised(true)}>Minimise</button>
      </div>
      <div className="tour-dots" aria-hidden="true">{TOUR.map((t) => <span key={t.n} className={t.n <= current.n ? "done" : ""} />)}</div>
      <h2>{current.title}</h2>
      <p>{current.doThis}</p>
      <div className="inline">
        <button type="button" className="btn secondary small" disabled={current.n === 1} onClick={() => navigate(`/tour/${current.n - 1}`)}>← Back</button>
        {current.n < TOUR.length
          ? <button type="button" className="btn light small" onClick={() => navigate(`/tour/${current.n + 1}`)}>Next step →</button>
          : <button type="button" className="btn light small" onClick={() => { setTourStep(null); navigate("/"); }}>Finish tour</button>}
        <button type="button" className="btn secondary small" onClick={() => navigate(`/tour/${current.n}?setup=1`)}>Set this up for me</button>
        <button type="button" className="link-btn small" style={{ color: "#c9c4ba" }} onClick={() => setTourStep(null)}>Exit</button>
      </div>
    </aside>
  );
}
