import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuditList } from "../components/AuditList";
import { IconCheck, IconMessage, IconMinus, IconSpark, IconX } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { Card, ErrorNotice, Notice, Provenance, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { day, isoDay, relativeDay, span, time } from "../lib/format";
import { useAction, useLive } from "../lib/hooks";
import type { ChangeEvent, EventType, ReplanOption, ShiftView } from "../lib/types";

const EXAMPLE_SMS = "Hi, it's Anjali. Family emergency, so I can't do tomorrow night at Mrs Sharma's. Really sorry.";

const STATUS_CHIP: Record<ChangeEvent["status"], [string, string]> = {
  open: ["review", "Waiting for your decision"],
  needs_review: ["review", "Needs a person to confirm"],
  no_feasible_option: ["risk", "No feasible replacement"],
  resolved: ["ok", "Approved · care state updated"],
  rejected: ["", "Rejected · searching wider"],
  no_impact: ["", "No shifts affected"],
};

export function ContinuityPage() {
  const navigate = useNavigate();
  const { aiAvailable } = useWorkspace();
  const events = useLive(api.events);
  const caregivers = useLive(api.caregivers, [], 600000);
  const [text, setText] = useState(EXAMPLE_SMS);
  const tomorrow = isoDay(new Date(Date.now() + 86_400_000));
  const [manual, setManual] = useState({ caregiver_id: "CG-0101", date: tomorrow, event_type: "caregiver_cancellation" as EventType, note: "" });
  const interpret = useAction(() => api.interpret(text));
  const report = useAction(() => api.reportEvent(manual.caregiver_id, manual.date, manual.event_type, manual.note || undefined));
  const checks = useAction(api.runChecks);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const go = (e: ChangeEvent | undefined) => { if (e) navigate(`/continuity/${e.id}`); };

  return (
    <Page eyebrow="Continuity" title="When something changes">
      <div className="row">
        <Card title={<span className="inline"><IconMessage size={20} />Incoming message</span>} className="grow-1">
          <p className="small muted">Paste an SMS or WhatsApp message, or a note from a phone call. Gemini reads it; rules find what it affects.</p>
          <div className="field">
            <label htmlFor="sms">Message</label>
            <textarea id="sms" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="inline">
            <button className="btn" disabled={!aiAvailable || interpret.busy || text.trim().length < 3} onClick={async () => go(await interpret.run())}>
              <IconSpark size={16} />Read and replan
            </button>
            <button className="btn quiet small" onClick={() => setText(EXAMPLE_SMS)}>Use example</button>
          </div>
          {interpret.busy && <Spinner label="Gemini is reading the message, then rules check the schedule…" />}
          {!aiAvailable && <Notice tone="review">Gemini is unavailable. Report the change manually: replanning works the same.</Notice>}
          <ErrorNotice error={interpret.error} />
        </Card>

        <Card title="Report a change manually" className="grow-1">
          <p className="small muted">No AI involved. Use this when Gemini is unavailable or the message is unclear.</p>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div className="field"><label htmlFor="m-cg">Caregiver</label>
              <select id="m-cg" className="input" value={manual.caregiver_id} onChange={(e) => setManual({ ...manual, caregiver_id: e.target.value })}>
                {caregivers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field"><label htmlFor="m-day">Shift starting on</label>
              <input id="m-day" type="date" className="input num" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></div>
            <div className="field"><label htmlFor="m-type">What changed</label>
              <select id="m-type" className="input" value={manual.event_type} onChange={(e) => setManual({ ...manual, event_type: e.target.value as EventType })}>
                <option value="caregiver_cancellation">Caregiver cancelled</option>
                <option value="shift_change">Caregiver can’t keep the hours</option>
                <option value="urgent_coverage_request">Urgent cover needed</option>
              </select></div>
          </div>
          <div className="field"><label htmlFor="m-note">Note (optional)</label>
            <input id="m-note" className="input" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} /></div>
          <button className="btn secondary" style={{ alignSelf: "flex-start" }} disabled={report.busy} onClick={async () => go(await report.run())}>Report and replan</button>
          <ErrorNotice error={report.error} />
        </Card>
      </div>

      <Card title="Proactive checks" className="linen" actions={<span className="chip rule">Rule E-02 · Cloud Scheduler, nightly</span>}>
        <p className="small" style={{ color: "var(--ink-2)" }}>Kaigo doesn’t wait for a cancellation. Every night it checks upcoming shifts for caregivers whose registration lapses before the shift ends, and opens a replanning event early.</p>
        <div className="inline">
          <button className="btn secondary small" disabled={checks.busy} onClick={async () => {
            const r = await checks.run();
            if (r) { setCheckMessage(r.message); if (r.opened.length) navigate(`/continuity/${r.opened[0].id}`); }
          }}>Run checks now</button>
          {checks.busy && <Spinner label="Checking upcoming shifts…" />}
          {checkMessage && <span className="small muted">{checkMessage}</span>}
        </div>
        <ErrorNotice error={checks.error} />
      </Card>

      <Card title="Changes">
        {events.data?.length === 0 && <p className="muted">No changes reported yet. Try the example message above.</p>}
        {events.data?.map((e) => {
          const [tone, label] = STATUS_CHIP[e.status];
          return (
            <Link key={e.id} to={`/continuity/${e.id}`} className="spread" style={{ textDecoration: "none", color: "inherit", padding: "10px 0", borderBottom: "1px solid var(--seam-soft)" }}>
              <span className="stack-sm" style={{ gap: 0, minWidth: 0, flex: "1 1 300px" }}>
                <strong>{e.parse_source === "rule" ? "Expiry monitor" : e.parsed?.caregiver_name ?? "Unknown sender"}: {e.parsed?.event_type.replace(/_/g, " ") ?? "unclear message"}{e.parse_source === "rule" ? ` · ${e.parsed?.caregiver_name}` : ""}</strong>
                <span className="small muted">{relativeDay(e.received_at)} {time(e.received_at)} · {e.impact_summary ?? e.review_reason ?? e.raw_text}</span>
              </span>
              <span className={`chip ${tone}`}>{label}</span>
            </Link>
          );
        })}
      </Card>
    </Page>
  );
}

export function ReplanPage() {
  const { id = "" } = useParams();
  const { aiAvailable } = useWorkspace();
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
    const palette = ["#d9be8c", "#d4b3ad", "#c9b9a3", "#e2cfa6"];
    const ids = Array.from(new Set((event?.options ?? []).flatMap((o) => o.caregiver_ids)));
    return Object.fromEntries(ids.map((cid, i) => [cid, palette[i % palette.length]]));
  }, [event?.options]);

  useEffect(() => { if (live.data) setEvent(live.data); }, [live.data]);
  useEffect(() => {
    if (event && picked === null) setPicked(event.recommended_option_id ?? event.options[0]?.id ?? null);
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

  if (!event) return <Page eyebrow="Continuity" title="Replan"><Spinner label="Loading…" /><ErrorNotice error={live.error} /></Page>;

  const affected = shifts.find((s) => s.id === event.affected_shift_ids[0]);
  const current = event.options.find((o) => o.id === picked) ?? null;
  const [tone, label] = STATUS_CHIP[event.status];
  const decided = event.status === "resolved" || event.status === "rejected";
  const related = (audit.data ?? []).filter((a) => a.entity_id === event.id || a.details?.event_id === event.id
    || (event.assignment_id && a.entity_id === event.assignment_id && a.at >= event.received_at)
    || (affected && a.entity_id === affected.id));

  const onDecide = async (action: "approved" | "rejected") => {
    setStale(null);
    setDecideError(null);
    setDeciding(true);
    try {
      const updated = await api.decideEvent(id, action, picked ?? undefined, note || undefined);
      setEvent(updated);
      window.dispatchEvent(new Event("kaigo:refresh"));
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
    <Page eyebrow={`Continuity · Event ${event.id}`} title={affected ? `Replan shift ${affected.index} for ${affected.client_name}` : "Change received"}
      actions={<span className={`chip ${tone}`} style={{ minHeight: 36, padding: "0 14px" }}>{label}</span>}>
      <div className="row stretch">
        <Card title="What changed" className="grow-1" actions={<span className="small muted">{event.source === "sms" ? "Message" : event.source === "system" ? "Detected" : "Reported"} {relativeDay(event.received_at).toLowerCase()} at {time(event.received_at)}</span>}>
          {event.raw_text && <blockquote style={{ margin: 0, padding: "14px 16px", borderRadius: 12, background: "var(--linen)", fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16 }}>“{event.raw_text}”</blockquote>}
          {event.parsed && (
            <>
              <div className="inline">
                {event.parse_source === "gemini" ? <Provenance kind="ai">Gemini · read as</Provenance>
                  : event.parse_source === "rule" ? <Provenance kind="rule">Rule E-02 · expiry monitor</Provenance>
                  : <Provenance kind="human">Reported by coordinator</Provenance>}
                {event.parse_source === "gemini" && <span className="small muted">confidence {event.parsed.confidence.toFixed(2)} (review below 0.85)</span>}
              </div>
              <dl style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: "8px 14px", margin: 0, fontSize: 14 }}>
                <dt className="muted">Change</dt><dd style={{ margin: 0, fontWeight: 600 }}>{event.parsed.event_type.replace(/_/g, " ")}</dd>
                <dt className="muted">Caregiver</dt><dd style={{ margin: 0, fontWeight: 600 }}>{event.parsed.caregiver_id ? names[event.parsed.caregiver_id] : <span style={{ color: "var(--risk)" }}>Not matched: “{event.parsed.caregiver_name}”</span>}</dd>
                <dt className="muted">Day</dt><dd style={{ margin: 0 }} className="num">{event.parsed.date ? day(event.parsed.date) : "Unclear"}</dd>
                <dt className="muted">Summary</dt><dd style={{ margin: 0 }}>{event.parsed.summary}</dd>
              </dl>
            </>
          )}
        </Card>

        <Card title="Affected assignment" className="grow-1" actions={event.affected_shift_ids.length ? <Provenance kind="rule">Rule S-04 · found</Provenance> : null}>
          {event.status === "needs_review" && (
            <Notice tone="review"><strong>Nothing has been changed.</strong> {event.review_reason}. Confirm the details with the caregiver, then <Link to="/continuity">report the change manually</Link>.</Notice>
          )}
          {event.status === "no_impact" && <Notice tone="info">{event.impact_summary}</Notice>}
          {event.impact_summary && event.status !== "no_impact" && <p style={{ color: "var(--ink-2)" }}>{event.impact_summary}</p>}
          {shifts.length > 0 && (
            <ol className="timeline" aria-label="Assignment schedule">
              {shifts.map((s) => {
                const isAffected = event.affected_shift_ids.includes(s.id);
                const cls = isAffected ? (s.status === "covered" ? "fixed" : "affected") : "";
                return (
                  <li key={s.id} className={cls}>
                    <span className="day">{day(s.start)}</span>
                    {s.segments.map((seg, i) => (
                      <span key={i}>{seg.caregiver_name ? seg.caregiver_name.split(" ")[0] : "Uncovered"}{s.segments.length > 1 ? ` ${time(seg.start)}` : ""}</span>
                    ))}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      {event.options.length > 0 && (
        <section aria-labelledby="opt-title" className="stack">
          <div className="spread">
            <h2 id="opt-title" className="section-title">Replacement options</h2>
            <span className="small muted">Every caregiver rechecked against requirements, credentials and schedules · {event.excluded.length} ruled out</span>
          </div>
          {event.recommendation_note && <Notice tone="info"><strong>Rules recommend option {event.recommended_option_id}.</strong> {event.recommendation_note}</Notice>}
          {event.status === "no_feasible_option" && (
            <Notice tone="risk"><strong>No feasible replacement.</strong> No plan covers the whole shift within the rules. Escalate, or widen the search (more distance, partner agencies). Partial plans are shown for transparency.</Notice>
          )}
          <div className="grid-options">
            {event.options.map((o) => (
              <OptionCard key={o.id} o={o} names={names} colours={colours} shift={affected} recommended={o.id === event.recommended_option_id}
                selected={o.id === picked} disabled={decided} onPick={() => setPicked(o.id)} />
            ))}
          </div>
        </section>
      )}

      {event.options.length > 0 && (
        <div className="row">
          <div className="col grow-2">
            <Card title="Trade-offs, factor by factor" actions={<span className="small muted">Operational score, not clinical</span>}>
              <div className="table-wrap">
                <table style={{ minWidth: 520 }}>
                  <thead><tr><th>Factor</th>{event.options.map((o) => (
                    <th key={o.id} style={{ textAlign: "center", background: o.id === picked ? "var(--ink)" : undefined, color: o.id === picked ? "var(--ivory)" : undefined, borderRadius: "8px 8px 0 0" }}>Option {o.id}</th>))}</tr></thead>
                  <tbody>
                    {event.options[0].factors.map((f, i) => (
                      <tr key={f.key}>
                        <th scope="row" style={{ fontWeight: 500, color: "var(--ink-2)", border: "none", borderBottom: "1px solid var(--seam-soft)" }}>{f.label} <span className="muted">/{f.max_points}</span></th>
                        {event.options.map((o) => (
                          <td key={o.id} className="num" title={o.factors[i].detail}
                            style={{ textAlign: "center", fontSize: 16, background: o.id === picked ? "var(--linen)" : undefined }}>{o.factors[i].points}</td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" style={{ border: "none" }}>Total</th>
                      {event.options.map((o) => (
                        <td key={o.id} className="num" style={{ textAlign: "center", fontSize: 24, background: o.id === picked ? "var(--linen)" : undefined }}>
                          <span style={o.feasible ? undefined : { textDecoration: "line-through", color: "#a0937f" }}>{o.total}</span>
                          {!o.feasible && <div className="small" style={{ fontFamily: "var(--font-ui)", color: "var(--risk)" }}>not eligible</div>}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title={event.recommended_option_id ? `Why option ${event.recommended_option_id} is recommended` : "About these options"} className="linen"
              actions={<span className="chip ai"><IconSpark size={12} />Gemini · explanation</span>}>
              {event.explanation ? (
                <div className="stack">
                  <p style={{ fontSize: 15, lineHeight: 1.6 }}>{event.explanation.summary}</p>
                  {event.explanation.caveat && <p style={{ fontSize: 15 }}><strong>Worth considering:</strong> {event.explanation.caveat}</p>}
                  <p className="small muted">Written from the scores above and checked: figures not in the data are rejected. Options and eligibility come from rules, not from Gemini.</p>
                </div>
              ) : explain.busy ? <Spinner label="Gemini is comparing the options…" /> : (
                <div className="stack">
                  {!aiAvailable && <p className="muted">Gemini is unavailable, so there’s no written explanation. The factor table above has everything the recommendation is based on.</p>}
                  <ErrorNotice error={explain.error} />
                  {aiAvailable && <button className="btn secondary small" style={{ alignSelf: "flex-start" }} onClick={async () => { const e = await explain.run(); if (e) setEvent(e); }}>Explain trade-offs</button>}
                </div>
              )}
            </Card>
          </div>

          <div className="col grow-1">
            <Card title="Your decision" className="decision">
              {stale && <Notice tone="review">{stale}</Notice>}
              {!decided ? (
                <div className="stack">
                  <div className="stack-sm"><span className="small muted">Selected</span><strong style={{ fontSize: 16 }}>{current ? `Option ${current.id} · ${current.title}` : "Nothing selected"}</strong></div>
                  {current && !current.feasible && (
                    <Notice tone="risk">Option {current.id} can’t be approved: {current.violations.map((v) => v.detail).join(" ")} Choose a full-coverage option, or reject and search again.</Notice>
                  )}
                  <div className="field">
                    <label htmlFor="note">Note for the audit trail (optional)</label>
                    <textarea id="note" className="input" rows={3} style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family is fine with a midnight handover" />
                  </div>
                  <button className="btn block" disabled={!current || !current.feasible || deciding} onClick={() => onDecide("approved")}>
                    <IconCheck size={16} />Approve option {current?.id ?? ""}
                  </button>
                  <button className="btn danger" disabled={deciding} onClick={() => onDecide("rejected")}>Reject all and search again</button>
                  <p className="small muted">Nothing changes until you approve. Caregivers are contacted only after approval.</p>
                </div>
              ) : event.decision?.action === "approved" ? (
                <div className="stack">
                  <Notice tone="ok"><strong>Care state updated at {time(event.decision.at)}.</strong> {affected ? `${day(affected.start)} is covered: ${affected.segments.map((s) => `${s.caregiver_name ?? "uncovered"} ${span(s.start, s.end)}`).join(", ")}.` : ""}</Notice>
                  <span className="small muted">Saved as assignment {event.assignment_id}, version {(event.assignment_version ?? 1) + 1}. Decision written to the audit trail.</span>
                  <Link className="btn" to="/">Back to dashboard</Link>
                </div>
              ) : (
                <Notice tone="info">All options rejected{event.decision?.note ? ` (${event.decision.note})` : ""}. The shift stays flagged as uncovered on the dashboard until it is filled.</Notice>
              )}
              <ErrorNotice error={decideError} />
            </Card>
            <Card title="Audit trail">
              <AuditList entries={related} compact />
            </Card>
          </div>
        </div>
      )}
      {event.status === "resolved" && event.decision?.action === "approved" && (
        <Card title="Handover notes for the incoming caregivers" actions={<span className="chip ai"><IconSpark size={12} />Gemini · drafted</span>}>
          {Object.keys(event.handover_notes ?? {}).length > 0 ? (
            <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {Object.entries(event.handover_notes).map(([cid, note]) => (
                <div key={cid} className="card" style={{ padding: 16, gap: 8, background: "var(--linen)", borderColor: "transparent" }}>
                  <strong>{names[cid] ?? cid}</strong>
                  <p style={{ fontSize: 15, lineHeight: 1.6 }}>{note}</p>
                </div>
              ))}
            </div>
          ) : handover.busy ? <Spinner label="Gemini is drafting handover notes…" />
            : !aiAvailable ? <p className="muted">Gemini is unavailable, so no handover notes were drafted. The new schedule is saved.</p>
            : <div className="stack"><ErrorNotice error={handover.error} />
                <button className="btn secondary small" style={{ alignSelf: "flex-start" }} onClick={async () => { const e = await handover.run(); if (e) setEvent(e); }}>Draft handover notes</button></div>}
          <p className="small muted">Operational only: times, who hands over to whom, the client’s stated preferences. Checked against the approved plan; never clinical.</p>
        </Card>
      )}
      {event.excluded.length > 0 && (
        <Card title="Ruled out for this shift" className="linen">
          <div className="stack-sm">{event.excluded.map((e) => (
            <div key={e.caregiver_id} className="spread small"><strong style={{ flex: "1 1 140px" }}>{e.name}</strong><span style={{ flex: "2 1 240px" }}>{e.reason}</span><Provenance kind="rule">Rule {e.rule_id}</Provenance></div>
          ))}</div>
        </Card>
      )}
    </Page>
  );
}

function OptionCard({ o, names, colours, shift, recommended, selected, disabled, onPick }: {
  o: ReplanOption; names: Record<string, string>; colours: Record<string, string>; shift?: ShiftView; recommended: boolean;
  selected: boolean; disabled: boolean; onPick: () => void;
}) {
  const start = shift ? new Date(shift.start).getTime() : new Date(o.segments[0].start).getTime();
  const end = shift ? new Date(shift.end).getTime() : new Date(o.segments[o.segments.length - 1].end).getTime();
  const segs = [...o.segments].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <article className={`option${selected ? " selected" : ""}`} aria-labelledby={`opt-${o.id}`}>
      <div className="spread" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div className="stack-sm" style={{ gap: 4 }}>
          <span className="eyebrow inline">Option {o.id}{recommended && <span className="tag human" style={{ letterSpacing: "0.04em" }}>Recommended</span>}</span>
          <h3 id={`opt-${o.id}`} style={{ fontSize: 18, fontWeight: 600 }}>{o.title}</h3>
        </div>
        <span className={`score${o.feasible ? "" : " struck"}`} style={{ fontSize: 44 }}>{o.total}</span>
      </div>
      <div className="stack-sm" style={{ gap: 4 }}>
        <div className="coverage" role="img" aria-label={segs.map((s) => `${s.caregiver_id ? names[s.caregiver_id] : "uncovered"} ${span(s.start, s.end)}`).join(", ")}>
          {segs.map((s, i) => {
            const width = (new Date(s.end).getTime() - new Date(s.start).getTime()) / (end - start);
            const handover = i > 0 && s.caregiver_id && segs[i - 1].caregiver_id;
            return (
              <Fragment key={i}>
                {handover && <span className="handover" />}
                <span className={s.caregiver_id ? "" : "gap"} style={{ flex: width, background: s.caregiver_id ? colours[s.caregiver_id] : undefined }}>
                  {s.caregiver_id ? names[s.caregiver_id]?.split(" ")[0] : "Uncovered"}
                </span>
              </Fragment>
            );
          })}
        </div>
        <div className="ticks"><span>{time(new Date(start).toISOString())}</span>{segs.length > 1 && <span>{time(segs[1].start)}</span>}<span>{time(new Date(end).toISOString())}</span></div>
      </div>
      <ul className="checklist">
        {o.pros.map((p) => <li key={p}><IconCheck size={16} style={{ color: "var(--ok)", flex: "none", marginTop: 1 }} />{p}</li>)}
        {o.cons.map((c) => <li key={c}>{o.feasible ? <IconMinus size={16} style={{ color: "var(--risk)", flex: "none", marginTop: 1 }} /> : <IconX size={16} style={{ color: "var(--risk)", flex: "none", marginTop: 1 }} />}{c}</li>)}
      </ul>
      <button className={`btn ${selected ? "" : "secondary"} small`} style={{ marginTop: "auto" }} aria-pressed={selected} disabled={disabled} onClick={onPick}>
        {selected ? "Selected" : `Select option ${o.id}`}
      </button>
    </article>
  );
}
