import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconArrow, IconSpark, IconX } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { Card, ErrorNotice, Notice, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { day, fieldLabel, isoDay, skill, vertical } from "../lib/format";
import { useAction, useLive } from "../lib/hooks";
import type { CareRequest, Requirements } from "../lib/types";

const EXAMPLES = [
  "Mrs Sharma needs a wound-care nurse from 6 PM to 6 AM for the next five days.",
  "Mr Iyer's family would like overnight hospice support this weekend, 8 PM to 8 AM.",
  "Lakshmi needs a nurse for morning post-op visits, 8 to 2, for the next three days.",
];
const SKILL_CATALOGUE = ["wound_care", "iv_therapy", "palliative_care", "post_operative_care", "diabetic_care",
  "medication_administration", "catheter_care", "tracheostomy_care", "elderly_care", "family_communication", "mobility_assistance"];

export function RequestsListPage() {
  const requests = useLive(api.careRequests);
  const clients = useLive(api.clients, [], 600000);
  const names = Object.fromEntries((clients.data ?? []).map((c) => [c.id, c.name]));
  return (
    <Page note="in their own words." eyebrow="Fit · Care requests" title="Care requests" actions={<Link className="btn primary" to="/requests/new" viewTransition>New request</Link>}>
      <Card>
        {requests.loading && !requests.data && <Spinner label="Loading…" />}
        <div className="table-wrap">
          <table style={{ minWidth: 600 }}>
            <thead><tr><th>Client</th><th>Request</th><th>Shift</th><th>Status</th><th /></tr></thead>
            <tbody>{requests.data?.map((r) => (
              <tr key={r.id}>
                <td><strong>{names[r.client_id] ?? r.client_id}</strong><div className="small muted">{r.id}</div></td>
                <td className="small">{r.raw_text ?? "Created manually"}</td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>{r.requirements.shift_start}–{r.requirements.shift_end} · {r.requirements.duration_days}d</td>
                <td>{r.status === "assigned" ? <span className="chip ok">Assigned</span>
                  : r.requirements.needs_review.length ? <span className="chip review">Needs confirmation</span>
                  : <span className="chip">{r.status === "confirmed" ? "Ready to match" : "Draft"}</span>}</td>
                <td><Link to={r.status === "draft" ? `/requests/${r.id}` : `/requests/${r.id}/match`}>Open</Link></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

export function RequestEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { aiAvailable } = useWorkspace();
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
  const [manual, setManual] = useState<Requirements | null>(null);

  return (
    <Page note="check the dates." back={{ to: "/requests", label: "Care requests" }} eyebrow={`Fit · ${request ? `Care request ${request.id}` : "New care request"}`} title={request ? `Requirements for ${client?.name ?? "client"}` : "New care request"}>
      <div className="row">
        <Card title="Describe the need" className="grow-1" labelledBy="need">
          <div className="field">
            <label htmlFor="client">Client</label>
            <select id="client" className="input" value={clientId} disabled={Boolean(request)} onChange={(e) => setClientId(e.target.value)}>
              {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.location.area} · {vertical(c.vertical)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ask">Request in plain language</label>
            <textarea id="ask" className="input" rows={5} value={text} disabled={Boolean(request)} onChange={(e) => setText(e.target.value)} />
          </div>
          {!request && (
            <>
              <div className="inline">
                <button className="btn" disabled={!aiAvailable || extract.busy || !clientId || text.trim().length < 5}
                  onClick={async () => { const r = await extract.run(); if (r) navigate(`/requests/${r.id}`); }}>
                  <IconSpark size={16} />Extract requirements
                </button>
                <button className="btn quiet" onClick={() => setManual(manualStart())}>Fill in manually</button>
              </div>
              {extract.busy && <Spinner label="Gemini is reading the request…" />}
              {!aiAvailable && <Notice tone="review">Gemini is unavailable. Use “Fill in manually”: matching and scheduling work the same.</Notice>}
              <ErrorNotice error={extract.error} />
              <div className="stack-sm">
                <span className="small" style={{ fontWeight: 600, color: "var(--ink-2)" }}>Try an example</span>
                <div className="inline">{EXAMPLES.map((e) => (
                  <button key={e} className="btn quiet small" style={{ whiteSpace: "normal", textAlign: "left", height: "auto", padding: "8px 12px" }} onClick={() => setText(e)}>{e}</button>
                ))}</div>
              </div>
            </>
          )}
          <Notice tone="info">Describe the care needed, not a diagnosis. Kaigo plans staffing. It doesn’t make clinical judgements and drops medical details it’s given.</Notice>
        </Card>

        <div className="col" style={{ flex: "1.35 1 520px", minWidth: 0 }}>
          {load.busy && <Spinner label="Loading request…" />}
          <ErrorNotice error={load.error} />
          {request && <RequirementsEditor key={request.id} request={request} onSaved={setRequest} />}
          {!request && manual && <ManualCreate clientId={clientId} text={text} initial={manual} />}
          {!request && !manual && <Card><p className="muted">Extracted requirements appear here. You can review and edit every field before anything is matched.</p></Card>}
        </div>
      </div>
    </Page>
  );
}

function ManualCreate({ clientId, text, initial }: { clientId: string; text: string; initial: Requirements }) {
  const navigate = useNavigate();
  const [r, setR] = useState(initial);
  const create = useAction(() => api.createRequest(clientId, r, text));
  return (
    <Card title="Requirements (manual)" actions={<span className="tag human">Entered by you</span>}>
      <RequirementFields r={r} onChange={setR} flagged={[]} source="manual" />
      <div className="inline" style={{ justifyContent: "flex-end" }}>
        <button className="btn" disabled={create.busy || r.required_skills.length === 0}
          onClick={async () => { const c = await create.run(); if (c) navigate(`/requests/${c.id}/match`); }}>
          Create and find caregivers<IconArrow size={16} />
        </button>
      </div>
      <ErrorNotice error={create.error} />
    </Card>
  );
}

function RequirementsEditor({ request, onSaved }: { request: CareRequest; onSaved: (r: CareRequest) => void }) {
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
  const payload = useMemo(() => JSON.stringify({ ...r, needs_review: remaining }, null, 2), [r, remaining]);

  return (
    <Card title="Structured requirements" actions={<>
      {request.extraction_source === "gemini" && <span className="chip ai"><IconSpark size={12} />Gemini · proposed</span>}
      <span className="chip ok">Schema valid</span></>}>
      {remaining.length > 0 && !assigned && (
        <div className="notice review" role="status">
          <div className="stack">
            <strong>{remaining.map(fieldLabel).join(", ")} need{remaining.length === 1 ? "s" : ""} your confirmation.</strong>
            {request.ambiguities.filter((a) => remaining.includes(a.field)).map((a) => (
              <div key={a.field} className="stack-sm">
                <span className="small">{a.reason}</span>
                {a.field === "start_date" && a.choices.length > 0 && (
                  <div className="inline">{a.choices.map((choice) => (
                    <button key={choice} className="btn secondary small" onClick={() => { setR({ ...r, start_date: choice.slice(0, 10) }); resolve("start_date"); }}>
                      Starts {day(choice.slice(0, 10))}
                    </button>))}
                  </div>
                )}
              </div>
            ))}
            {remaining.some((f) => !request.ambiguities.find((a) => a.field === f)) &&
              <span className="small">Check the highlighted fields below. Editing a field confirms it.</span>}
          </div>
        </div>
      )}

      <RequirementFields r={r} onChange={(next, field) => { setR(next); if (field) resolve(field); }}
        flagged={remaining} source={request.extraction_source} confidence={request.field_confidence} disabled={assigned} />

      <div className="stack-sm">
        <span className="small" style={{ fontWeight: 600, color: "var(--ink-2)" }}>What gets saved, validated against the schema</span>
        <pre className="code">{payload}</pre>
      </div>

      <div className="inline" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--seam-soft)", paddingTop: 12 }}>
        {assigned ? <Link className="btn" to={`/requests/${request.id}/match`}>View assignment</Link> : (
          <button className="btn" disabled={save.busy || remaining.length > 0 || r.required_skills.length === 0}
            onClick={async () => { const c = await save.run(); if (c) { onSaved(c); navigate(`/requests/${c.id}/match`); } }}>
            {remaining.length ? "Confirm the flagged fields to continue" : <>Confirm and find caregivers<IconArrow size={16} /></>}
          </button>
        )}
      </div>
      <ErrorNotice error={save.error} />
    </Card>
  );
}

function RequirementFields({ r, onChange, flagged, source, confidence = {}, disabled = false }: {
  r: Requirements; onChange: (r: Requirements, field?: string) => void; flagged: string[];
  source: CareRequest["extraction_source"]; confidence?: Record<string, number>; disabled?: boolean;
}) {
  const ai = source === "gemini";
  const tag = (field: string) => flagged.includes(field)
    ? <span className="tag review">Confirm{confidence[field] !== undefined ? ` · ${confidence[field].toFixed(2)}` : ""}</span>
    : ai ? <span className="tag ai">Gemini</span> : <span className="tag human">You</span>;
  const [adding, setAdding] = useState("");

  return (
    <div className="form-grid">
      <div className="field">
        <div className="field-head"><label htmlFor="ctype">Care type</label>{tag("care_type")}</div>
        <select id="ctype" className="input" value={r.care_type} disabled={disabled}
          onChange={(e) => onChange({ ...r, care_type: e.target.value as Requirements["care_type"] }, "care_type")}>
          <option value="home_nursing">Home nursing</option><option value="hospice">Hospice</option>
        </select>
      </div>
      <div className="field">
        <div className="field-head"><span className="label">Required credential</span><span className="tag rule">Rule · vertical</span></div>
        <div className="readonly">{r.required_credentials.join(", ")} · verified, in date</div>
      </div>
      <div className="field">
        <div className="field-head"><span className="label">Required skills</span>{tag("skills")}</div>
        <div className="inline">
          {r.required_skills.map((s) => (
            <span key={s} className="chip" style={{ paddingRight: 4 }}>{skill(s)}
              {!disabled && <button aria-label={`Remove ${skill(s)}`} className="link-btn" style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "inherit" }}
                onClick={() => onChange({ ...r, required_skills: r.required_skills.filter((x) => x !== s) }, "skills")}><IconX size={12} /></button>}
            </span>
          ))}
          {!disabled && (
            <select aria-label="Add a skill" className="input" style={{ width: "auto", minHeight: 36 }} value={adding}
              onChange={(e) => { const v = e.target.value; setAdding(""); if (v) onChange({ ...r, required_skills: [...r.required_skills, v] }, "skills"); }}>
              <option value="">Add skill…</option>
              {SKILL_CATALOGUE.filter((s) => !r.required_skills.includes(s)).map((s) => <option key={s} value={s}>{skill(s)}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="field">
        <div className="field-head"><span className="label">Shift</span>{tag("shift_times")}</div>
        <div className="inline" style={{ flexWrap: "nowrap" }}>
          <label className="sr-only" htmlFor="ss">Shift start</label>
          <input id="ss" type="time" className="input num" value={r.shift_start} disabled={disabled} onChange={(e) => onChange({ ...r, shift_start: e.target.value }, "shift_times")} />
          <span className="muted">to</span>
          <label className="sr-only" htmlFor="se">Shift end</label>
          <input id="se" type="time" className="input num" value={r.shift_end} disabled={disabled} onChange={(e) => onChange({ ...r, shift_end: e.target.value }, "shift_times")} />
        </div>
      </div>
      <div className="field">
        <div className="field-head"><label htmlFor="sd">First day</label>{tag("start_date")}</div>
        <input id="sd" type="date" className="input num" value={r.start_date} disabled={disabled} onChange={(e) => onChange({ ...r, start_date: e.target.value }, "start_date")} />
      </div>
      <div className="field">
        <div className="field-head"><label htmlFor="dd">Days</label>{tag("duration_days")}</div>
        <input id="dd" type="number" min={1} max={60} className="input num" value={r.duration_days} disabled={disabled}
          onChange={(e) => onChange({ ...r, duration_days: Math.max(1, Number(e.target.value) || 1) }, "duration_days")} />
      </div>
      <div className="field">
        <div className="field-head"><span className="label">Location</span><span className="tag profile">Client profile</span></div>
        <div className="readonly">Client’s home · {r.location_area}</div>
      </div>
      <div className="field">
        <div className="field-head"><span className="label">Priority</span><span className="tag rule">Rule P-01</span></div>
        <div className="readonly" style={r.priority === "high" ? { background: "var(--risk-bg)", color: "var(--risk)", fontWeight: 600 } : undefined}>
          {r.priority === "high" ? "High · starts within 24 hours" : "Normal"}</div>
      </div>
      <div className="field">
        <div className="field-head"><span className="label">Continuity</span><span className="tag profile">Client profile</span></div>
        <label className="readonly" style={{ background: "var(--surface)", border: "1px solid var(--seam)", gap: 10 }}>
          <input type="checkbox" checked={r.prefer_familiar} disabled={disabled} onChange={(e) => onChange({ ...r, prefer_familiar: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: "var(--ink)" }} />Prefer caregivers who know the client
        </label>
      </div>
    </div>
  );
}
