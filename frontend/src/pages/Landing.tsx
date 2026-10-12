import { Link } from "react-router-dom";
import { Logo, Note, Pen, Reveal } from "../components/Brand";
import { CHAPTERS, HERO, PETAL_COLOUR, PETAL_INK, PRINCIPLES, PROOF, PROOF_NOTE, STACK } from "../lib/story";
import "./landing.css";

/** The website: one calm page on notebook paper, with a few notes in the margin like a coordinator reading it. */
export function LandingPage() {
  return (
    <div className="site paper-lined">
      <nav className="site-nav" aria-label="KaigoAI">
        <Link to="/" className="brand" aria-label="KaigoAI, home"><Logo height={30} animate /></Link>
        <div className="site-links">
          <a href="#how">How it works</a>
          <a href="#proof">Proof</a>
          <Link to="/app" className="btn quiet small" viewTransition>Open the app</Link>
        </div>
      </nav>

      <header id="top" className="hero">
        <Note className="margin-note" style={{ top: 40 }} rotate={-4}>Tue,<br />21:32</Note>
        <div className="hero-text">
          <h1>A nurse cancels<br />at 21:32.<br /><span className="highlight sweep">{HERO.emphasis}</span></h1>
          <p className="lead">{HERO.body}</p>
          <div className="ctas">
            <Link to="/tour/1?setup=1" className="btn primary">Take the 2-minute tour</Link>
            <Link to="/app" className="text-link" viewTransition>Open the live demo</Link>
          </div>
        </div>
        <div className="hero-card-wrap">
          <figure className="hero-card" aria-label="Example: a cancellation and a cover option">
            <span className="tape" aria-hidden="true" />
            <div className="hc-meta"><span>Tomorrow · 18:00 to 06:00</span><span>Mrs Iyer</span></div>
            <p className="hc-what">Anjali can’t make her shift.</p>
            <div className="hc-person">
              <span className="hc-avatar">PN</span>
              <span className="hc-name"><strong>Priya Nair</strong><span>Full night · 32 min by road</span></span>
              <b>81</b>
            </div>
            <div className="hc-foot"><span>1 of 2 options</span><span className="btn small">Approve Priya</span></div>
          </figure>
          <div className="hero-note">
            <Pen stroke="arrow" style={{ width: 56, height: 50 }} delay={1600} />
            <Note>32 min away. good.</Note>
          </div>
        </div>
      </header>

      <Reveal as="section" className="problem">
        <Pen stroke="bracket" className="bracket" />
        <Note className="margin-note" style={{ top: 40 }} rotate={-5}>every<br />single<br />week.</Note>
        <p>Every agency knows the call. A caregiver can’t make it, a family is waiting, and the rest of the evening goes on phone calls. <span className="soft">KaigoAI turns that evening into one decision.</span></p>
      </Reveal>

      <section id="how" className="services" aria-labelledby="how-h">
        <h2 id="how-h" className="eyebrow">Three things KaigoAI does</h2>
        <div className="svc-grid">
          {CHAPTERS.map((c, i) => (
            <Reveal key={c.id} className="svc" delay={i * 120} style={{ borderTopColor: PETAL_COLOUR[c.id] }}>
              {c.id === "continuity" && <Note className="svc-note">this one ✓</Note>}
              <span className="svc-tag" style={{ color: PETAL_INK[c.id] }}>{c.number} · {c.name}</span>
              <h3>{c.site.title}</h3>
              <p>
                {c.site.text}
                {c.id === "continuity" && <> <span className="pen-wrap">You approve.<Pen stroke="underline" className="under" /></span></>}
              </p>
              <div className="svc-links">
                <Link to={`/tour/${c.tourStep}?setup=1`} className="text-link">Try it live →</Link>
                <Link to={c.site.link.to} className="quiet-link" viewTransition>{c.site.link.label}</Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="proof" className="proof" aria-labelledby="proof-h">
        <Reveal>
          <h2 id="proof-h"><span className="pen-wrap">Measured<Pen stroke="underline" className="under" width={2} /></span>, not claimed.</h2>
        </Reveal>
        <div className="proof-grid">
          {PROOF.map((p, i) => (
            <Reveal key={p.value} className="proof-item" delay={i * 90}><span>{p.value}</span>{p.label}</Reveal>
          ))}
        </div>
        <p className="fine">{PROOF_NOTE} All demo data is made up. Built with {STACK.join(", ")}.</p>
      </section>

      <Reveal as="section" className="principles">
        <h2>Responsible by design.</h2>
        <div className="principles-grid">
          {PRINCIPLES.map((p) => <div key={p.title}><strong>{p.title}</strong><span>{p.text}</span></div>)}
        </div>
      </Reveal>

      <Reveal as="section" className="final">
        <h2>See it on tonight’s schedule.</h2>
        <div className="ctas">
          <Link to="/tour/1?setup=1" className="btn primary">Take the 2-minute tour</Link>
          <Link to="/app" className="text-link" viewTransition>Open the live demo</Link>
        </div>
        <Note className="sign">— team KaigoAI</Note>
      </Reveal>

      <footer className="site-foot">
        <span>KaigoAI · built on Google Cloud with Gemini · Google Cloud AI Builder Cup 2026 · synthetic demo data only</span>
        <span className="foot-links">
          <Link to="/present">Present the story</Link>
          <Link to="/learn" viewTransition>Learn in six steps</Link>
          <a href="https://github.com/data-with-saumya/kaigo-ai" target="_blank" rel="noreferrer">Source on GitHub</a>
        </span>
      </footer>
    </div>
  );
}
