import { createContext, useContext, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ROLES, useGuide, type RoleKey } from "../lib/guide";
import { useLive } from "../lib/hooks";
import type { Dashboard, Health } from "../lib/types";
import { Logo } from "./Brand";

interface WorkspaceState {
  dashboard: Dashboard | null;
  dashboardError: unknown;
  health: Health | null;
  aiAvailable: boolean;
  /** True only once the health check has said Gemini is off. While it is still loading, pages must not claim Gemini is unavailable. */
  aiDown: boolean;
}
const WorkspaceContext = createContext<WorkspaceState>({ dashboard: null, dashboardError: null, health: null, aiAvailable: false, aiDown: false });
export const useWorkspace = () => useContext(WorkspaceContext);

/** Which audience a page belongs to: the tab you opened it from, or the guide you are following. */
export function useActiveRole(): RoleKey {
  const { pathname } = useLocation();
  const { guide } = useGuide();
  const fromPath = ROLES.find((r) => pathname === `/for/${r.key}` || pathname.startsWith(`/for/${r.key}/`));
  return fromPath?.key ?? guide?.role ?? "coordinator";
}

/** The app: the logo and one tab for each audience. Working screens open from the guides inside each tab. */
export function Shell({ children }: { children: ReactNode }) {
  const dashboard = useLive(api.dashboard);
  const health = useLive(api.health, [], 30000);
  const active = useActiveRole();
  const aiAvailable = health.data?.gemini === "available";
  const aiDown = !!health.data && !aiAvailable;

  return (
    <WorkspaceContext.Provider value={{ dashboard: dashboard.data, dashboardError: dashboard.error, health: health.data, aiAvailable, aiDown }}>
      <div className="app paper-lined">
        <header className="app-top">
          <div className="app-top-inner">
            <Link to="/" className="brand" aria-label="KaigoAI website" viewTransition><Logo height={26} /></Link>
            <nav className="tabs" aria-label="Who is it for?">
              {ROLES.map((r) => (
                <NavLink key={r.key} to={`/for/${r.key}`} viewTransition className={() => `tab${r.key === active ? " active" : ""}`}
                  aria-current={r.key === active ? "page" : undefined}>
                  <span className="tab-long">{r.tab}</span><span className="tab-short">{r.short}</span>
                </NavLink>
              ))}
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

/** Back to the previous page; if this is the first page of the visit, to `fallback`. */
export function BackButton({ fallback = "/for/coordinator", className = "back-link" }: { fallback?: string; className?: string }) {
  const navigate = useNavigate();
  const hasHistory = typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0;
  return (
    <button type="button" className={className} onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}>
      ← Back
    </button>
  );
}

/** A page: Back, one clear title, an optional one-line lead. `back` is where Back goes if there is no previous page. */
export function Page({ title, lead, back, actions, children }: {
  title: ReactNode; lead?: ReactNode; back?: { to: string; label?: string }; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        <div className="stack-sm" style={{ gap: 8, minWidth: 0 }}>
          <BackButton fallback={back?.to} />
          <h1 className="page-title">{title}</h1>
          {lead && <p className="page-lead">{lead}</p>}
        </div>
        {actions && <div className="topbar-actions">{actions}</div>}
      </div>
      <div className="content">{children}</div>
    </>
  );
}
