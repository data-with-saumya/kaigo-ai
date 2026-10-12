import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IconCheck, IconSpark } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { Card, ErrorNotice, FactorBars, Notice, Provenance, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { day, initials, skill, span } from "../lib/format";
import { useAction, useLive } from "../lib/hooks";
import type { Candidate } from "../lib/types";

export function MatchPage() {
  const { id = "" } = useParams();
  const { aiAvailable } = useWorkspace();
  const request = useLive(() => api.careRequest(id), [id], 60000);
  const result = useLive(() => api.matches(id), [id], 60000);
  const clients = useLive(api.clients, [], 600000);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [assigned, setAssigned] = useState<string | null>(null);
  const explain = useAction(() => api.explainMatches(id));
  const assign = useAction((caregiverId: string) => api.assign(id, caregiverId));

  const r = request.data?.requirements;
  const client = clients.data?.find((c) => c.id === request.data?.client_id);
  const alreadyAssigned = request.data?.status === "assigned";

  return (
    <Page note="why, not just who." back={{ to: `/requests/${id}`, label: "Requirements" }} eyebrow={`Fit · Matching for ${id}`} title={client ? `Caregiver options for ${client.name}` : "Caregiver options"}>
      {r && (
        <section aria-label="Requirements" className="card linen" style={{ padding: "14px 18px", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span className="small" style={{ fontWeight: 600, color: "var(--ink-2)" }}>Matching on</span>
          <span className="chip" style={{ background: "var(--surface)" }}>{r.care_type === "hospice" ? "Hospice" : "Home nursing"}</span>
          <span className="chip" style={{ background: "var(--surface)" }}>{r.required_credentials.join(" · ")}</span>
          {r.required_skills.map((s) => <span key={s} className="chip" style={{ background: "var(--surface)" }}>{skill(s)}</span>)}
          <span className="chip num" style={{ background: "var(--surface)", fontSize: 15 }}>{r.shift_start} – {r.shift_end}</span>
          <span className="chip num" style={{ background: "var(--surface)", fontSize: 15 }}>{day(r.start_date)} · {r.duration_days} {r.duration_days > 1 ? "days" : "day"}</span>
          <span className="chip" style={{ background: "var(--surface)" }}>{r.location_area}</span>
          {r.prefer_familiar && <span className="chip" style={{ background: "var(--surface)" }}>Prefers familiar caregivers</span>}
          {!alreadyAssigned && <Link to={`/requests/${id}`} className="small" style={{ marginLeft: "auto", fontWeight: 600 }}>Edit request</Link>}
        </section>
      )}

      {(assigned || alreadyAssigned) && (
        <Notice tone="ok">
          <strong>{assigned ?? "This request is assigned."}</strong> Saved and logged to the audit trail.{" "}
          <Link to="/app">Back to Today</Link> · <Link to="/continuity">What if someone cancels?</Link>
        </Notice>
      )}
      <ErrorNotice error={assign.error} />

      {result.loading && !result.data && <Spinner label="Checking every caregiver against the rules…" />}
      <ErrorNotice error={result.error} />
      {result.data && (
        <>
          <div className="spread">
            <div className="inline" style={{ gap: "8px 28px" }}>
              <span><span className="num" style={{ fontSize: 26 }}>{result.data.checked}</span> caregivers checked</span>
              <span><span className="num" style={{ fontSize: 26, color: "var(--ok)" }}>{result.data.candidates.length}</span> eligible</span>
              <span><span className="num" style={{ fontSize: 26, color: "var(--risk)" }}>{result.data.excluded.length}</span> ruled out</span>
            </div>
            <div className="inline">
              <span className="small muted">Eligibility comes from rules. Gemini only explains.</span>
              <button className="btn secondary small" disabled={!aiAvailable || explain.busy || !result.data.candidates.length}
                onClick={async () => { const e = await explain.run(); if (e) setExplanations(e.explanations); }}>
                <IconSpark size={14} />{explain.busy ? "Explaining…" : "Explain with Gemini"}
              </button>
            </div>
          </div>
          <ErrorNotice error={explain.error} />

          {result.data.candidates.length === 0 && (
            <Notice tone="risk">No eligible caregivers for these requirements. Check the exclusions below, or change the dates or hours.</Notice>
          )}
          {result.data.candidates.map((c, i) => (
            <CandidateCard key={c.caregiver_id} c={c} rank={i + 1} explanation={explanations[c.caregiver_id]}
              disabled={assign.busy || alreadyAssigned || Boolean(assigned)}
              onAssign={async () => { const res = await assign.run(c.caregiver_id); if (res) { setAssigned(res.summary); request.reload(); } }} />
          ))}

          <div className="row">
            <Card title="Ruled out by rules" className="grow-2">
              {result.data.excluded.map((e) => (
                <div key={e.caregiver_id} className="spread" style={{ padding: "8px 0", borderBottom: "1px solid var(--seam-soft)" }}>
                  <strong style={{ flex: "1 1 140px" }}>{e.name}</strong>
                  <span className="small" style={{ flex: "2 1 220px", color: "var(--ink-2)" }}>{e.reason}</span>
                  <Provenance kind="rule">Rule {e.rule_id}</Provenance>
                </div>
              ))}
            </Card>
            <Card title="How the score works" className="grow-1 linen">
              <p className="small" style={{ color: "var(--ink-2)" }}>Seven operational factors with fixed maximums, set per care type. Location uses real driving time from Google Maps. It compares staffing options. <strong>It is not a medical or clinical score.</strong></p>
              <div className="stack-sm small">
                <span><span className="dot trust" /> Trust: qualification</span>
                <span><span className="dot fit" /> Fit: skills, coverage, location</span>
                <span><span className="dot continuity" /> Continuity: familiarity, stability, handovers</span>
              </div>
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}

function CandidateCard({ c, rank, explanation, onAssign, disabled }: {
  c: Candidate; rank: number; explanation?: string; onAssign: () => void; disabled: boolean;
}) {
  return (
    <article className="card" aria-labelledby={`cand-${c.caregiver_id}`}>
      <div className="row" style={{ gap: 24 }}>
        <div className="stack" style={{ flex: "1 1 250px", minWidth: 0 }}>
          <div className="inline" style={{ flexWrap: "nowrap", gap: 12 }}>
            <span className="avatar">{initials(c.name)}</span>
            <div className="stack-sm" style={{ gap: 0 }}>
              <h2 id={`cand-${c.caregiver_id}`} style={{ fontSize: 18, fontWeight: 600 }}>{rank}. {c.name}</h2>
              <span className="small muted">{c.credential_type} · {c.years_experience} yrs · {c.travel_minutes != null
                ? `${Math.round(c.travel_minutes)} min by road (${c.distance_km} km)` : `${c.distance_km} km away`} · {c.area}</span>
            </div>
          </div>
          <div className="inline">
            <span className="chip ok"><IconCheck size={13} />Verified</span>
            <span className="chip">{c.previous_visits ? `Knows client · ${c.previous_visits} visits` : "New to this client"}</span>
            <span className={`chip ${c.full_coverage ? "ok" : "review"}`}>{c.full_coverage ? `All ${c.nights_total} shifts free` : `Partial · ${c.nights_full} of ${c.nights_total} shifts`}</span>
          </div>
          {!c.full_coverage && (
            <ul className="checklist small muted">
              {c.nights.filter((n) => n.status !== "full").map((n) => (
                <li key={n.index}>{day(n.start)}: {n.status === "none" ? "not available" : `free ${n.covered.map(([a, b]) => span(a, b)).join(", ")} only`}</li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ flex: "1.3 1 300px", minWidth: 0 }}><FactorBars factors={c.factors} /></div>
        <div className="stack" style={{ flex: "0 1 180px", alignItems: "flex-end" }}>
          <span className="score">{c.total}</span>
          <span className="small muted">Continuity score</span>
          <button className={`btn ${rank === 1 ? "" : "secondary"} small`} disabled={disabled} onClick={onAssign}>
            {c.full_coverage ? `Assign ${c.name.split(" ")[0]}` : `Assign ${c.nights_full} shifts`}
          </button>
        </div>
      </div>
      {explanation && (
        <div className="inline" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 10, borderTop: "1px solid var(--seam-soft)", paddingTop: 14 }}>
          <span className="chip ai" style={{ flex: "none" }}><IconSpark size={12} />Why</span>
          <p>{explanation}</p>
        </div>
      )}
    </article>
  );
}
