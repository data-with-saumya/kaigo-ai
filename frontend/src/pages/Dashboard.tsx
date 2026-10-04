import { Link, useNavigate } from "react-router-dom";
import { AuditList } from "../components/AuditList";
import { IconArrow, IconLoop } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { Card, ErrorNotice, Notice, Spinner, VerificationChip } from "../components/ui";
import { api } from "../lib/api";
import { longDay, relativeDay, span, vertical } from "../lib/format";
import { useAction } from "../lib/hooks";

export function DashboardPage() {
  const { dashboard: d, dashboardError, aiAvailable, health } = useWorkspace();
  const navigate = useNavigate();
  const reset = useAction(api.reset);
  const checks = useAction(api.runChecks);

  if (!d) return (
    <Page eyebrow="Operations" title="Today’s care picture">
      {dashboardError ? <ErrorNotice error={dashboardError} /> : <Spinner label="Setting up your demo agency…" />}
    </Page>
  );
  const k = d.kpis;
  const [first, ...more] = d.alerts;

  return (
    <Page eyebrow={longDay(d.now)} title="Today’s care picture">
      {health && !aiAvailable && (
        <Notice tone="review">
          <strong>Gemini is unavailable right now.</strong> Records, schedules, rule checks, matching and replanning still
          work. Reading documents and messages, and writing explanations, are paused. Nothing will be guessed.
        </Notice>
      )}

      {first && (
        <section className="alert-banner" aria-labelledby="alert-title">
          <div className="inline" style={{ flex: "1 1 420px", alignItems: "flex-start", gap: 16, flexWrap: "nowrap" }}>
            <span className="alert-icon"><IconLoop size={22} /></span>
            <div className="stack-sm">
              <div className="eyebrow">Continuity alert · {relativeDay(first.received_at)}</div>
              <h2 id="alert-title">{first.caregiver_name ? `${first.caregiver_name}: change reported` : "Change reported"}</h2>
              <p>{first.summary}{first.options ? ` Kaigo prepared ${first.options} option${first.options > 1 ? "s" : ""} and is waiting for your decision.` : ""}</p>
            </div>
          </div>
          <Link className="btn gold" to={`/continuity/${first.event_id}`}>Review options<IconArrow size={16} /></Link>
        </section>
      )}
      {!first && k.at_risk_shifts > 0 && (
        <Notice tone="review">
          <strong>{k.at_risk_shifts} upcoming shift{k.at_risk_shifts > 1 ? "s are" : " is"} at risk</strong>: a caregiver’s registration lapses before the shift ends (rule E-02).{" "}
          <button className="link-btn" disabled={checks.busy} onClick={async () => {
            const r = await checks.run(); if (r?.opened.length) navigate(`/continuity/${r.opened[0].id}`);
          }}>Plan replacements now</button>
        </Notice>
      )}
      {more.length > 0 && (
        <Notice tone="review">{more.length} more change{more.length > 1 ? "s" : ""} waiting. <Link to="/continuity">See all</Link></Notice>
      )}

      <section aria-label="Today at a glance" className="grid-auto">
        <div className="card kpi"><span className="label">Active assignments</span><span className="value">{k.active_assignments}</span>
          <span className="small muted">{Object.entries(k.assignments_by_vertical).map(([v, n]) => `${vertical(v)} ${n}`).join(" · ")}</span></div>
        <div className="card kpi"><span className="label">Shifts in next 24 h</span><span className="value">{k.shifts_next_24h}</span>
          <span className="small" style={{ color: k.uncovered_upcoming ? "var(--risk)" : "var(--muted)", fontWeight: k.uncovered_upcoming ? 600 : 400 }}>
            {k.uncovered_upcoming ? `${k.uncovered_upcoming} upcoming not fully covered` : "All upcoming shifts covered"}</span></div>
        <div className="card kpi"><span className="label"><span className="dot trust" />Pending verifications</span><span className="value">{k.pending_verifications}</span>
          <span className="small muted">{k.blocked_credentials} blocked by rules</span></div>
        <div className="card kpi"><span className="label"><span className="dot fit" />Open care requests</span><span className="value">{k.open_requests}</span>
          <span className="small muted">{k.requests_needing_confirmation} need confirmation</span></div>
        <div className="card kpi"><span className="label"><span className="dot continuity" />Continuity alerts</span><span className="value">{k.continuity_alerts}</span>
          <span className="small" style={{ color: k.at_risk_shifts ? "var(--review)" : "var(--muted)", fontWeight: k.at_risk_shifts ? 600 : 400 }}>
            {k.at_risk_shifts ? `${k.at_risk_shifts} upcoming shift${k.at_risk_shifts > 1 ? "s" : ""} at risk` : k.continuity_alerts ? "Awaiting your decision" : "Nothing waiting"}</span></div>
      </section>

      <div className="row">
        <Card title="Upcoming shifts" className="grow-2" labelledBy="shifts-title">
          <div className="table-wrap">
            <table style={{ minWidth: 620 }}>
              <thead><tr><th>When</th><th>Client</th><th>Care</th><th>Caregiver</th><th>Status</th></tr></thead>
              <tbody>
                {d.upcoming_shifts.map((s) => (
                  <tr key={s.id} className={s.status === "covered" && !s.risk ? "" : "flag"}>
                    <td style={{ whiteSpace: "nowrap" }}><span className="num" style={{ fontSize: 17 }}>{relativeDay(s.start)} {span(s.start, s.end)}</span></td>
                    <td>{s.client_name}</td>
                    <td className="muted">{vertical(s.vertical)}</td>
                    <td>{s.segments.map((seg, i) => (
                      <span key={i} style={{ display: "block" }}>
                        {seg.caregiver_name ?? <span style={{ color: "var(--risk)", fontWeight: 600 }}>Uncovered</span>}
                        {s.segments.length > 1 && <span className="muted small"> {span(seg.start, seg.end)}</span>}
                      </span>))}
                      {s.risk && <span className="small" style={{ display: "block", color: "var(--review)" }}>{s.risk}</span>}</td>
                    <td>{s.risk
                      ? <span className="chip review" title={s.risk}>At risk</span>
                      : s.status === "covered"
                      ? <span className="chip ok">Covered</span>
                      : <Link to="/continuity" className="chip risk" style={{ textDecoration: "none" }}>{s.status === "partial" ? "Partly covered" : "Uncovered"}</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="col grow-1">
          <Card title="Pending verifications" actions={<Link to="/verify" className="small">Open</Link>}>
            {d.pending_verifications.length === 0 && <p className="muted">Everyone is verified.</p>}
            {d.pending_verifications.map((p) => (
              <Link key={p.caregiver_id} to={p.credential_id ? `/verify?credential=${p.credential_id}` : `/verify?caregiver=${p.caregiver_id}`}
                className="spread" style={{ textDecoration: "none", color: "inherit", minHeight: 44, flexWrap: "nowrap" }}>
                <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}><strong>{p.name}</strong><span className="small muted">{p.reason}</span></span>
                <VerificationChip status={p.status} />
              </Link>
            ))}
          </Card>
          <Card title="Open care requests" actions={<Link to="/requests/new" className="small">New request</Link>}>
            {d.open_requests.length === 0 && <p className="muted">No open requests.</p>}
            {d.open_requests.map((r) => (
              <Link key={r.id} to={`/requests/${r.id}`} className="stack-sm" style={{ textDecoration: "none", color: "inherit", gap: 0, minHeight: 44 }}>
                <strong>{r.client_name}</strong>
                <span className="small muted">{r.summary ?? r.id}{r.needs_review.length ? " · needs confirmation" : ""}</span>
              </Link>
            ))}
          </Card>
        </div>
      </div>

      <Card title="Audit trail" actions={<span className="small muted">Every AI suggestion, rule result and human decision</span>}>
        <AuditList entries={d.recent_audit} />
      </Card>

      <Card title="Demo controls" className="linen" actions={<span className="small muted">Your own synthetic agency. Nobody else sees your changes.</span>}>
        <p className="small">Start the story from the beginning, or jump straight to “Anjali is assigned for five nights” to try the cancellation and replanning flow. Open Anjali’s caregiver app in a second window and message the agency as she would.</p>
        <div className="inline">
          <button className="btn secondary small" disabled={reset.busy} onClick={async () => { if (await reset.run("fresh")) navigate("/verify"); }}>Start from the beginning</button>
          <button className="btn secondary small" disabled={reset.busy} onClick={async () => { if (await reset.run("after_assignment")) navigate("/continuity"); }}>Jump to: cancellation</button>
          <Link className="btn secondary small" to="/caregiver/CG-0101" target="_blank" rel="noreferrer">Open Anjali’s caregiver app</Link>
          <button className="btn small" disabled={checks.busy} onClick={async () => {
            const r = await checks.run(); if (r?.opened.length) navigate(`/continuity/${r.opened[0].id}`);
          }}>Run proactive checks now</button>
          {(reset.busy || checks.busy) && <Spinner label="Working…" />}
        </div>
        <p className="small muted">Proactive checks also run every night on Google Cloud Scheduler. They catch registrations that will lapse before an upcoming shift ends.</p>
        <ErrorNotice error={reset.error ?? checks.error} />
      </Card>
    </Page>
  );
}
