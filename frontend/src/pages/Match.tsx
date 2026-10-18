import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ByGemini, DoneStep, More, StepCard, Steps } from "../components/Flow";
import { Page, useWorkspace } from "../components/Shell";
import { ErrorNotice, FactorBars, Notice, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { day, initials, skill, vertical } from "../lib/format";
import { broadcastRefresh, useAction, useLive } from "../lib/hooks";
import type { Candidate } from "../lib/types";
import { BOOK_STEPS } from "./Requests";

/** Book, steps 3 and 4: choose a caregiver, then the booking is done. */
export function MatchPage() {
  const { id = "" } = useParams();
  const { aiAvailable } = useWorkspace();
  const request = useLive(() => api.careRequest(id), [id], 60000);
  const result = useLive(() => api.matches(id), [id], 60000);
  const clients = useLive(api.clients, [], 600000);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [booked, setBooked] = useState<{ name: string; summary: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const explain = useAction(() => api.explainMatches(id));
  const assign = useAction((caregiverId: string) => api.assign(id, caregiverId));

  const r = request.data?.requirements;
  const client = clients.data?.find((c) => c.id === request.data?.client_id);
  const done = booked || request.data?.status === "assigned";
  const candidates = result.data?.candidates ?? [];
  const shown = showAll ? candidates : candidates.slice(0, 3);

  return (
    <Page title={client ? `Booking for ${client.name}` : "Booking"} lead="Every caregiver is checked against the rules first. The best fits are listed; you choose.">
      <Steps steps={BOOK_STEPS} current={done ? 5 : 3} />
      {request.data && <DoneStep label="Request" value={<>{client?.name} · “{request.data.raw_text ?? "Entered by hand"}”</>} />}
      {r && <DoneStep label="Details" value={<>{vertical(r.care_type)}{r.required_skills.length ? `, ${r.required_skills.map(skill).join(", ")}` : ""} · {r.shift_start}–{r.shift_end} · from {day(r.start_date)}, {r.duration_days} day{r.duration_days > 1 ? "s" : ""}</>}
        edit={done ? undefined : { to: `/requests/${id}` }} />}

      {done ? (
        <div className="done-card ok">
          <strong>{booked ? `Booked: ${booked.name}.` : "This booking is done."}</strong>
          <span>{booked?.summary ?? "The caregiver has been assigned and the decision is in the audit trail."}</span>
          <div className="inline">
            <Link className="btn small" to="/app">Back to Today</Link>
            <Link className="btn secondary small" to="/requests/new">New booking</Link>
          </div>
        </div>
      ) : (
        <StepCard n={3} title="Choose a caregiver"
          aside={result.data && <span className="small muted">{result.data.checked} checked · {candidates.length} can do it · {result.data.excluded.length} ruled out</span>}>
          {result.loading && !result.data && <Spinner label="Checking every caregiver against the rules…" />}
          <ErrorNotice error={result.error ?? assign.error} />
          {result.data && candidates.length === 0 && (
            <Notice tone="risk">Nobody fits these details. See who was ruled out below, or change the dates or hours.</Notice>
          )}
          <ul className="choice-list">
            {shown.map((c, i) => (
              <CandidateRow key={c.caregiver_id} c={c} best={i === 0} explanation={explanations[c.caregiver_id]} disabled={assign.busy}
                onBook={async () => { const res = await assign.run(c.caregiver_id); if (res) { setBooked({ name: c.name, summary: res.summary }); broadcastRefresh(); request.reload(); } }} />
            ))}
          </ul>
          {candidates.length > 3 && (
            <button className="link-btn small" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show the top 3 only" : `Show all ${candidates.length}`}
            </button>
          )}
          {assign.busy && <Spinner label="Booking…" />}
          {candidates.length > 0 && aiAvailable && Object.keys(explanations).length === 0 && (
            <button className="link-btn small" style={{ alignSelf: "flex-start" }} disabled={explain.busy}
              onClick={async () => { const e = await explain.run(); if (e) setExplanations(e.explanations); }}>
              {explain.busy ? "Gemini is explaining…" : "Explain the choice in words (Gemini)"}
            </button>
          )}
          <ErrorNotice error={explain.error} />
          {result.data && (
            <More label={`Show details: scores and the ${result.data.excluded.length} ruled out`}>
              <p className="small muted">Seven operational factors, set per care type. Location uses real driving time from Google Maps. It compares staffing options; it is not a medical score.</p>
              {shown.map((c) => (
                <div key={c.caregiver_id} className="stack-sm">
                  <strong className="small">{c.name} · {c.total}</strong>
                  <FactorBars factors={c.factors} />
                </div>
              ))}
              <h3 className="more-title">Ruled out by the rules</h3>
              <ul className="plain-list small">
                {result.data.excluded.map((e) => <li key={e.caregiver_id}><strong>{e.name}</strong>: {e.reason} <span className="muted">(rule {e.rule_id})</span></li>)}
              </ul>
            </More>
          )}
        </StepCard>
      )}
    </Page>
  );
}

function CandidateRow({ c, best, explanation, disabled, onBook }: { c: Candidate; best: boolean; explanation?: string; disabled: boolean; onBook: () => void }) {
  const travel = c.travel_minutes != null ? `${Math.round(c.travel_minutes)} min away` : `${c.distance_km} km away`;
  const knows = c.previous_visits ? `knows the client (${c.previous_visits} visits)` : "new to this client";
  const cover = c.full_coverage ? `free for all ${c.nights_total} shifts` : `free for ${c.nights_full} of ${c.nights_total} shifts`;
  return (
    <li className={`choice${best ? " best" : ""}`}>
      <span className="avatar">{initials(c.name)}</span>
      <span className="choice-main">
        <strong>{c.name}{best && <span className="tag human" style={{ marginLeft: 8 }}>Best fit</span>}</strong>
        <span className="small muted">{travel} · {knows} · {cover}</span>
        {explanation && <span className="small"><ByGemini /> {explanation}</span>}
      </span>
      <span className="choice-score" title="Continuity score, out of 100">{c.total}</span>
      <button className={`btn small${best ? " primary" : " secondary"}`} disabled={disabled} onClick={onBook}>
        {c.full_coverage ? `Book ${c.name.split(" ")[0]}` : `Book ${c.nights_full} shifts`}
      </button>
    </li>
  );
}
