import { createContext, useContext, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { api } from "../lib/api";
import { useLive } from "../lib/hooks";
import type { Dashboard, Health } from "../lib/types";
import { IconBook, IconClipboard, IconDashboard, IconLoop, IconShield, Logo } from "./Icons";

interface WorkspaceState {
  dashboard: Dashboard | null;
  health: Health | null;
  aiAvailable: boolean;
}
const WorkspaceContext = createContext<WorkspaceState>({ dashboard: null, health: null, aiAvailable: false });
export const useWorkspace = () => useContext(WorkspaceContext);

export function Shell({ children }: { children: ReactNode }) {
  const dashboard = useLive(api.dashboard);
  const health = useLive(api.health, [], 30000);
  const k = dashboard.data?.kpis;
  const aiAvailable = health.data?.gemini === "available";

  const nav = [
    { to: "/", label: "Dashboard", icon: <IconDashboard />, end: true },
    { to: "/verify", label: "Verification", icon: <IconShield />, badge: k?.pending_verifications },
    { to: "/requests", label: "Care requests", icon: <IconClipboard />, badge: k?.open_requests },
    { to: "/continuity", label: "Continuity", icon: <IconLoop />, badge: k?.continuity_alerts, alert: true },
    { to: "/how-it-works", label: "How it works", icon: <IconBook /> },
  ];

  return (
    <WorkspaceContext.Provider value={{ dashboard: dashboard.data, health: health.data, aiAvailable }}>
      <div className="shell">
        <nav className="nav" aria-label="Primary">
          <Link to="/" className="brand"><Logo /><span className="brand-name">Kaigo AI</span></Link>
          <div className="nav-section">
            <div className="nav-label">Operations</div>
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                {item.icon}<span>{item.label}</span>
                {item.badge ? <span className={`badge${item.alert ? " alert" : ""}`}>{item.badge}</span> : null}
              </NavLink>
            ))}
          </div>
          <div className="nav-section">
            <div className="nav-label">Care verticals</div>
            <div className="pill-group">
              <span className="pill on">Home nursing</span>
              <span className="pill on">Hospice</span>
              <span className="pill later" title="Same engine, different configuration. Planned after the competition.">Childcare · later</span>
            </div>
          </div>
          <div className="nav-foot">
            <div className="inline" style={{ gap: 10 }}>
              <span className="avatar" style={{ width: 36, height: 36, background: "var(--ink)", color: "var(--ivory)", border: "none", fontFamily: "var(--font-ui)", fontSize: 13 }}>CC</span>
              <span className="stack-sm" style={{ gap: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Care coordinator</span>
                <span>Demo agency · Bengaluru</span>
              </span>
            </div>
            <span>Synthetic demo data only. No real patient or caregiver information.</span>
          </div>
        </nav>
        <main className="main">{children}</main>
      </div>
    </WorkspaceContext.Provider>
  );
}

export function Page({ eyebrow, title, actions, children }: { eyebrow: ReactNode; title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { health, aiAvailable } = useWorkspace();
  return (
    <>
      <header className="topbar">
        <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
        </div>
        <div className="topbar-actions">
          {actions}
          {health && (
            <span className={`chip ${aiAvailable ? "ok" : "review"}`} title={aiAvailable ? `Model: ${health.model}` : "AI steps are paused. Rules, records and schedules still work."}
              style={{ minHeight: 36, padding: "0 14px" }}>
              <span className="status-dot" />{aiAvailable ? "Gemini online" : "Gemini unavailable"}
            </span>
          )}
        </div>
      </header>
      <div className="content">{children}</div>
    </>
  );
}
