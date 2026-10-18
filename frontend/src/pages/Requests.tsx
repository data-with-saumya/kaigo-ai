import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ByGemini, DoneStep, More, StepCard, Steps } from "../components/Flow";
import { IconArrow, IconX } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { ErrorNotice, Notice, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { day, fieldLabel, isoDay, skill, vertical } from "../lib/format";
import { broadcastRefresh, useAction, useLive } from "../lib/hooks";
import type { CareRequest, Requirements } from "../lib/types";

export const BOOK_STEPS = ["Describe the care", "Check the details", "Choose a caregiver", "Booked"];
const EXAMPLES = [
  "Mrs Sharma needs a wound-care nurse from 6 PM to 6 AM for the next five days.",
  "Mr Iyer's family would like overnight hospice support this weekend, 8 PM to 8 AM.",
  "Lakshmi needs a nurse for morning post-op visits, 8 to 2, for the next three days.",
];
const SKILL_CATALOGUE = ["wound_care", "iv_therapy", "palliative_care", "post_operative_care", "diabetic_care",
  "medication_administration", "catheter_care", "tracheostomy_care", "elderly_care", "family_communication", "mobility_assistance"];

/** Every booking, newest first. */
export function RequestsListPage() {
  const requests = useLive(api.careRequests);
  const clients = useLive(api.clients, [], 600000);
  const names = Object.fromEntries((clients.data ?? []).map((c) => [c.id, c.name]));
  return (
    <Page title="All bookings" actions={<Link className="btn primary small" to="/requests/new" viewTransition>New booking</Link>}>
      {requests.loading && !requests.data && <Spinner label="Loading…" />}
      {requests.data?.length === 0 && <p className="muted">No bookings yet.</p>}
      <ul className="row-list">
        {requests.data?.map((r) => (
          <li key={r.id}>
            <Link to={r.status === "draft" ? `/requests/${r.id}` : `/requests/${r.id}/match`} className="row-link">
              <span className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                <strong>{names[r.client_id] ?? r.client_id}</strong>
                <span className="small muted ellipsis">{r.raw_text ?? "Entered by hand"} · {r.requirements.shift_start}–{r.requirements.shift_end}, {r.requirements.duration_days} day{r.requirements.duration_days > 1 ? "s" : ""}</span>
              </span>
              {r.status === "assigned" ? <span className="chip ok">Booked</span>
                : r.requirements.needs_review.length ? <span className="chip review">Needs confirmation</span>
                : <span className="chip">{r.status === "confirmed" ? "Choose a caregiver" : "Draft"}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}

/** Book, steps 1 and 2: describe the care in plain words, then check what was understood. */
export function RequestEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { aiDown } = useWorkspace();
  const clients = useLive(api.clients, [], 600000);
  const [request, setRequest] = useState<CareRequest | null>(null);
  const [clientId, setClientId] = useState("CL-0031");
  const [text, setText] = useState(EXAMPLES[0]);
  const load = useAction((rid: string) => api.careRequest(rid));
  const extract = useAction(() => api.extractRequest(clientId, text));

  useEffect(() => {
    if (id) load.run(id).then((r) => { if (r) { setRequest(r); setClientId(r.client_id); setText(r.raw_text ?? ""); } });
    else setRequest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const client = clients.data?.find((c) => c.id === clientId);
  const manualStart = (): Requirements => ({
    care_type: client?.vertical ?? "home_nursing", required_credentials: ["RN", "RN-RM"], required_skills: [],
    shift_start: "18:00", shift_end: "06:00", start_date: isoDay(new Date()), duration_days: 1,
    location_area: client?.location.area ?? "", prefer_familiar: client?.prefer_familiar ?? true, priority: "normal", needs_review: [],
  });

  if (id && !request && load.error) {
    return (
      <Page title="Booking not found" back={{ to: "/requests", label: "All bookings" }}>
        <Notice tone="info">This booking isn’t in your demo agency any more; the demo may have been reset. <Link to="/requests/new">Start a new booking</Link>.</Notice>
      </Page>
    );
  }

  return (
    <Page title={request ? `Booking for ${client?.name ?? "client"}` : "New booking"} lead="Describe the care in plain words. KaigoAI turns it into requirements and finds the right caregiver.">
      <Steps steps={BOOK_STEPS} current={request ? 2 : 1} />
      {load.busy && !request && <Spinner label="Loading…" />}

      {!id && (
        <StepCard n={1} title="What care is needed?">
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="client">Client</label>
              <select id="client" className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.location.area}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="example">Start from an example</label>
              <select id="example" className="input" value={EXAMPLES.includes(text) ? text : ""} onChange={(e) => e.target.value && setText(e.target.value)}>
                <option value="">Write your own…</option>
                {EXAMPLES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ask">In your own words</label>
            <textarea id="ask" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            <span className="small muted">Describe the care, not a diagnosis. Medical details are dropped.</span>
          </div>
          <div className="inline">
            <button className="btn primary" disabled={aiDown || extract.busy || !clientId || text.trim().length < 5}
              onClick={async () => { const r = await extract.run(); if (r) { broadcastRefresh(); navigate(`/requests/${r.id}`); } }}>
              Continue<IconArrow size={16} />
            </button>
            {extract.busy && <Spinner label="Gemini is reading the request…" />}
          </div>
          {aiDown && <Notice tone="review">Gemini is paused. Fill in the details by hand below; matching works the same.</Notice>}
          <ErrorNotice error={extract.error} />
          <More label="Fill in the details by hand instead" open={aiDown}>
            <ManualCreate clientId={clientId} text={text} initial={manualStart()} />
          </More>
        </StepCard>
      )}

      {request && (
        <>
          <DoneStep label="Request" value={<>{client?.name} · “{request.raw_text ?? "Entered by hand"}”</>} edit={request.status === "assigned" ? undefined : { to: "/requests/new", label: "Start again" }} />
          <RequirementsStep key={request.id} request={request} onSaved={setRequest} />
        </>
      )}
    </Page>
  );
}

function ManualCreate({ clientId, text, initial }: { clientId: string; text: string; initial: Requirements }) {
  const navigate = useNavigate();
  const [r, setR] = useState(initial);
  const create = useAction(() => api.createRequest(clientId, r, text));
  return (
    <div className="stack">
      <RequirementFields r={r} onChange={setR} flagged={[]} />
      <button className="btn" style={{ alignSelf: "flex-start" }} disabled={create.busy || r.required_skills.length === 0}
        onClick={async () => { const c = await create.run(); if (c) { broadcastRefresh(); navigate(`/requests/${c.id}/match`); } }}>
        Find caregivers<IconArrow size={16} />
      </button>
      <ErrorNotice error={create.error} />
    </div>
  );
}

function RequirementsStep({ request, onSaved }: { request: CareRequest; onSaved: (r: CareRequest) => void }) {
  const navigate = useNavigate();
  const [r, setR] = useState<Requirements>(request.requirements);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const remaining = request.requirements.needs_review.filter((f) => !confirmed.includes(f));
  const resolve = (field: string) => setConfirmed((c) => (c.includes(field) ? c : [...c, field]));
  const save = useAction(async () => {
    const updated = await api.updateRequirements(request.id, r, confirmed);
    return api.confirmRequest(updated.id);
  });
  const assigned = request.status === "assigned";
  const questions = request.ambiguities.filter((a) => remaining.includes(a.field));
  const otherFlags = remaining.filter((f) => !request.ambiguities.find((a) => a.field === f));

  return (
    <StepCard n={2} title="Is this right?" aside={request.extraction_source === "gemini" ? <ByGemini>Read by Gemini</ByGemini> : undefined}>
      <dl className="facts">
        <dt>Care</dt><dd>{vertical(r.care_type)}{r.required_skills.length ? ` · ${r.required_skills.map(skill).join(", ")}` : ""}</dd>
        <dt>Hours</dt><dd>{r.shift_start} to {r.shift_end}</dd>
        <dt>Starts</dt><dd className={remaining.includes("start_date") ? "flagged" : ""}>{day(r.start_date)}, for {r.duration_days} day{r.duration_days > 1 ? "s" : ""}</dd>
        <dt>Where</dt><dd>Client’s home · {r.location_area}</dd>
      </dl>

      {!assigned && questions.map((a) => (
        <div key={a.field} className="question">
          <strong>{a.field === "start_date" ? "When should care start?" : `Please confirm: ${fieldLabel(a.field).toLowerCase()}`}</strong>
          <span className="small">{a.reason}</span>
          {a.field === "start_date" && a.choices.length > 0 ? (
            <div className="inline">{a.choices.map((choice) => (
              <button key={choice} className="btn secondary small" onClick={() => { setR({ ...r, start_date: choice.slice(0, 10) }); resolve("start_date"); }}>
                {day(choice.slice(0, 10))}
              </button>))}
            </div>
          ) : <button className="btn secondary small" style={{ alignSelf: "flex-start" }} onClick={() => resolve(a.field)}>Looks right</button>}
        </div>
      ))}
      {!assigned && otherFlags.length > 0 && (
        <div className="question">
          <strong>Please check: {otherFlags.map(fieldLabel).join(", ").toLowerCase()}</strong>
          <span className="small">Gemini wasn’t sure. Change it under “Edit the details”, or confirm it.</span>
          <button className="btn secondary small" style={{ alignSelf: "flex-start" }} onClick={() => otherFlags.forEach(resolve)}>Looks right</button>
        </div>
      )}

      <div className="inline">
        {assigned ? <Link className="btn" to={`/requests/${request.id}/match`}>See the booking</Link> : (
          <button className="btn primary" disabled={save.busy || remaining.length > 0 || r.required_skills.length === 0}
            onClick={async () => { const c = await save.run(); if (c) { onSaved(c); broadcastRefresh(); navigate(`/requests/${c.id}/match`); } }}>
            {remaining.length ? "Answer the question above" : <>Find caregivers<IconArrow size={16} /></>}
          </button>
        )}
        {save.busy && <Spinner label="Saving…" />}
      </div>
      <ErrorNotice error={save.error} />
      {!assigned && (
        <More label="Edit the details">
          <RequirementFields r={r} onChange={(next, field) => { setR(next); if (field) resolve(field); }} flagged={remaining} />
        </More>
      )}
    </StepCard>
  );
}

function RequirementFields({ r, onChange, flagged }: { r: Requirements; onChange: (r: Requirements, field?: string) => void; flagged: string[] }) {
  const [adding, setAdding] = useState("");
  const flag = (field: string) => (flagged.includes(field) ? " flagged" : "");
  return (
    <div className="form-grid two">
      <div className="field">
        <label htmlFor="ctype">Care type</label>
        <select id="ctype" className={`input${flag("care_type")}`} value={r.care_type} onChange={(e) => onChange({ ...r, care_type: e.target.value as Requirements["care_type"] }, "care_type")}>
          <option value="home_nursing">Home nursing</option><option value="hospice">Hospice</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="addskill">Skills</label>
        <div className="inline">
          {r.required_skills.map((s) => (
            <span key={s} className="chip" style={{ paddingRight: 4 }}>{skill(s)}
              <button aria-label={`Remove ${skill(s)}`} className="link-btn" style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                onClick={() => onChange({ ...r, required_skills: r.required_skills.filter((x) => x !== s) }, "skills")}><IconX size={12} /></button>
            </span>
          ))}
          <select id="addskill" className="input" style={{ width: "auto", minHeight: 36 }} value={adding}
            onChange={(e) => { const v = e.target.value; setAdding(""); if (v) onChange({ ...r, required_skills: [...r.required_skills, v] }, "skills"); }}>
            <option value="">Add a skill…</option>
            {SKILL_CATALOGUE.filter((s) => !r.required_skills.includes(s)).map((s) => <option key={s} value={s}>{skill(s)}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <span className="label">Hours</span>
        <div className="inline" style={{ flexWrap: "nowrap" }}>
          <label className="sr-only" htmlFor="ss">Start</label>
          <input id="ss" type="time" className={`input num${flag("shift_times")}`} value={r.shift_start} onChange={(e) => onChange({ ...r, shift_start: e.target.value }, "shift_times")} />
          <span className="muted">to</span>
          <label className="sr-only" htmlFor="se">End</label>
          <input id="se" type="time" className={`input num${flag("shift_times")}`} value={r.shift_end} onChange={(e) => onChange({ ...r, shift_end: e.target.value }, "shift_times")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="sd">First day</label>
        <input id="sd" type="date" className={`input num${flag("start_date")}`} value={r.start_date} onChange={(e) => onChange({ ...r, start_date: e.target.value }, "start_date")} />
      </div>
      <div className="field">
        <label htmlFor="dd">Days</label>
        <input id="dd" type="number" min={1} max={60} className={`input num${flag("duration_days")}`} value={r.duration_days}
          onChange={(e) => onChange({ ...r, duration_days: Math.max(1, Number(e.target.value) || 1) }, "duration_days")} />
      </div>
      <div className="field">
        <span className="label">Continuity</span>
        <label className="readonly" style={{ gap: 10 }}>
          <input type="checkbox" checked={r.prefer_familiar} onChange={(e) => onChange({ ...r, prefer_familiar: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: "var(--ink)" }} />Prefer caregivers who know the client
        </label>
      </div>
    </div>
  );
}
