import type { ReactNode } from "react";
import type { ActorType, Factor, VerificationStatus } from "../lib/types";
import { IconAlert, IconCheck, IconInfo, IconPerson, IconRule, IconSpark, IconX } from "./Icons";

/** Who produced a value: Gemini (dashed), a deterministic rule (solid) or a person (filled). */
export function Provenance({ kind, children }: { kind: ActorType; children: ReactNode }) {
  const icon = kind === "ai" ? <IconSpark size={12} /> : kind === "rule" ? <IconRule size={12} />
    : kind === "human" ? <IconPerson size={12} /> : null;
  return <span className={`chip ${kind}`}>{icon}{children}</span>;
}

export function actorLabel(actorType: ActorType, actor: string) {
  if (actorType === "ai") return "Gemini";
  if (actorType === "human") return "Coordinator";
  return actor;
}

const STATUS: Record<VerificationStatus, { cls: string; label: string }> = {
  verified: { cls: "ok", label: "Verified" },
  ready: { cls: "ok", label: "Rules passed · awaiting approval" },
  needs_review: { cls: "review", label: "Needs review" },
  blocked: { cls: "risk", label: "Blocked" },
  pending: { cls: "", label: "Awaiting document" },
  rejected: { cls: "risk", label: "Rejected" },
};

export function VerificationChip({ status }: { status: VerificationStatus }) {
  const s = STATUS[status];
  const icon = s.cls === "ok" ? <IconCheck size={13} /> : s.cls === "review" ? <IconAlert size={13} />
    : s.cls === "risk" ? <IconX size={13} /> : null;
  return <span className={`chip ${s.cls}`}>{icon}{s.label}</span>;
}

export function Notice({ tone = "info", children, role }: { tone?: "info" | "review" | "risk" | "ok"; children: ReactNode; role?: string }) {
  const icon = tone === "ok" ? <IconCheck size={18} /> : tone === "info" ? <IconInfo size={18} /> : <IconAlert size={18} />;
  return <div className={`notice ${tone}`} role={role ?? (tone === "risk" ? "alert" : "status")}>{icon}<div>{children}</div></div>;
}

export function FactorBars({ factors }: { factors: Factor[] }) {
  return (
    <div className="factors">
      {factors.map((f) => (
        <div className="factor" key={f.key} title={f.detail}>
          <span className="name">{f.label}</span>
          <span className="bar" role="img" aria-label={`${f.label}: ${f.points} of ${f.max_points}. ${f.detail}`}>
            <span className={f.layer} style={{ width: `${(f.points / f.max_points) * 100}%` }} />
          </span>
          <span className="pts">{f.points}/{f.max_points}</span>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return <span className="inline muted small"><span className="spinner" aria-hidden="true" />{label}</span>;
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const aiDown = typeof error === "object" && error !== null && (error as { code?: string }).code === "ai_unavailable";
  return (
    <Notice tone={aiDown ? "review" : "risk"}>
      {aiDown ? <><strong>Gemini is unavailable.</strong> {message}</> : message}
    </Notice>
  );
}

export function Card({ title, actions, children, className = "", labelledBy }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; labelledBy?: string;
}) {
  return (
    <section className={`card ${className}`} aria-labelledby={labelledBy}>
      {(title || actions) && (
        <div className="spread">
          {title && <h2 className="card-title" id={labelledBy}>{title}</h2>}
          {actions && <div className="inline">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
