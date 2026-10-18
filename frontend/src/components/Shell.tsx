import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { broadcastRefresh, useLive } from "../lib/hooks";
import { PETAL_COLOUR, type Petal } from "../lib/story";
import { TOUR, setTourStep } from "../lib/tour";
import type { Dashboard, Health } from "../lib/types";
import { Logo, Thinking } from "./Brand";

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

type MenuItem =
  | { label: string; hint?: string; to: string }
  | { label: string; hint?: string; run: () => Promise<string | void> }
  | { divider: string };

interface Tab { label: string; petal?: Petal; badge?: number; alert?: boolean; paths: string[]; to?: string; items?: MenuItem[] }

/** The coordinator app: the logo, one row of tabs, and the page. Every option sits in its tab's dropdown. */
export function Shell({ children }: { children: ReactNode }) {
  const dashboard = useLive(api.dashboard);
  const health = useLive(api.health, [], 30000);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [working, setWorking] = useState<string | null>(null);
  const k = dashboard.data?.kpis;
  const aiAvailable = health.data?.gemini === "available";
  const aiDown = !!health.data && !aiAvailable;

  // Demo actions run from the menus, then land on the page that shows the result.
  const act = (label: string, fn: () => Promise<string | void>) => async () => {
    setWorking(label);
    try {
      const to = await fn();
      broadcastRefresh();
      if (to) navigate(to);
    } finally {
      setWorking(null);
    }
  };
  const reset = (scenario: "fresh" | "after_assignment", to: string) => async () => { setTourStep(null); await api.reset(scenario); return to; };
  const checks = async () => { const r = await api.runChecks(); return r.opened.length ? `/continuity/${r.opened[0].id}` : "/changes"; };

  const tabs: Tab[] = [
    { label: "Today", paths: ["/app"], to: "/app" },
    { label: "Verify", petal: "trust", badge: k?.pending_verifications, paths: ["/verify", "/documents"], items: [
      { label: "Check a document", hint: "Gemini reads it, the rules check it", to: "/verify" },
      { label: "All documents", to: "/documents" },
    ] },
    { label: "Book", petal: "fit", badge: k?.open_requests, paths: ["/requests"], items: [
      { label: "New booking", hint: "Describe the care in plain words", to: "/requests/new" },
      { label: "All bookings", to: "/requests" },
    ] },
    { label: "Replan", petal: "continuity", badge: k?.continuity_alerts, alert: true, paths: ["/continuity", "/changes"], items: [
      { label: "Report a change", hint: "A cancellation, new hours or urgent cover", to: "/continuity" },
      { label: "Changes waiting", to: "/changes" },
      { label: "Run proactive checks", hint: "Find registrations that lapse mid-shift", run: checks },
    ] },
    { label: "Messages", badge: k?.unread_messages, alert: true, paths: ["/messages"], items: [
      { label: "Inbox", to: "/messages" },
      { label: "Open Anjali’s phone app", hint: "See what a caregiver sees", to: "/caregiver/CG-0101" },
    ] },
    { label: "Guide", paths: ["/learn", "/how-it-works"], items: [
      { divider: "Six-step guide" },
      ...TOUR.map((t) => ({ label: `${t.n}. ${t.title}`, to: `/tour/${t.n}?setup=1` })),
      { divider: "Demo" },
      { label: "Start from the beginning", hint: "Reset to a fresh agency", run: reset("fresh", "/app") },
      { label: "Jump to: a cancellation", hint: "Anjali is booked; she’s about to cancel", run: reset("after_assignment", "/app") },
      { label: "How KaigoAI works", to: "/how-it-works" },
      { label: "Present the story", to: "/present" },
    ] },
  ];

  return (
    <WorkspaceContext.Provider value={{ dashboard: dashboard.data, dashboardError: dashboard.error, health: health.data, aiAvailable, aiDown }}>
      <div className="app paper-lined">
        <header className="app-top">
          <div className="app-top-inner">
            <Link to="/" className="brand" aria-label="KaigoAI website" viewTransition><Logo height={26} /></Link>
            <nav className="tabs" aria-label="KaigoAI">
              {tabs.map((t) => (
                <TabMenu key={t.label} tab={t} active={t.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))}
                  onRun={(item) => act(item.label, item.run)()} />
              ))}
            </nav>
            {working ? <Thinking label={`${working}…`} size={18} /> : health.data && (
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

/** One tab. A plain link, or a button that opens its dropdown of options. */
function TabMenu({ tab, active, onRun }: { tab: Tab; active: boolean; onRun: (item: { label: string; run: () => Promise<string | void> }) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const style = tab.petal ? ({ "--accent": PETAL_COLOUR[tab.petal] } as CSSProperties) : undefined;
  const inner = (
    <>
      {tab.petal && <span className="svc-dot" />}{tab.label}
      {tab.badge ? <span className={`badge${tab.alert ? " alert" : ""}`}>{tab.badge}</span> : null}
    </>
  );

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const r = button.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left - 12, window.innerWidth - 300)) });
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); window.removeEventListener("resize", close); };
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>("a, button")?.focus(); }, [open, pos]);

  if (!tab.items) {
    return <Link to={tab.to!} className={`tab${active ? " active" : ""}`} style={style} aria-current={active ? "page" : undefined} viewTransition>{inner}</Link>;
  }
  return (
    <>
      <button ref={button} type="button" className={`tab${active ? " active" : ""}${open ? " open" : ""}`} style={style}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {inner}<span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && pos && createPortal(
        // Rendered on <body>: the frosted header would otherwise trap the menu under the page.
        <div ref={menu} className="menu" role="menu" aria-label={tab.label} style={{ top: pos.top, left: pos.left }}>
          {tab.items.map((item, i) => "divider" in item ? <div key={i} className="menu-divider">{item.divider}</div>
            : "to" in item ? (
              <Link key={i} role="menuitem" to={item.to} className="menu-item" viewTransition onClick={() => setOpen(false)}>
                <span>{item.label}</span>{item.hint && <span className="menu-hint">{item.hint}</span>}
              </Link>
            ) : (
              <button key={i} role="menuitem" type="button" className="menu-item" onClick={() => { setOpen(false); onRun(item); }}>
                <span>{item.label}</span>{item.hint && <span className="menu-hint">{item.hint}</span>}
              </button>
            ))}
        </div>, document.body,
      )}
    </>
  );
}

/** A page: an optional back link, one clear title, an optional one-line lead. No margin notes, no clutter. */
export function Page({ title, lead, back, actions, children }: {
  title: ReactNode; lead?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        <div className="stack-sm" style={{ gap: 8, minWidth: 0 }}>
          {back && <Link to={back.to} className="back-link" viewTransition>← {back.label}</Link>}
          <h1 className="page-title">{title}</h1>
          {lead && <p className="page-lead">{lead}</p>}
        </div>
        {actions && <div className="topbar-actions">{actions}</div>}
      </div>
      <div className="content">{children}</div>
    </>
  );
}
