import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { api } from "../lib/api";
import { useLive } from "../lib/hooks";
import { PETAL_COLOUR, type Petal } from "../lib/story";
import type { Dashboard, Health } from "../lib/types";
import { Logo, Note, Pen } from "./Brand";

interface WorkspaceState {
  dashboard: Dashboard | null;
  dashboardError: unknown;
  health: Health | null;
  aiAvailable: boolean;
}
const WorkspaceContext = createContext<WorkspaceState>({ dashboard: null, dashboardError: null, health: null, aiAvailable: false });
export const useWorkspace = () => useContext(WorkspaceContext);

/** The coordinator app: the logo, one row of tabs, and the page. Nothing else to learn. */
export function Shell({ children }: { children: ReactNode }) {
  const dashboard = useLive(api.dashboard);
  const health = useLive(api.health, [], 30000);
  const k = dashboard.data?.kpis;
  const aiAvailable = health.data?.gemini === "available";

  const tabs: { to: string; label: string; hint: string; petal?: Petal; badge?: number; alert?: boolean; end?: boolean }[] = [
    { to: "/app", label: "Today", hint: "What needs you today", end: true },
    { to: "/verify", label: "Trust", hint: "Verify caregivers' papers", petal: "trust", badge: k?.pending_verifications },
    { to: "/requests", label: "Fit", hint: "Care requests and matching", petal: "fit", badge: k?.open_requests },
    { to: "/continuity", label: "Continuity", hint: "Changes and replanning", petal: "continuity", badge: k?.continuity_alerts, alert: true },
    { to: "/messages", label: "Messages", hint: "Chat with caregivers", badge: k?.unread_messages, alert: true },
  ];

  return (
    <WorkspaceContext.Provider value={{ dashboard: dashboard.data, dashboardError: dashboard.error, health: health.data, aiAvailable }}>
      <div className="app paper-lined">
        <header className="app-top">
          <div className="app-top-inner">
            <Link to="/" className="brand" aria-label="Kaigo website" viewTransition><Logo height={26} /></Link>
            <nav className="tabs" aria-label="Kaigo">
              {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} title={t.hint} viewTransition
                  className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                  style={t.petal ? ({ "--accent": PETAL_COLOUR[t.petal] } as CSSProperties) : undefined}>
                  {({ isActive }) => (
                    <>
                      {t.petal && <span className="svc-dot" />}{t.label}
                      {t.badge ? <span className={`badge${t.alert ? " alert" : ""}`}>{t.badge}</span> : null}
                      {isActive && <Pen stroke="underline" className="tab-under" width={2.2} />}
                    </>
                  )}
                </NavLink>
              ))}
              <NavLink to="/learn" title="Learn Kaigo in six steps" viewTransition className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
                {({ isActive }) => (
                  <><span className="learn-icon" aria-hidden="true">✎</span>Learn{isActive && <Pen stroke="underline" className="tab-under" width={2.2} />}</>
                )}
              </NavLink>
            </nav>
            {health.data && (
              <span className={`ai-status${aiAvailable ? "" : " off"}`} title={aiAvailable ? `Model: ${health.data.model}` : "AI steps are paused. Rules, records and schedules still work."}>
                <span className="status-dot" /><span>{aiAvailable ? "Gemini on" : "Gemini paused"}</span>
              </span>
            )}
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </WorkspaceContext.Provider>
  );
}

/** A page in the notebook: an optional pen note in the margin, a small label, a big title. */
export function Page({ eyebrow, title, actions, back, note, children }: {
  eyebrow: ReactNode; title: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; note?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        {note && <Note className="page-note" rotate={-4}>{note}</Note>}
        <div className="stack-sm" style={{ gap: 6, minWidth: 0 }}>
          {back && <Link to={back.to} className="back-link" viewTransition>← {back.label}</Link>}
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
        </div>
        {actions && <div className="topbar-actions">{actions}</div>}
      </div>
      <div className="content">{children}</div>
    </>
  );
}
