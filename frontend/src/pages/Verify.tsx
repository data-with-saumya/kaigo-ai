import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconCheck, IconFile, IconSpark, IconUpload, IconX } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { Card, ErrorNotice, Notice, Provenance, Spinner, VerificationChip } from "../components/ui";
import { api } from "../lib/api";
import { day, fieldLabel, relativeDay, time } from "../lib/format";
import { useAction, useLive } from "../lib/hooks";
import type { CheckResult, Credential, CredentialFields } from "../lib/types";

const FIELD_ORDER: (keyof CredentialFields)[] = ["caregiver_name", "credential_type", "registration_number",
  "issuing_authority", "issue_date", "valid_until"];

export function VerifyPage() {
  const [params, setParams] = useSearchParams();
  const credentials = useLive(api.credentials);
  const caregivers = useLive(api.caregivers);
  const samples = useLive(api.samples, [], 600000);
  const reference = useLive(api.reference, [], 600000);
  const { aiAvailable } = useWorkspace();

  const selectedId = params.get("credential");
  const selected = credentials.data?.find((c) => c.id === selectedId) ?? null;
  const [caregiverId, setCaregiverId] = useState(params.get("caregiver") ?? "");
  const [manual, setManual] = useState(false);
  const select = (id: string) => setParams({ credential: id });

  const extractSample = useAction((file: string) => api.extractSample(file, caregiverId || undefined));
  const upload = useAction((file: File) => api.uploadCredential(file, caregiverId || undefined));
  const names = useMemo(() => Object.fromEntries((caregivers.data ?? []).map((c) => [c.id, c.name])), [caregivers.data]);

  useEffect(() => {
    if (!selectedId && credentials.data?.length) {
      const pending = credentials.data.find((c) => c.status !== "verified") ?? credentials.data[0];
      setParams({ credential: pending.id }, { replace: true });
    }
  }, [selectedId, credentials.data, setParams]);

  const run = async (action: Promise<Credential | undefined>) => {
    const result = await action;
    if (result) { await credentials.reload(); select(result.id); }
  };
  const busy = extractSample.busy || upload.busy;

  return (
    <Page note="papers first." eyebrow="Trust · Credential verification" title={selected ? `${selected.fields.caregiver_name ?? "Unknown"} — ${selected.document_name}` : "Credential verification"}
      actions={selected && <VerificationChip status={selected.status} />}>
      <div className="row">
        <div className="col grow-1" style={{ flexBasis: 360 }}>
          <Card title="Add a document">
            <div className="field">
              <label htmlFor="cg">Caregiver</label>
              <select id="cg" className="input" value={caregiverId} onChange={(e) => setCaregiverId(e.target.value)}>
                <option value="">Match by the name on the document</option>
                {caregivers.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}
              </select>
            </div>
            {aiAvailable ? (
              <>
                <div className="dropzone">
                  <span className="small" style={{ fontWeight: 600 }}>Try a synthetic sample</span>
                  <div className="stack-sm">
                    {samples.data?.filter((s) => s.kind !== "training").map((s) => (
                      <button key={s.file} className="btn quiet small" style={{ justifyContent: "flex-start" }} disabled={busy}
                        onClick={() => run(extractSample.run(s.file))}>
                        <IconSpark size={14} />{s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="btn secondary" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
                  <IconUpload size={16} />Upload your own (PNG, JPG, PDF)
                  <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) run(upload.run(f)); e.target.value = ""; }} />
                </label>
                <p className="small muted">Only upload fictional documents. Real credentials must not be used in this demo.</p>
              </>
            ) : (
              <Notice tone="review">Gemini is unavailable, so documents can’t be read automatically. You can still enter the fields yourself. The same rules check them.</Notice>
            )}
            {busy && <Spinner label="Gemini is reading the document, then the rules check it…" />}
            <ErrorNotice error={extractSample.error ?? upload.error} />
            <button className="link-btn small" style={{ alignSelf: "flex-start" }} onClick={() => setManual((m) => !m)}>
              {manual ? "Hide manual entry" : "Enter fields manually instead"}
            </button>
            {manual && <ManualEntry caregiverId={caregiverId} onDone={(c) => { setManual(false); credentials.reload(); select(c.id); }} />}
          </Card>

          <Card title="Documents">
            {credentials.loading && !credentials.data && <Spinner label="Loading…" />}
            <div className="stack-sm">
              {credentials.data?.map((c) => (
                <button key={c.id} className={`file-row${c.id === selectedId ? " active" : ""}`} onClick={() => select(c.id)}
                  aria-current={c.id === selectedId ? "true" : undefined}>
                  <IconFile size={20} style={{ color: "var(--gold-ink)" }} />
                  <span className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{c.caregiver_id ? names[c.caregiver_id] ?? c.caregiver_id : c.fields.caregiver_name ?? "Unlinked"}</strong>
                    <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.document_name}</span>
                  </span>
                  <VerificationChip status={c.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="col grow-2">
          {selected ? <CredentialDetail credential={selected} sampleFiles={samples.data?.map((s) => s.file) ?? []}
            reference={reference.data} onChanged={credentials.reload} /> :
            <Card><p className="muted">Choose or add a document to see its verification.</p></Card>}
        </div>
      </div>
    </Page>
  );
}

function CredentialDetail({ credential: c, sampleFiles, reference, onChanged }: {
  credential: Credential; sampleFiles: string[]; reference: Awaited<ReturnType<typeof api.reference>> | null;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const loadOriginal = useAction(() => api.credentialDocument(c.id));
  useEffect(() => { setOriginal(null); }, [c.id]);
  const decide = useAction((action: "approve" | "reject") => api.decideCredential(c.id, action, note || undefined));
  const passed = c.checks.filter((x) => x.passed).length;
  const blocking = c.checks.find((x) => x.severity === "block");
  const reviews = c.checks.filter((x) => x.severity === "review");
  const confidence = Object.fromEntries(c.evidence.map((e) => [e.field, e]));
  const decided = c.status === "verified" || c.status === "rejected";
  const usedRefs = new Set(c.checks.map((x) => x.reference_id).filter(Boolean));
  const source = c.extraction_source === "gemini" ? <Provenance kind="ai">Gemini · proposed</Provenance>
    : c.extraction_source === "manual" ? <Provenance kind="human">Entered by coordinator</Provenance>
    : <Provenance kind="system">Demo record</Provenance>;

  return (
    <>
      <Card title="Verification result" actions={<span className="num" style={{ fontSize: 40, lineHeight: 1 }}>{passed}<span className="muted" style={{ fontSize: 20 }}>/{c.checks.length}</span></span>}>
        <p style={{ color: "var(--ink-2)" }}>
          {blocking ? `Blocked: ${blocking.detail}`
            : reviews.length ? `${reviews.length} item${reviews.length > 1 ? "s" : ""} need${reviews.length > 1 ? "" : "s"} a person: ${reviews.map((r) => r.label.toLowerCase()).join("; ")}.`
            : "Every rule passed. A coordinator approves before this caregiver can be matched."}
        </p>
        {!decided ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="note">Note for the audit trail (optional)</label>
              <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the council to confirm" />
            </div>
            <div className="inline">
              <button className="btn" disabled={decide.busy || Boolean(blocking) || !c.caregiver_id}
                onClick={async () => { if (await decide.run("approve")) onChanged(); }}>
                <IconCheck size={16} />Approve verification
              </button>
              <button className="btn danger" disabled={decide.busy} onClick={async () => { if (await decide.run("reject")) onChanged(); }}>Reject</button>
            </div>
            {!c.caregiver_id && <Notice tone="review">This document isn’t linked to a caregiver profile. Choose the caregiver and upload it again to approve.</Notice>}
            {blocking && <p className="small muted">Blocked documents can’t be approved. Ask the caregiver for a renewed registration.</p>}
          </div>
        ) : (
          <Notice tone={c.status === "verified" ? "ok" : "risk"}>
            <strong>{c.status === "verified" ? "Approved" : "Rejected"}{c.decided_at ? ` ${relativeDay(c.decided_at).toLowerCase()} at ${time(c.decided_at)}` : ""}.</strong>{" "}
            {c.status === "verified" ? "This caregiver can now be matched. Flagged items stay flagged." : ""}
            {c.decision_note ? ` Note: ${c.decision_note}` : ""}
            {c.status === "verified" && <> <Link to="/requests/new">Next: care request</Link></>}
          </Notice>
        )}
        <ErrorNotice error={decide.error} />
      </Card>

      {c.storage_path && !sampleFiles.includes(c.document_name) && (
        <Card title="Original document" actions={<span className="chip rule">Private · Cloud Storage</span>}>
          {original ? (c.mime_type === "application/pdf"
            ? <a className="btn secondary small" href={original} target="_blank" rel="noreferrer">Open PDF</a>
            : <figure className="doc-preview"><img src={original} alt={`Uploaded document: ${c.document_name}`} /></figure>)
            : <button className="btn secondary small" style={{ alignSelf: "flex-start" }} disabled={loadOriginal.busy}
                onClick={async () => { const url = await loadOriginal.run(); if (url) setOriginal(url); }}>View the uploaded original</button>}
          <ErrorNotice error={loadOriginal.error} />
          <p className="small muted">Stored privately for this workspace only and deleted automatically after 30 days.</p>
        </Card>
      )}
      {sampleFiles.includes(c.document_name) && (
        <figure className="doc-preview">
          <img src={api.sampleUrl(c.document_name)} alt={`Synthetic document: ${c.document_name}`} />
          <figcaption>Fictional document, generated for this demo. No real person, seal or signature.</figcaption>
        </figure>
      )}

      <Card title="Extracted information" actions={<>{source}<span className="chip ok">Schema valid</span></>}>
        <div className="table-wrap">
          <table style={{ minWidth: 520 }}>
            <thead><tr><th>Field</th><th>Value</th><th>Read from</th><th style={{ textAlign: "right" }}>Confidence</th></tr></thead>
            <tbody>
              {FIELD_ORDER.map((f) => {
                const ev = confidence[f];
                const low = ev && ev.confidence < 0.85;
                const raw = c.fields[f];
                const value = raw && (f === "issue_date" || f === "valid_until") ? day(String(raw)) : raw;
                return (
                  <tr key={f} className={low || !raw ? "flag" : ""}>
                    <td className="muted">{fieldLabel(f)}</td>
                    <td><strong>{value ?? <span style={{ color: "var(--risk)" }}>Missing or unreadable</span>}</strong></td>
                    <td className="small muted">{ev?.source_text ?? "—"}</td>
                    <td className="num" style={{ textAlign: "right", fontSize: 16, color: low ? "var(--review)" : undefined }}>{ev ? ev.confidence.toFixed(2) : "—"}</td>
                  </tr>
                );
              })}
              <tr><td className="muted">Skills on document</td><td colSpan={3}>{c.fields.skills.length ? c.fields.skills.join(" · ") : <span className="muted">None listed</span>}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">Values read below 0.85 confidence go to a person instead of being used automatically.</p>
      </Card>

      <Card title="Checks">
        <div className="stack-sm">{c.checks.map((check) => <CheckRow key={check.rule_id} check={check} />)}</div>
      </Card>

      {reference && (
        <Card title="Evidence and sources" className="linen">
          <div className="grid-auto">
            {reference.authorities.filter((a) => usedRefs.has(a.id)).map((a) => (
              <div key={a.id} className="card" style={{ padding: 14, gap: 6 }}>
                <span className={`tag ${a.synthetic ? "review" : "human"}`} style={{ alignSelf: "flex-start" }}>{a.synthetic ? "Synthetic" : "Public reference"}</span>
                <strong style={{ fontSize: 14 }}>{a.name}</strong>
                <span className="small muted">{a.notes}</span>
                {a.source_url && <a className="small" href={a.source_url} target="_blank" rel="noreferrer">Source</a>}
              </div>
            ))}
            {reference.documents.filter((d) => usedRefs.has(d.id)).map((d) => (
              <div key={d.id} className="card" style={{ padding: 14, gap: 6 }}>
                <span className="tag human" style={{ alignSelf: "flex-start" }}>Public reference</span>
                <strong style={{ fontSize: 14 }}>{d.title}</strong>
                <span className="small muted">Used for: {d.used_for}</span>
                <a className="small" href={d.url} target="_blank" rel="noreferrer">Source · {d.publisher}</a>
              </div>
            ))}
            <div className="card" style={{ padding: 14, gap: 6 }}>
              <span className="tag rule" style={{ alignSelf: "flex-start" }}>Kaigo rules</span>
              <strong style={{ fontSize: 14 }}>Home-nursing rules</strong>
              <span className="small muted">Accepted credential types, expiry, evidence and confidence thresholds</span>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const tone = check.severity === "block" ? "risk" : check.severity === "review" ? "review" : check.severity === "info" ? "" : "ok";
  const icon = check.severity === "block" ? <IconX size={14} /> : check.severity === "review" ? <span style={{ fontWeight: 800 }}>!</span>
    : check.severity === "info" ? <span style={{ fontWeight: 800 }}>i</span> : <IconCheck size={14} />;
  return (
    <div className="spread" style={{ flexWrap: "nowrap", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--seam-soft)" }}>
      <div className="inline" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 12 }}>
        <span className={`chip ${tone}`} style={{ width: 26, height: 26, padding: 0, justifyContent: "center", flex: "none" }}>{icon}</span>
        <span className="stack-sm" style={{ gap: 2 }}><strong style={{ fontSize: 15 }}>{check.label}</strong><span className="small muted">{check.detail}</span></span>
      </div>
      <Provenance kind="rule">Rule {check.rule_id}</Provenance>
    </div>
  );
}

function ManualEntry({ caregiverId, onDone }: { caregiverId: string; onDone: (c: Credential) => void }) {
  const [f, setF] = useState<CredentialFields>({ caregiver_name: "", credential_type: "Registered Nurse", registration_number: "",
    issuing_authority: "Demo State Nursing Council", issue_date: "", valid_until: "", skills: [] });
  const [skills, setSkills] = useState("");
  const save = useAction(() => api.manualCredential(caregiverId || undefined, "Entered manually", {
    ...f, issue_date: f.issue_date || null, valid_until: f.valid_until || null,
    skills: skills.split(",").map((s) => s.trim()).filter(Boolean) }));
  const set = (k: keyof CredentialFields) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); const c = await save.run(); if (c) onDone(c); };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="field"><label htmlFor="m-name">Name on document</label><input id="m-name" className="input" required value={f.caregiver_name ?? ""} onChange={set("caregiver_name")} /></div>
      <div className="field"><label htmlFor="m-type">Credential type</label>
        <select id="m-type" className="input" value={f.credential_type ?? ""} onChange={set("credential_type")}>
          <option>Registered Nurse</option><option>Registered Nurse &amp; Registered Midwife</option><option>Auxiliary Nurse Midwife</option>
        </select></div>
      <div className="field"><label htmlFor="m-num">Registration number</label><input id="m-num" className="input" value={f.registration_number ?? ""} onChange={set("registration_number")} /></div>
      <div className="field"><label htmlFor="m-auth">Issuing authority</label><input id="m-auth" className="input" value={f.issuing_authority ?? ""} onChange={set("issuing_authority")} /></div>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div className="field"><label htmlFor="m-issue">Issue date</label><input id="m-issue" type="date" className="input" value={f.issue_date ?? ""} onChange={set("issue_date")} /></div>
        <div className="field"><label htmlFor="m-valid">Valid until</label><input id="m-valid" type="date" className="input" value={f.valid_until ?? ""} onChange={set("valid_until")} /></div>
      </div>
      <div className="field"><label htmlFor="m-skills">Skills on document (comma separated)</label><input id="m-skills" className="input" value={skills} onChange={(e) => setSkills(e.target.value)} /></div>
      <button className="btn" type="submit" disabled={save.busy}>Run the checks</button>
      <ErrorNotice error={save.error} />
    </form>
  );
}
