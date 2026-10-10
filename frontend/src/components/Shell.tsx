import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useLive } from "../lib/hooks";
import { PETAL_COLOUR, type Petal } from "../lib/story";
import type { Dashboard, Health } from "../lib/types";
import { Logo } from "./Icons";

interface WorkspaceState {
  dashboard: Dashboard | null;
  dashboardError: unknown;
  health: Health | null;
  aiAvailable: boolean;
}
const WorkspaceContext = createContext<WorkspaceState>({ dashboard: null, dashboardError: null, health: null, aiAvailable: false });
export const useWorkspace = () => useContext(WorkspaceContext);

interface Place {
  petal: Petal | null;
  section: string;
  sectionTo: string;
  page: string;
  prev?: { label: string; to: string };
  next?: { label: string; to: string };
  step?: "verify" | "request" | "match" | "replan" | "messages";
}

/** One map drives the breadcrumbs, the journey rail and the previous/next footer. */
function placeFor(path: string): Place {
  if (path.startsWith("/verify")) return { petal: "trust", section: "Trust", sectionTo: "/verify", page: "Verification",
    prev: { label: "Today", to: "/app" }, next: { label: "Care requests", to: "/requests/new" }, step: "verify" };
  if (/^\/requests\/[^/]+\/match/.test(path)) return { petal: "fit", section: "Fit", sectionTo: "/requests", page: "Matching",
    prev: { label: "Care requests", to: "/requests" }, next: { label: "Continuity", to: "/continuity" }, step: "match" };
  if (path.startsWith("/requests")) return { petal: "fit", section: "Fit", sectionTo: "/requests", page: "Care requests",
    prev: { label: "Verification", to: "/verify" }, next: { label: "Matching", to: "/requests" }, step: "request" };
  if (path.startsWith("/continuity")) return { petal: "continuity", section: "Continuity", sectionTo: "/continuity",
    page: path === "/continuity" ? "Changes" : "Replan", prev: { label: "Matching", to: "/requests" },
    next: { label: "Messages", to: "/messages" }, step: "replan" };
  if (path.startsWith("/messages")) return { petal: "continuity", section: "Continuity", sectionTo: "/continuity", page: "Messages",
    prev: { label: "Continuity", to: "/continuity" }, next: { label: "How it works", to: "/how-it-works" }, step: "messages" };
  if (path.startsWith("/how-it-works")) return { petal: null, section: "About", sectionTo: "/how-it-works", page: "How it works",
    prev: { label: "Messages", to: "/messages" }, next: { label: "Back to the story", to: "/" } };
  return { petal: null, section: "Today", sectionTo: "/app", page: "Today", next: { label: "Verification", to: "/verify" } };
}

const RAIL: { key: NonNullable<Place["step"]>; label: string; to: string }[] = [
  { key: "verify", label: "Verify", to: "/verify" },
  { key: "request", label: "Request", to: "/requests/new" },
  { key: "match", label: "Match", to: "/requests" },
  { key: "replan", label: "Replan", to: "/continuity" },
  { key: "messages", label: "Messages", to: "/messages" },
];

export function Shell({ children }: { children: ReactNode }) {
  const dashboard = useLive(api.dashboard);
  const health = useLive(api.health, [], 30000);
  const k = dashboard.data?.kpis;
  const aiAvailable = health.data?.gemini === "available";
  const { pathname } = useLocation();
  const place = placeFor(pathname);

  const nav: { to: string; label: string; petal: Petal | null; badge?: number; end?: boolean; match?: string[] }[] = [
    { to: "/app", label: "Today", petal: null, end: true },
    { to: "/verify", label: "Trust", petal: "trust", badge: k?.pending_verifications },
    { to: "/requests", label: "Fit", petal: "fit", badge: k?.open_requests },
    { to: "/continuity", label: "Continuity", petal: "continuity", badge: k?.continuity_alerts },
    { to: "/messages", label: "Messages", petal: "continuity", badge: k?.unread_messages },
  ];

  return (
    <WorkspaceContext.Provider value={{ dashboard: dashboard.data, dashboardError: dashboard.error, health: health.data, aiAvailable }}>
      <header className="app-top">
        <div className="app-top-inner">
          <Link to="/" className="brand" aria-label="Kaigo: back to the story"><Logo size={32} /><span className="brand-name">Kaigo</span></Link>
          <nav className="svc-nav" aria-label="Services">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `svc-link${isActive ? " active" : ""}`}
                style={{ "--accent": item.petal ? PETAL_COLOUR[item.petal] : "var(--ink)" } as CSSProperties}>
                {item.petal && <span className="svc-dot" />}{item.label}
                {item.badge ? <span className={`badge${item.to === "/continuity" || item.to === "/messages" ? " alert" : ""}`}>{item.badge}</span> : null}
              </NavLink>
            ))}
          </nav>
          <div className="top-actions">
            {health.data && (
              <span className={`chip ${aiAvailable ? "ok" : "review"}`} title={aiAvailable ? `Model: ${health.data.model}` : "AI steps are paused. Rules, records and schedules still work."}>
                <span className="status-dot" />{aiAvailable ? "Gemini online" : "Gemini unavailable"}
              </span>
            )}
            <Link className="btn quiet small" to="/tour/1?setup=1">Guided tour</Link>
            <Link className="btn quiet small" to="/present">Present</Link>
          </div>
        </div>
      </header>

      <div className="subbar">
        <nav className="crumbs" aria-label="You are here">
          <Link to="/" className="back-pill">← Overview</Link>
          <Link to="/app">Today</Link>
          {place.section !== "Today" && <><span aria-hidden="true">/</span><Link to={place.sectionTo}
            style={place.petal ? { color: `var(--${place.petal}-ink)` } : undefined}>{place.section}</Link></>}
          {place.page !== place.section && place.page !== "Today" && <><span aria-hidden="true">/</span><strong>{place.page}</strong></>}
        </nav>
        {place.step && (
          <ol className="rail" aria-label="Workflow">
            {RAIL.map((r) => (
              <li key={r.key}>{r.key === place.step ? <span className="here" aria-current="step">{r.label}</span> : <Link to={r.to}>{r.label}</Link>}</li>
            ))}
          </ol>
        )}
      </div>

      <main>{children}</main>

      {(place.prev || place.next) && (
        <nav className="pager" aria-label="Previous and next">
          {place.prev ? <Link to={place.prev.to}><span className="dir">← Previous</span><span className="to">{place.prev.label}</span></Link> : <span />}
          {place.next ? <Link to={place.next.to} className="next"><span className="dir">Next →</span><span className="to">{place.next.label}</span></Link> : <span />}
        </nav>
      )}
    </WorkspaceContext.Provider>
  );
}

export function Page({ eyebrow, title, actions, children }: { eyebrow: ReactNode; title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="topbar">
        <div className="stack-sm" style={{ gap: 6, minWidth: 0 }}>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
        </div>
        {actions && <div className="topbar-actions">{actions}</div>}
      </div>
      <div className="content">{children}</div>
    </>
  );
}
