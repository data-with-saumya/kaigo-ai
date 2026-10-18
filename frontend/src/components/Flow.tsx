import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconCheck } from "./Icons";

/** Where you are in a job: numbered steps in one line, done ones ticked. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="steps" aria-label="Steps">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={s} className={state} aria-current={state === "now" ? "step" : undefined}>
            <span className="steps-n">{state === "done" ? <IconCheck size={14} /> : n}</span>
            <span className="steps-label">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One step of the flow: a number, a title, and only what this step needs. */
export function StepCard({ n, title, children, aside }: { n?: number; title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="step-card">
      <div className="step-head">
        {n !== undefined && <span className="step-n">{n}</span>}
        <h2 className="step-title">{title}</h2>
        {aside && <div className="step-aside">{aside}</div>}
      </div>
      <div className="step-body">{children}</div>
    </section>
  );
}

/** A finished step, folded to one line, with a way back to change it. */
export function DoneStep({ label, value, edit }: { label: string; value: ReactNode; edit?: { to: string; label?: string } | { onClick: () => void; label?: string } }) {
  return (
    <div className="done-step">
      <span className="done-tick"><IconCheck size={14} /></span>
      <span className="done-label">{label}</span>
      <span className="done-value">{value}</span>
      {edit && ("to" in edit
        ? <Link to={edit.to} className="done-edit">{edit.label ?? "Change"}</Link>
        : <button type="button" className="done-edit link-btn" onClick={edit.onClick}>{edit.label ?? "Change"}</button>)}
    </div>
  );
}

/** Everything that isn't needed to finish the step lives behind "Show details". */
export function More({ label = "Show details", children, open = false }: { label?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="more" open={open}>
      <summary>{label}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

/** A small, quiet marker for text Gemini wrote or read. */
export function ByGemini({ children = "Gemini" }: { children?: ReactNode }) {
  return <span className="by-gemini">{children}</span>;
}
