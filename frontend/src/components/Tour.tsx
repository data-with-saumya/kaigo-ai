import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { broadcastRefresh } from "../lib/hooks";
import { TOUR, setTourStep, useTour } from "../lib/tour";
import { Thinking } from "./Brand";

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
        setError(err instanceof Error ? err.message : "Couldn't set up this step.");
      }
    })();
    return () => { cancelled = true; };
  }, [step, params, navigate]);

  return (
    <div className="paper-dots" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {error ? <p className="notice risk">{error}</p> : <Thinking size={34} label={`Setting up step ${step.n}: ${step.title}…`} />}
    </div>
  );
}

/** While you follow a step from Learn, a sticky note says what to do on this screen. */
export function StepNote() {
  const { current, step } = useTour();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [folded, setFolded] = useState(false);
  useEffect(() => setFolded(false), [step]);
  if (!current || step === null || folded || pathname.startsWith("/tour") || pathname === "/" || pathname === "/present" || pathname === "/learn") return null;
  const onPhone = pathname.startsWith("/caregiver");

  return (
    <aside className="sticky-step" aria-label={`Learn, step ${current.n}`} style={onPhone ? { top: 24, bottom: "auto" } : undefined}>
      <div className="spread" style={{ flexWrap: "nowrap" }}>
        <span className="eyebrow">Learn · step {current.n} of {TOUR.length}</span>
        <button type="button" className="link-btn small" onClick={() => setFolded(true)} aria-label="Hide this note">Hide</button>
      </div>
      <div className="step-dots" aria-hidden="true">{TOUR.map((t) => <span key={t.n} className={t.n <= current.n ? "done" : ""} />)}</div>
      <h2>{current.title}</h2>
      <p>{current.doThis}</p>
      <div className="inline">
        {current.n < TOUR.length
          ? <button type="button" className="btn small" onClick={() => navigate(`/tour/${current.n + 1}`)}>Next step →</button>
          : <button type="button" className="btn small" onClick={() => { setTourStep(null); navigate("/learn"); }}>Finish</button>}
        <Link to="/learn" className="btn secondary small" viewTransition>All steps</Link>
        <button type="button" className="link-btn small" onClick={() => setTourStep(null)}>Stop</button>
      </div>
    </aside>
  );
}
