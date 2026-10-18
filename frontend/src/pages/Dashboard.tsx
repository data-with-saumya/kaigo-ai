import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuditList } from "../components/AuditList";
import { More } from "../components/Flow";
import { Page, useWorkspace } from "../components/Shell";
import { ErrorNotice, Notice, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { longDay, relativeDay, span } from "../lib/format";
import { broadcastRefresh, useAction } from "../lib/hooks";

type Need = { key: string; tone: "continuity" | "trust" | "fit" | "review"; text: string; action: string; to?: string; run?: () => void };

/** Today: what needs you, in order, one button each. Then the shifts coming up. */
export function DashboardPage() {
  const { dashboard: d, dashboardError, aiDown } = useWorkspace();
  const navigate = useNavigate();
  const checks = useAction(api.runChecks);
  const [showAll, setShowAll] = useState(false);

  if (!d) return (
    <Page title="Today">
      {dashboardError ? <ErrorNotice error={dashboardError} /> : <Spinner label="Setting up your demo agency…" />}
    </Page>
  );
  const k = d.kpis;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const needs: Need[] = [
    ...d.alerts.map((a) => ({ key: a.event_id, tone: "continuity" as const,
      text: !a.summary ? `${a.caregiver_name ?? "A caregiver"} reported a change.` : a.caregiver_name && !a.summary.includes(a.caregiver_name) ? `${a.caregiver_name}: ${a.summary}` : a.summary,
      action: "Replan", to: `/continuity/${a.event_id}` })),
    ...(d.alerts.length === 0 && k.at_risk_shifts > 0 ? [{ key: "risk", tone: "review" as const,
      text: `${k.at_risk_shifts} upcoming shift${k.at_risk_shifts > 1 ? "s are" : " is"} at risk: a registration lapses before the shift ends.`,
      action: "Plan replacements", run: async () => { const r = await checks.run(); broadcastRefresh(); if (r?.opened.length) navigate(`/continuity/${r.opened[0].id}`); } }] : []),
    ...d.pending_verifications.map((p) => ({ key: `v-${p.caregiver_id}`, tone: "trust" as const, text: `${p.name}: ${p.reason.replace(/\.$/, "")}.`,
      action: p.credential_id ? "Review" : "Check", to: p.credential_id ? `/verify?credential=${p.credential_id}` : `/verify?caregiver=${p.caregiver_id}` })),
    ...d.open_requests.map((r) => ({ key: r.id, tone: "fit" as const,
      text: `${r.client_name}: ${r.needs_review.length ? "booking needs your confirmation" : "booking not finished"}.`, action: "Book", to: `/requests/${r.id}` })),
  ];
  const shifts = showAll ? d.upcoming_shifts : d.upcoming_shifts.slice(0, 5);

  return (
    <Page title={`${greeting}.`} lead={`${longDay(d.now)} · ${k.active_assignments} active bookings · ${k.shifts_next_24h} shifts in the next 24 hours${k.uncovered_upcoming ? ` · ${k.uncovered_upcoming} not fully covered` : ", all covered"}.`}>
      {aiDown && <Notice tone="review">Gemini is paused. Records, rules, matching and replanning still work; reading documents and messages waits until it’s back.</Notice>}

      <section className="needs" aria-labelledby="needs-title">
        <h2 id="needs-title" className="section-title">{needs.length ? `Needs you (${needs.length})` : "Nothing needs you right now."}</h2>
        {needs.length > 0 && (
          <ol className="need-list">
            {needs.map((n) => (
              <li key={n.key} className={`need ${n.tone}`}>
                <span className="need-dot" />
                <span className="need-text">{n.text}</span>
                {n.to ? <Link className="btn small" to={n.to} viewTransition>{n.action}</Link>
                  : <button className="btn small" disabled={checks.busy} onClick={n.run}>{n.action}</button>}
              </li>
            ))}
          </ol>
        )}
        {checks.busy && <Spinner label="Checking upcoming shifts…" />}
        <ErrorNotice error={checks.error} />
        {!needs.length && <p className="muted">Start a new booking from <strong>Book</strong>, or try a scenario from <strong>Guide</strong>.</p>}
      </section>

      <section aria-labelledby="shifts-title" className="stack">
        <h2 id="shifts-title" className="section-title">Coming up</h2>
        <ul className="shift-list">
          {shifts.map((s) => {
            const who = s.segments.map((seg) => seg.caregiver_name ?? "Uncovered").join(" → ");
            const state = s.risk ? "At risk" : s.status === "covered" ? "Covered" : s.status === "partial" ? "Partly covered" : "Uncovered";
            return (
              <li key={s.id} className={`shift ${s.risk ? "risk" : s.status === "covered" ? "" : "gap"}`}>
                <span className="shift-when">{relativeDay(s.start)} <span className="muted">{span(s.start, s.end)}</span></span>
                <span className="shift-who">{s.client_name} <span className="muted">· {who}</span></span>
                <span className="shift-state" title={s.risk ?? undefined}>{state}</span>
              </li>
            );
          })}
        </ul>
        {d.upcoming_shifts.length > 5 && (
          <button className="link-btn small" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${d.upcoming_shifts.length}`}
          </button>
        )}
      </section>

      <More label="Activity log: every AI suggestion, rule result and decision">
        <AuditList entries={d.recent_audit} />
      </More>
    </Page>
  );
}
