import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CHAPTERS, HERO, PETAL_COLOUR, PETAL_INK, PRINCIPLES, PROBLEM, PROOF, PROOF_NOTE, STACK, type Petal } from "../lib/story";
import "./landing.css";

const HINTS: Record<Petal, string> = {
  trust: "Trust: verify credentials",
  fit: "Fit: understand requests and match",
  continuity: "Continuity: replan when things change",
};

export function LandingPage() {
  const [hover, setHover] = useState<Petal | null>(null);
  const [active, setActive] = useState<Petal | null>(null);

  // Scroll-spy: the chapter rail follows whichever chapter is on screen.
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id === "hero" ? null : (visible.target.id as Petal));
    }, { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] });
    ["hero", ...CHAPTERS.map((c) => c.id)].forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const opacity = (p: Petal) => (hover && hover !== p ? 0.22 : 0.88);

  return (
    <div className="landing">
      <header className="l-top">
        <div className="l-wrap l-top-inner">
          <a href="#top" className="l-brand"><PetalMark size={32} /><span>Kaigo</span></a>
          <nav aria-label="Story" className="l-nav">
            <a href="#how">How it works</a>
            {CHAPTERS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className={active === c.id ? "on" : ""} style={{ "--accent": PETAL_COLOUR[c.id] } as CSSProperties}>
                <span className="l-dot" />{c.name}
              </a>
            ))}
            <a href="#proof">Proof</a>
            <Link to="/present" className="l-ghost">Present ▷</Link>
            <Link to="/app" className="l-solid">Open the app</Link>
          </nav>
        </div>
      </header>

      <main id="top" className="l-wrap">
        <section id="hero" className="l-hero">
          <div className="l-hero-text">
            <span className="l-eyebrow">{HERO.eyebrow}</span>
            <h1>{HERO.title} <em>{HERO.emphasis}</em></h1>
            <p className="l-lead">{HERO.body}</p>
            <div className="l-ctas">
              <Link to="/tour/1?setup=1" className="l-btn solid">Take the 2-minute guided tour</Link>
              <Link to="/app" className="l-btn">Explore the live demo</Link>
            </div>
          </div>
          <div className="l-hero-mark">
            <div className="l-mark-box">
              <svg viewBox="0 0 100 100" role="img" aria-label="The Kaigo mark: three petals for Trust, Fit and Continuity">
                <circle cx="50" cy="50" r="48" fill="#FFFFFF" stroke="#E5E2DB" strokeWidth="0.6" />
                <ellipse cx="50" cy="35" rx="17" ry="21" fill={PETAL_COLOUR.fit} fillOpacity={opacity("fit")} style={{ transition: "fill-opacity 250ms" }} />
                <ellipse cx="38" cy="58" rx="20" ry="16.5" transform="rotate(-22 38 58)" fill={PETAL_COLOUR.trust} fillOpacity={opacity("trust")} style={{ transition: "fill-opacity 250ms" }} />
                <ellipse cx="62" cy="58" rx="20" ry="16.5" transform="rotate(22 62 58)" fill={PETAL_COLOUR.continuity} fillOpacity={opacity("continuity")} style={{ transition: "fill-opacity 250ms" }} />
                <text x="50" y="57" textAnchor="middle" fontFamily="'Instrument Serif', Georgia, serif" fontStyle="italic" fontSize="13" fill="#1C1B19">K</text>
              </svg>
              {(["fit", "trust", "continuity"] as Petal[]).map((p) => {
                const c = CHAPTERS.find((x) => x.id === p)!;
                return (
                  <a key={p} href={`#${p}`} className={`l-petal-label ${p}`} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(p)} onBlur={() => setHover(null)}>
                    {c.name} · {p === "trust" ? "Verify" : p === "fit" ? "Match" : "Replan"}
                  </a>
                );
              })}
            </div>
            <span className="l-hint" aria-live="polite">{hover ? HINTS[hover] : "Hover or tap a petal to explore a service"}</span>
          </div>
        </section>

        <section className="l-problem" aria-label="The problem">
          <span className="l-time">{PROBLEM.time}</span>
          <p>{PROBLEM.text} <strong>{PROBLEM.turn}</strong></p>
        </section>

        <div id="how" className="l-chapters">
          <aside className="l-rail" aria-label="Chapters">
            <span className="l-eyebrow">Three services</span>
            {CHAPTERS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className={active === c.id ? "on" : ""} aria-current={active === c.id ? "true" : undefined}
                style={{ "--accent": PETAL_COLOUR[c.id] } as CSSProperties}>
                <span className="l-dot" />{c.number} {c.name}
              </a>
            ))}
            <a href="#top" className="l-rail-top">↑ Back to top</a>
          </aside>

          <div className="l-chapter-list">
            {CHAPTERS.map((c) => (
              <section key={c.id} id={c.id} aria-labelledby={`${c.id}-h`} className={`l-chapter ${c.id === "continuity" ? "dark" : ""}`}>
                <span className="l-chapter-tag" style={{ color: c.id === "continuity" ? "#E3C2BC" : PETAL_INK[c.id] }}>
                  <span className="l-dot" style={{ background: PETAL_COLOUR[c.id] }} />{c.number} · {c.name}
                </span>
                <h2 id={`${c.id}-h`}>{c.title}</h2>
                <div className="l-chapter-body">
                  <div className="stack">
                    <p className="l-body">{c.body}</p>
                    {c.extra && <p className="l-body small-note">{c.extra}</p>}
                    <div className="l-roles">
                      {c.roles.map((r) => <div key={r.who} className={`l-role ${r.style}`}><strong>{r.who}</strong>{r.what}</div>)}
                    </div>
                    <div className="l-ctas">
                      <Link to={`/tour/${c.tourStep}?setup=1`} className="l-btn solid">Try it live →</Link>
                      {c.links.map((l) => <Link key={l.to} to={l.to} className="l-btn">{l.label}</Link>)}
                    </div>
                  </div>
                  <ChapterPreview petal={c.id} />
                </div>
              </section>
            ))}
          </div>
        </div>

        <section id="proof" className="l-proof" aria-labelledby="proof-h">
          <h2 id="proof-h">Measured, not claimed.</h2>
          <div className="l-proof-grid">
            {PROOF.map((p) => <div key={p.value}><span>{p.value}</span>{p.label}</div>)}
          </div>
          <p className="l-note">{PROOF_NOTE}</p>
          <div className="l-stack" aria-label="Built on Google Cloud">
            <span className="l-eyebrow">Built on Google Cloud</span>
            {STACK.map((s) => <span key={s} className="l-pill">{s}</span>)}
          </div>
        </section>

        <section className="l-principles" aria-labelledby="principles-h">
          <h2 id="principles-h">Responsible by design.</h2>
          <div className="l-principles-grid">
            {PRINCIPLES.map((p) => <div key={p.title}><strong>{p.title}</strong><span>{p.text}</span></div>)}
          </div>
          <Link to="/how-it-works" className="l-btn">How it works in detail</Link>
        </section>

        <section className="l-final" aria-label="Start">
          <h2>See it on tonight’s schedule.</h2>
          <div className="l-ctas">
            <Link to="/tour/1?setup=1" className="l-btn solid">Take the guided tour</Link>
            <Link to="/app" className="l-btn">Open the app</Link>
            <Link to="/present" className="l-btn">Present ▷</Link>
            <a href="#top" className="l-btn">↑ Back to top</a>
          </div>
        </section>
      </main>

      <footer className="l-footer l-wrap">
        <span>Kaigo · Google Cloud AI Builder Cup 2026 · synthetic demo data only</span>
        <a href="https://github.com/data-with-saumya/kaigo-ai" target="_blank" rel="noreferrer">Source on GitHub</a>
      </footer>
    </div>
  );
}

export function PetalMark({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill={light ? "none" : "#FFFFFF"} stroke={light ? "#57544D" : "#C9C4BA"} strokeWidth="2.5" />
      <ellipse cx="50" cy="37" rx="18.5" ry="22" fill="#C29A55" fillOpacity="0.88" />
      <ellipse cx="39" cy="57" rx="21.5" ry="18" transform="rotate(-22 39 57)" fill="#8F7A60" fillOpacity="0.85" />
      <ellipse cx="61" cy="57" rx="21.5" ry="18" transform="rotate(22 61 57)" fill="#B48A84" fillOpacity="0.8" />
    </svg>
  );
}

function ChapterPreview({ petal }: { petal: Petal }) {
  if (petal === "trust") {
    return (
      <figure className="l-preview">
        <div className="l-preview-head"><strong>Priya Nair · registration</strong><span>6 of 7 rules passed</span></div>
        <div className="l-check ok">✓ In date until Jun 2027</div>
        <div className="l-check ok">✓ Council recognised</div>
        <div className="l-check review">! Palliative care: no evidence yet</div>
        <figcaption>From the Verification screen</figcaption>
      </figure>
    );
  }
  if (petal === "fit") {
    return (
      <figure className="l-preview">
        <blockquote>“Wound-care nurse, 6 PM to 6 AM, for the next five days.”</blockquote>
        <div className="l-rank"><strong>Anjali Rao</strong><span>Knows the client · 15 min by road</span><b>97</b></div>
        <div className="l-rank"><strong>Priya Nair</strong><span>New to the client · 32 min by road</span><b>81</b></div>
        <figcaption>Scores from the live engine, with real driving times</figcaption>
      </figure>
    );
  }
  return (
    <figure className="l-preview dark">
      <div className="l-bubble">Anjali: “I can’t make my shift tomorrow night.”</div>
      <div className="l-bar"><span style={{ flex: 1, background: "#D9BE8C" }}>A · Priya, full night · 81</span></div>
      <div className="l-bar"><span style={{ flex: 1, background: "#D4B3AD" }}>B · Deepa</span><i /><span style={{ flex: 1, background: "#D9BE8C" }}>then Priya · 81</span></div>
      <div className="l-bubble me">Deepa’s phone: “You’re booked. Handover note below.”</div>
      <figcaption>Tied on score; rule C-02 prefers fewer handovers. You decide.</figcaption>
    </figure>
  );
}
