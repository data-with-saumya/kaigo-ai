import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { IconArrow } from "../components/Icons";
import { Page } from "../components/Shell";
import { ErrorNotice, Spinner } from "../components/ui";
import { findFn, prepare, role as findRole, setGuide, useGuide, type Who } from "../lib/guide";
import { broadcastRefresh } from "../lib/hooks";

const WHO_CLASS: Record<Who, string> = { You: "you", "Your coordinator": "you", "Your agency": "you", Gemini: "gemini", Rules: "rules" };

/** One tab per audience: a straight, numbered flow of what KaigoAI does for them. */
export function RolePage() {
  const { role: key } = useParams();
  const r = findRole(key);
  if (!r) return <Navigate to="/for/coordinator" replace />;
  return (
    <Page title={r.title} lead={r.who} back={{ to: "/" }}>
      <p className="role-intro">{r.intro}</p>
      <ol className="fn-flow">
        {r.fns.map((f, i) => (
          <li key={f.key} className="fn-step">
            <span className="fn-n" aria-hidden="true">{i + 1}</span>
            <article className="fn-card" aria-labelledby={`fn-${f.key}`}>
              <h2 id={`fn-${f.key}`}>{f.title}</h2>
              <dl className="fn-facts">
                <dt>What it does for you</dt><dd>{f.forYou}</dd>
                <dt>How you use it</dt><dd>{f.howTo}</dd>
              </dl>
              <Link className="btn small" to={`/for/${r.key}/${f.key}`} viewTransition>Open the guide<IconArrow size={15} /></Link>
            </article>
          </li>
        ))}
      </ol>
    </Page>
  );
}

/** One function: what it does, who does what, a step-by-step tour, and "Try it now" on the real screen. */
export function GuidePage() {
  const { role: key, fn: fnKey } = useParams();
  const navigate = useNavigate();
  const r = findRole(key);
  const f = findFn(key, fnKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!r || !f) return <Navigate to={r ? `/for/${r.key}` : "/for/coordinator"} replace />;
  const i = r.fns.indexOf(f);
  const prev = r.fns[i - 1];
  const next = r.fns[i + 1];

  const tryIt = async () => {
    setBusy(true);
    setError(null);
    try {
      setGuide({ role: r.key, fn: f.key });
      const to = await prepare(f);
      broadcastRefresh();
      navigate(to);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={f.title} lead={f.forYou} back={{ to: `/for/${r.key}` }}>
      <div className="crumb">{r.tab} · {i + 1} of {r.fns.length}</div>

      <section className="guide-card">
        <h2 className="guide-h">What it does</h2>
        {f.details.map((d) => <p key={d}>{d}</p>)}
      </section>

      <section className="guide-card">
        <h2 className="guide-h">Who does what</h2>
        <ul className="who-list">
          {f.roles.map((x) => <li key={x.who + x.does}><span className={`who ${WHO_CLASS[x.who]}`}>{x.who}</span><span>{x.does}</span></li>)}
        </ul>
      </section>

      <section className="guide-card tour">
        <h2 className="guide-h">How to use it</h2>
        <ol className="tour-steps">{f.steps.map((s, n) => <li key={s}><span className="tour-n">{n + 1}</span><span>{s}</span></li>)}</ol>
        <div className="inline">
          <button className="btn primary" disabled={busy} onClick={tryIt}>{f.tryIt.label}<IconArrow size={16} /></button>
          {busy && <Spinner label="Setting up the demo…" />}
        </div>
        {f.tryIt.to !== "/how-it-works" && <p className="small muted">This opens the real screen with a fresh demo agency. A note there repeats these steps; press Back to return here.</p>}
        <ErrorNotice error={error} />
      </section>

      <nav className="guide-nav" aria-label="More in this tab">
        {prev ? <Link to={`/for/${r.key}/${prev.key}`} viewTransition>← {prev.title}</Link> : <span />}
        {next ? <Link to={`/for/${r.key}/${next.key}`} viewTransition>Next: {next.title} →</Link> : <Link to={`/for/${r.key}`} viewTransition>All of {r.tab} →</Link>}
      </nav>
    </Page>
  );
}

/** On the real screen, a sticky note repeats the steps of the guide you came from. */
export function GuideNote() {
  const { guide, fn, clear } = useGuide();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [folded, setFolded] = useState(false);
  if (!guide || !fn || pathname === "/" || pathname.startsWith("/for/") || pathname.startsWith("/present") || pathname === "/how-it-works") return null;
  const r = findRole(guide.role);
  if (folded) {
    return <button type="button" className="guide-chip" onClick={() => setFolded(false)}>Show the steps: {fn.title}</button>;
  }
  return (
    <aside className={`sticky-step${pathname.startsWith("/caregiver") ? " on-phone" : ""}`} aria-label={`Guide: ${fn.title}`}>
      <div className="spread" style={{ flexWrap: "nowrap" }}>
        <span className="eyebrow">{r?.tab} · guide</span>
        <button type="button" className="link-btn small" onClick={() => setFolded(true)}>Hide</button>
      </div>
      <h2>{fn.title}</h2>
      <ol className="note-steps">{fn.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <div className="inline">
        <button type="button" className="btn small" onClick={() => navigate(`/for/${guide.role}/${guide.fn}`)}>← Back to the guide</button>
        <button type="button" className="link-btn small" onClick={clear}>Done</button>
      </div>
    </aside>
  );
}

/** Old six-step tour links (/tour/1 … /tour/6) now open the matching guide. */
export function TourRedirect() {
  const { n = "1" } = useParams();
  const map: Record<string, string> = { "1": "coordinator/verify", "2": "coordinator/book", "3": "coordinator/book", "4": "nurse/cancel", "5": "coordinator/replan", "6": "coordinator/checks" };
  return <Navigate to={`/for/${map[n] ?? "coordinator"}`} replace />;
}
