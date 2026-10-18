import { useCallback, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CHAPTERS, HERO, PETAL_COLOUR, PROBLEM, PROOF, PROOF_NOTE, STACK } from "../lib/story";
import { Logo, Pen } from "../components/Brand";
import "./present.css";

const SLIDES = [
  { key: "cover", title: "21:32", sub: "A nurse cancels", accent: "#2A1838" },
  ...CHAPTERS.map((c) => ({ key: c.id, title: c.name, sub: c.title, accent: PETAL_COLOUR[c.id] })),
  { key: "proof", title: "Proof", sub: "Measured, not claimed", accent: "#2A1838" },
  { key: "start", title: "Start", sub: "Try it live", accent: "#2A1838" },
];

export function PresentPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const i = Math.min(Math.max(Number(params.get("s") ?? 1) - 1, 0), SLIDES.length - 1);
  const overview = params.get("view") === "all";
  const go = useCallback((n: number) => setParams({ s: String(Math.min(Math.max(n, 0), SLIDES.length - 1) + 1) }), [setParams]);
  const toggleOverview = useCallback(() => setParams(overview ? { s: String(i + 1) } : { s: String(i + 1), view: "all" }), [overview, i, setParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(i + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(i - 1); }
      else if (e.key.toLowerCase() === "o") toggleOverview();
      else if (e.key === "Escape") { if (overview) toggleOverview(); else navigate("/"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, overview, go, toggleOverview, navigate]);

  const slide = SLIDES[i];
  const dark = slide.key === "continuity" && !overview;
  const chapter = CHAPTERS.find((c) => c.id === slide.key);

  return (
    <div className={`present ${dark ? "dark paper-night" : "paper-lined"}`}>
      <header className="p-top">
        <button type="button" className="p-brand" onClick={() => go(0)} aria-label="KaigoAI, first slide"><Logo height={28} tone={dark ? "dark" : "light"} /></button>
        <span className="p-label">{overview ? "All slides" : `${String(i + 1).padStart(2, "0")} / ${String(SLIDES.length).padStart(2, "0")} · ${slide.title}`}</span>
        <div className="p-actions">
          <button type="button" className="p-btn" onClick={toggleOverview} aria-pressed={overview}>▦ Overview <kbd>O</kbd></button>
          <Link to="/" className="p-btn">Exit <kbd>Esc</kbd></Link>
        </div>
      </header>
      <div className="p-progress" aria-hidden="true"><span style={{ width: `${((i + 1) / SLIDES.length) * 100}%`, background: dark ? "#FFC93C" : slide.accent }} /></div>

      {overview ? (
        <div className="p-overview">
          {SLIDES.map((s, n) => (
            <button key={s.key} type="button" onClick={() => go(n)} className={`p-thumb ${s.key === "continuity" ? "dark" : ""} ${n === i ? "here" : ""}`}
              style={{ borderColor: n === i ? s.accent : "transparent" }}>
              <span className="p-thumb-n">{String(n + 1).padStart(2, "0")}</span>
              <span className="p-thumb-title">{s.title}</span>
              <span className="p-thumb-sub">{s.sub}</span>
            </button>
          ))}
        </div>
      ) : (
        <main className="p-stage" aria-live="polite">
          {slide.key === "cover" && (
            <section className="p-cover">
              <span className="p-huge"><span className="pen-wrap">{PROBLEM.time}<Pen stroke="circle" className="ring" width={2.4} delay={500} /></span>.</span>
              <h1>{PROBLEM.text.replace("Most staffing tools ask who is free.", "")}<span className="highlight">{" "}{HERO.emphasis}</span></h1>
              <p className="p-lead">{HERO.body}</p>
              <div className="p-ctas"><button type="button" className="p-cta solid" onClick={() => go(1)}>Start →</button><Link to="/tour/1?setup=1" className="p-cta">Skip to the guided tour</Link></div>
            </section>
          )}
          {chapter && (
            <section className="p-chapter">
              <div className="p-text">
                <span className="p-tag"><span style={{ background: PETAL_COLOUR[chapter.id] }} />{chapter.number} · {chapter.name}</span>
                <h1>{chapter.title}</h1>
                <p className="p-lead">{chapter.body}</p>
                <div className="p-ctas">
                  <Link to={`/tour/${chapter.tourStep}?setup=1`} className="p-cta solid">Try it live →</Link>
                  <Link to={chapter.links[0].to} className="p-cta">{chapter.links[0].label}</Link>
                </div>
              </div>
              <ol className="p-roles">
                {chapter.roles.map((r, n) => <li key={r.who} className={r.style}><span>{n + 1}</span><strong>{r.who}</strong> {r.what}</li>)}
              </ol>
            </section>
          )}
          {slide.key === "proof" && (
            <section className="p-proof">
              <h1><span className="pen-wrap">Measured<Pen stroke="underline" className="under" width={2.2} delay={300} /></span>, not claimed.</h1>
              <div className="p-proof-grid">{PROOF.map((p) => <div key={p.value}><span>{p.value}</span>{p.label}</div>)}</div>
              <p className="p-note">{PROOF_NOTE}</p>
              <div className="p-stack">{STACK.map((s) => <span key={s}>{s}</span>)}</div>
            </section>
          )}
          {slide.key === "start" && (
            <section className="p-cover">
              <h1 className="p-big">See it on tonight’s schedule.</h1>
              <div className="p-ctas">
                <Link to="/tour/1?setup=1" className="p-cta solid">Take the guided tour</Link>
                <Link to="/for/coordinator" className="p-cta">Open the app</Link>
                <button type="button" className="p-cta" onClick={() => go(0)}>↺ Back to the beginning</button>
              </div>
            </section>
          )}
        </main>
      )}

      <footer className="p-foot">
        <button type="button" className="p-nav" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide">← {i > 0 ? SLIDES[i - 1].title : "Back"}</button>
        <div className="p-dots" role="group" aria-label="Slides">
          {SLIDES.map((s, n) => (
            <button key={s.key} type="button" onClick={() => go(n)} aria-label={`Slide ${n + 1}: ${s.title}`} aria-current={n === i ? "step" : undefined}
              style={{ width: n === i ? 36 : 12, background: n === i ? (dark ? "#FFC93C" : s.accent) : dark ? "#4a3b55" : "#DCCBB3" }} />
          ))}
        </div>
        <button type="button" className="p-nav solid" onClick={() => go(i + 1)} disabled={i === SLIDES.length - 1} aria-label="Next slide">{i < SLIDES.length - 1 ? SLIDES[i + 1].title : "End"} →</button>
      </footer>
    </div>
  );
}
