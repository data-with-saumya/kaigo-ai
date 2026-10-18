import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuditList } from "../components/AuditList";
import { ByGemini, DoneStep, More, StepCard, Steps } from "../components/Flow";
import { IconCheck } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { ErrorNotice, Notice, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { day, isoDay, relativeDay, span, time } from "../lib/format";
import { broadcastRefresh, useAction, useLive } from "../lib/hooks";
import type { ChangeEvent, EventType, ReplanOption, ShiftView } from "../lib/types";

const REPLAN_STEPS = ["Report the change", "Choose a plan", "Approve"];
const EXAMPLES = [
  "Hi, it's Anjali. Family emergency, so I can't do tomorrow night at Mrs Sharma's. Really sorry.",
  "Anjali here, I can only stay till midnight tomorrow, not the full night.",
];
const STATUS: Record<ChangeEvent["status"], [string, string]> = {
  open: ["review", "Waiting for you"],
  needs_review: ["review", "Needs a person"],
  no_feasible_option: ["risk", "No full replacement"],
  resolved: ["ok", "Approved"],
  rejected: ["", "Rejected"],
  no_impact: ["", "No shifts affected"],
};
const title = (e: ChangeEvent) => e.parse_source === "rule"
  ? `${e.parsed?.caregiver_name ?? "A caregiver"}: registration lapses mid-shift`
  : `${e.parsed?.caregiver_name ?? "Unknown sender"}: ${e.parsed?.event_type.replace(/_/g, " ") ?? "unclear message"}`;

/** Replan, step 1: say what changed, by pasting the message or filling in three fields. */
export function ContinuityPage() {
  const navigate = useNavigate();
  const { aiDown } = useWorkspace();
  const caregivers = useLive(api.caregivers, [], 600000);
  const events = useLive(api.events);
  const [how, setHow] = useState<"message" | "manual">("message");
  const [text, setText] = useState(EXAMPLES[0]);
  const tomorrow = isoDay(new Date(Date.now() + 86_400_000));
  const [manual, setManual] = useState({ caregiver_id: "CG-0101", date: tomorrow, event_type: "caregiver_cancellation" as EventType, note: "" });
  const interpret = useAction(() => api.interpret(text));
  const report = useAction(() => api.reportEvent(manual.caregiver_id, manual.date, manual.event_type, manual.note || undefined));
  const go = (e: ChangeEvent | undefined) => { if (e) { broadcastRefresh(); navigate(`/continuity/${e.id}`); } };
  const mode = aiDown ? "manual" : how;
  const waiting = (events.data ?? []).filter((e) => e.status === "open" || e.status === "needs_review" || e.status === "no_feasible_option");

  return (
    <Page title="Report a change" lead="Someone can’t make a shift? KaigoAI finds the shift, rechecks everyone and lays out the plans. You approve one.">
      <Steps steps={REPLAN_STEPS} current={1} />
      {waiting.length > 0 && (
        <Notice tone="review">{waiting.length} change{waiting.length > 1 ? "s are" : " is"} already waiting for you. <Link to="/changes">Open {waiting.length > 1 ? "them" : "it"}</Link></Notice>
      )}
      <StepCard n={1} title="What changed?">
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="how">How did you hear about it?</label>
          <select id="how" className="input" value={mode} onChange={(e) => setHow(e.target.value as "message" | "manual")}>
            <option value="message" disabled={aiDown}>A caregiver’s message (Gemini reads it)</option>
            <option value="manual">I’ll fill it in myself</option>
          </select>
        </div>
        {mode === "message" ? (
          <>
            <div className="field">
              <label htmlFor="example">Start from an example</label>
              <select id="example" className="input" value={EXAMPLES.includes(text) ? text : ""} onChange={(e) => e.target.value && setText(e.target.value)}>
                <option value="">Paste your own…</option>
                {EXAMPLES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sms">The message</label>
              <textarea id="sms" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="inline">
              <button className="btn primary" disabled={interpret.busy || text.trim().length < 3} onClick={async () => go(await interpret.run())}>Find replacements</button>
              {interpret.busy && <Spinner label="Gemini is reading the message, then the rules check the schedule…" />}
            </div>
            <ErrorNotice error={interpret.error} />
          </>
        ) : (
          <>
            <div className="form-grid three">
              <div className="field"><label htmlFor="m-cg">Caregiver</label>
                <select id="m-cg" className="input" value={manual.caregiver_id} onChange={(e) => setManual({ ...manual, caregiver_id: e.target.value })}>
                  {caregivers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="field"><label htmlFor="m-type">What happened</label>
                <select id="m-type" className="input" value={manual.event_type} onChange={(e) => setManual({ ...manual, event_type: e.target.value as EventType })}>
                  <option value="caregiver_cancellation">Can’t come</option>
                  <option value="shift_change">Can’t keep the hours</option>
                  <option value="urgent_coverage_request">Urgent cover needed</option>
                </select></div>
              <div className="field"><label htmlFor="m-day">Shift starting on</label>
                <input id="m-day" type="date" className="input num" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></div>
            </div>
            <div className="inline">
              <button className="btn primary" disabled={report.busy} onClick={async () => go(await report.run())}>Find replacements</button>
              {report.busy && <Spinner label="Checking the schedule…" />}
            </div>
            {aiDown && <p className="small muted">Gemini is paused, so messages can’t be read right now. Replanning works the same.</p>}
            <ErrorNotice error={report.error} />
          </>
        )}
      </StepCard>
    </Page>
  );
}

/** Every change reported so far. */
export function ChangesPage() {
  const events = useLive(api.events);
  return (
    <Page title="Changes" actions={<Link className="btn primary small" to="/continuity">Report a change</Link>}>
      {events.loading && !events.data && <Spinner label="Loading…" />}
      {events.data?.length === 0 && <p className="muted">No changes yet. Report one, or run the proactive checks from the Replan menu.</p>}
      <ul className="row-list">
        {events.data?.map((e) => {
          const [tone, label] = STATUS[e.status];
          return (
            <li key={e.id}>
              <Link to={`/continuity/${e.id}`} className="row-link">
                <span className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <strong>{title(e)}</strong>
                  <span className="small muted ellipsis">{relativeDay(e.received_at)} {time(e.received_at)} · {e.impact_summary ?? e.review_reason ?? e.raw_text}</span>
                </span>
                <span className={`chip ${tone}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

/** Replan, steps 2 and 3: choose one plan, approve it. Everything else is one click away under "Show details". */
export function ReplanPage() {
  const { id = "" } = useParams();
  const { aiAvailable, aiDown } = useWorkspace();
  const live = useLive(() => api.event(id), [id], 8000);
  const caregivers = useLive(api.caregivers, [], 600000);
  const audit = useLive(() => api.audit(80), [id]);
  const [event, setEvent] = useState<ChangeEvent | null>(null);
  const [shifts, setShifts] = useState<ShiftView[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [stale, setStale] = useState<string | null>(null);
  const explain = useAction(() => api.explainEvent(id));
  const handover = useAction(() => api.handover(id));
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<unknown>(null);
  const names = useMemo(() => Object.fromEntries((caregivers.data ?? []).map((c) => [c.id, c.name])), [caregivers.data]);
  const colours = useMemo(() => {
    const palette = ["#ffd98a", "#a8e0dc", "#ffc2a0", "#ddd0ea"];
    const ids = Array.from(new Set((event?.options ?? []).flatMap((o) => o.caregiver_ids)));
    return Object.fromEntries(ids.map((cid, i) => [cid, palette[i % palette.length]]));
  }, [event?.options]);

  useEffect(() => { if (live.data) setEvent(live.data); }, [live.data]);
  useEffect(() => {
    if (event && picked === null) setPicked(event.recommended_option_id ?? event.options.find((o) => o.feasible)?.id ?? null);
  }, [event, picked]);
  useEffect(() => {
    if (event?.assignment_id) api.shifts({ assignment_id: event.assignment_id }).then(setShifts).catch(() => setShifts([]));
  }, [event?.assignment_id, event?.status]);
  // Ask Gemini to explain the trade-offs once, as soon as options exist.
  useEffect(() => {
    if (event && aiAvailable && event.status === "open" && !event.explanation && !explain.busy && !explain.error) {
      explain.run().then((e) => { if (e) setEvent(e); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.status, aiAvailable]);
  // After approval, brief the incoming caregivers.
  useEffect(() => {
    if (event && aiAvailable && event.status === "resolved" && event.decision?.action === "approved"
        && Object.keys(event.handover_notes ?? {}).length === 0 && !handover.busy && !handover.error) {
      handover.run().then((e) => { if (e) setEvent(e); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.status, aiAvailable]);

  if (!event) {
    const gone = live.error instanceof ApiError && live.error.status === 404;
    return (
      <Page title={gone ? "Change not found" : "Replan"} back={{ to: "/changes", label: "Changes" }}>
        {gone
          ? <Notice tone="info">This change isn’t in your demo agency any more; the demo may have been reset. <Link to="/changes">See all changes</Link>.</Notice>
          : <><Spinner label="Loading…" /><ErrorNotice error={live.error} /></>}
      </Page>
    );
  }

  const affected = shifts.find((s) => s.id === event.affected_shift_ids[0]);
  const current = event.options.find((o) => o.id === picked) ?? null;
  const decided = event.status === "resolved" || event.status === "rejected";
  const related = (audit.data ?? []).filter((a) => a.entity_id === event.id || a.details?.event_id === event.id
    || (event.assignment_id && a.entity_id === event.assignment_id && a.at >= event.received_at) || (affected && a.entity_id === affected.id));
  const what = affected
    ? `${event.parsed?.caregiver_name ?? "The caregiver"} can’t cover ${day(affected.start)}, ${span(affected.start, affected.end)}, for ${affected.client_name}.`
    : event.parsed?.summary ?? event.impact_summary ?? "A change was reported.";

  const onDecide = async (action: "approved" | "rejected") => {
    setStale(null);
    setDecideError(null);
    setDeciding(true);
    try {
      const updated = await api.decideEvent(id, action, picked ?? undefined, note || undefined);
      setEvent(updated);
      broadcastRefresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "stale_options") {
        setStale(err.message);
        const fresh = err.extra.event as ChangeEvent;
        setEvent(fresh);
        setPicked(fresh.recommended_option_id);
      } else {
        setDecideError(err);
      }
    } finally {
      setDeciding(false);
    }
  };

  return (
    <Page title={affected ? `Replan ${day(affected.start)} for ${affected.client_name}` : "Replan"} back={{ to: "/changes", label: "Changes" }}>
      <Steps steps={REPLAN_STEPS} current={decided ? 4 : event.options.length ? 2 : 1} />
      <DoneStep label="Change" value={what} />
      {event.raw_text && (
        <More label={`Show the message${event.parse_source === "gemini" ? " and what Gemini read" : ""}`}>
          <blockquote className="quote">“{event.raw_text}”</blockquote>
          {event.parsed && event.parse_source === "gemini" && (
            <p className="small muted"><ByGemini>Read by Gemini</ByGemini> as {event.parsed.event_type.replace(/_/g, " ")}, confidence {event.parsed.confidence.toFixed(2)}. {event.parsed.summary}</p>
          )}
          {event.source === "chat" && event.parsed?.caregiver_id && <Link to={`/messages?with=${event.parsed.caregiver_id}`} className="small">Open the conversation →</Link>}
        </More>
      )}

      {event.status === "needs_review" && (
        <Notice tone="review"><strong>Nothing has been changed.</strong> {event.review_reason}. Check with the caregiver, then <Link to="/continuity">report the change yourself</Link>.</Notice>
      )}
      {event.status === "no_impact" && <Notice tone="info">{event.impact_summary}</Notice>}

      {event.options.length > 0 && !decided && (
        <StepCard n={2} title="Choose a plan" aside={<span className="small muted">Everyone rechecked · {event.excluded.length} ruled out</span>}>
          {event.status === "no_feasible_option" && (
            <Notice tone="risk">No plan covers the whole shift within the rules. Escalate or widen the search; partial plans are shown for transparency.</Notice>
          )}
          <ul className="choice-list" role="radiogroup" aria-label="Plans">
            {event.options.map((o) => (
              <PlanRow key={o.id} o={o} names={names} colours={colours} shift={affected} recommended={o.id === event.recommended_option_id}
                selected={o.id === picked} onPick={() => setPicked(o.id)} />
            ))}
          </ul>
          {event.explanation ? (
            <p className="why"><ByGemini>Why</ByGemini> {event.explanation.summary}{event.explanation.caveat ? ` ${event.explanation.caveat}` : ""}</p>
          ) : explain.busy ? <Spinner label="Gemini is comparing the plans…" /> : event.recommendation_note ? <p className="why">{event.recommendation_note}</p> : null}
          <ErrorNotice error={explain.error} />
          <More label="Show details: factor by factor, and who was ruled out">
            <div className="table-wrap">
              <table style={{ minWidth: 480 }}>
                <thead><tr><th>Factor</th>{event.options.map((o) => <th key={o.id} style={{ textAlign: "center" }}>Plan {o.id}</th>)}</tr></thead>
                <tbody>
                  {event.options[0].factors.map((f, i) => (
                    <tr key={f.key}>
                      <td className="muted">{f.label} <span className="small">/{f.max_points}</span></td>
                      {event.options.map((o) => <td key={o.id} className="num" title={o.factors[i].detail} style={{ textAlign: "center", fontSize: 15 }}>{o.factors[i].points}</td>)}
                    </tr>
                  ))}
                  <tr><td><strong>Total</strong></td>{event.options.map((o) => (
                    <td key={o.id} className="num" style={{ textAlign: "center", fontSize: 18 }}><span style={o.feasible ? undefined : { textDecoration: "line-through", color: "#a99cb0" }}>{o.total}</span></td>))}</tr>
                </tbody>
              </table>
            </div>
            {event.options.map((o) => (
              <div key={o.id} className="small"><strong>Plan {o.id}:</strong> {[...o.pros, ...o.cons].join(" · ")}</div>
            ))}
            {event.excluded.length > 0 && (
              <>
                <h3 className="more-title">Ruled out</h3>
                <ul className="plain-list small">{event.excluded.map((e) => <li key={e.caregiver_id}><strong>{e.name}</strong>: {e.reason} <span className="muted">(rule {e.rule_id})</span></li>)}</ul>
              </>
            )}
          </More>
        </StepCard>
      )}

      {event.options.length > 0 && !decided && (
        <StepCard n={3} title="Approve">
          {stale && <Notice tone="review">{stale}</Notice>}
          {current && !current.feasible && <Notice tone="risk">Plan {current.id} can’t be approved: {current.violations.map((v) => v.detail).join(" ")}</Notice>}
          <p>{current ? <>Plan {current.id}: <strong>{current.title}</strong>. Nothing changes and nobody is contacted until you approve.</> : "Choose a plan above."}</p>
          <div className="inline">
            <button className="btn primary" disabled={!current || !current.feasible || deciding} onClick={() => onDecide("approved")}><IconCheck size={16} />Approve plan {current?.id ?? ""}</button>
            <button className="btn secondary" disabled={deciding} onClick={() => onDecide("rejected")}>Reject all</button>
            {deciding && <Spinner label="Saving…" />}
          </div>
          <More label="Add a note for the audit trail">
            <label className="sr-only" htmlFor="note">Note</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family is fine with a midnight handover" />
          </More>
          <ErrorNotice error={decideError} />
        </StepCard>
      )}

      {decided && (event.decision?.action === "approved" ? (
        <div className="done-card ok">
          <strong>Approved at {time(event.decision.at)}. {affected ? `${day(affected.start)} is covered: ${affected.segments.map((s) => `${s.caregiver_name ?? "uncovered"} ${span(s.start, s.end)}`).join(", ")}.` : ""}</strong>
          <span>The new caregivers get their booking and a handover note in the app; the original caregiver is told the shift is covered.</span>
          {Object.keys(event.handover_notes ?? {}).length > 0 ? (
            <div className="notes">{Object.entries(event.handover_notes).map(([cid, n]) => (
              <div key={cid} className="note-card"><strong>{names[cid] ?? cid}</strong><span>{n}</span><ByGemini>Handover note · Gemini</ByGemini></div>
            ))}</div>
          ) : handover.busy ? <Spinner label="Gemini is drafting the handover notes…" />
            : aiDown ? <span className="small muted">Gemini is paused, so no handover notes were drafted. The new schedule is saved.</span>
            : <ErrorNotice error={handover.error} />}
          <div className="inline"><Link className="btn small" to="/app">Back to Today</Link></div>
        </div>
      ) : (
        <div className="done-card">
          <strong>All plans rejected.</strong>
          <span>The shift stays flagged as uncovered on Today until it is filled.{event.decision?.note ? ` Note: ${event.decision.note}` : ""}</span>
          <div className="inline"><Link className="btn small" to="/app">Back to Today</Link></div>
        </div>
      ))}

      {(shifts.length > 0 || related.length > 0) && (
        <More label="Schedule and audit trail">
          {shifts.length > 0 && (
            <ol className="timeline" aria-label="Schedule">
              {shifts.map((s) => {
                const isAffected = event.affected_shift_ids.includes(s.id);
                return (
                  <li key={s.id} className={isAffected ? (s.status === "covered" ? "fixed" : "affected") : ""}>
                    <span className="day">{day(s.start)}</span>
                    {s.segments.map((seg, i) => <span key={i}>{seg.caregiver_name ? seg.caregiver_name.split(" ")[0] : "Uncovered"}{s.segments.length > 1 ? ` ${time(seg.start)}` : ""}</span>)}
                  </li>
                );
              })}
            </ol>
          )}
          <AuditList entries={related} compact />
        </More>
      )}
    </Page>
  );
}

function PlanRow({ o, names, colours, shift, recommended, selected, onPick }: {
  o: ReplanOption; names: Record<string, string>; colours: Record<string, string>; shift?: ShiftView; recommended: boolean; selected: boolean; onPick: () => void;
}) {
  const start = shift ? new Date(shift.start).getTime() : new Date(o.segments[0].start).getTime();
  const end = shift ? new Date(shift.end).getTime() : new Date(o.segments[o.segments.length - 1].end).getTime();
  const segs = [...o.segments].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <li>
      <button type="button" role="radio" aria-checked={selected} className={`choice plan${selected ? " selected" : ""}${o.feasible ? "" : " infeasible"}`} onClick={onPick}>
        <span className="radio" aria-hidden="true" />
        <span className="choice-main">
          <strong>Plan {o.id}: {o.title}{recommended && <span className="tag human" style={{ marginLeft: 8 }}>Recommended</span>}</strong>
          <span className="coverage slim" aria-hidden="true">
            {segs.map((s, i) => {
              const width = (new Date(s.end).getTime() - new Date(s.start).getTime()) / (end - start);
              return (
                <Fragment key={i}>
                  {i > 0 && s.caregiver_id && segs[i - 1].caregiver_id && <span className="handover" />}
                  <span className={s.caregiver_id ? "" : "gap"} style={{ flex: width, background: s.caregiver_id ? colours[s.caregiver_id] : undefined }}>
                    {s.caregiver_id ? names[s.caregiver_id]?.split(" ")[0] : "Uncovered"}
                  </span>
                </Fragment>
              );
            })}
          </span>
          <span className="small muted">{o.feasible ? o.pros[0] ?? "" : o.cons[0] ?? "Doesn’t cover the whole shift"}</span>
        </span>
        <span className={`choice-score${o.feasible ? "" : " struck"}`}>{o.total}</span>
      </button>
    </li>
  );
}
