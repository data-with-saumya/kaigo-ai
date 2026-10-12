import { Link } from "react-router-dom";
import { Note, Pen } from "../components/Brand";
import { Page } from "../components/Shell";
import { PETAL_COLOUR, PETAL_INK } from "../lib/story";
import { TOUR } from "../lib/tour";

const SERVICE = { trust: "Trust", fit: "Fit", continuity: "Continuity" } as const;

/** The guided tour as a tab you can visit any time: six steps, in any order. */
export function LearnPage() {
  return (
    <Page eyebrow="Learn" title="Learn KaigoAI in six steps">
      <p className="learn-intro">Each step sets up the demo agency and opens the right screen. A sticky note tells you what to do there. Go in order, or jump to any step.</p>
      <ol className="learn-list">
        {TOUR.map((s) => (
          <li key={s.n} className="learn-step" style={{ borderLeftColor: PETAL_COLOUR[s.petal] }}>
            <span className="learn-n">{s.n}</span>
            <div className="learn-body">
              <span className="learn-svc" style={{ color: PETAL_INK[s.petal] }}>{SERVICE[s.petal]}</span>
              <h2>{s.title}</h2>
              <p>{s.doThis}</p>
            </div>
            <div className="learn-actions">
              <Link to={`/tour/${s.n}?setup=1`} className={`btn small${s.n === 1 ? " primary" : ""}`}>Start step {s.n}</Link>
              <Link to={`/tour/${s.n}`} className="link-btn small" title="Open the screen without resetting the demo">Open without resetting</Link>
            </div>
            {s.n === 1 && (
              <span className="learn-note" aria-hidden="true"><Pen stroke="arrow" style={{ width: 44, height: 40, transform: "scaleX(-1)" }} delay={400} /><Note>start here</Note></span>
            )}
          </li>
        ))}
      </ol>
      <p className="small muted">Prefer to watch first? <Link to="/present">Present the story</Link> as slides, or read <Link to="/how-it-works" viewTransition>how KaigoAI works</Link> in detail.</p>
    </Page>
  );
}
