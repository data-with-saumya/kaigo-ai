import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ByGemini, DoneStep, More, StepCard, Steps } from "../components/Flow";
import { IconCheck, IconX } from "../components/Icons";
import { Page, useWorkspace } from "../components/Shell";
import { ErrorNotice, Notice, Spinner, VerificationChip } from "../components/ui";
import { api } from "../lib/api";
import { fieldLabel, fullDate, relativeDay, time } from "../lib/format";
import { broadcastRefresh, useAction, useLive } from "../lib/hooks";
import type { CheckResult, Credential, CredentialFields } from "../lib/types";

const FIELD_ORDER: (keyof CredentialFields)[] = ["caregiver_name", "credential_type", "registration_number",
  "issuing_authority", "issue_date", "valid_until"];
const UPLOAD = "__upload__";

/** Verify: 1 choose a document → 2 read the result → 3 decide. */
export function VerifyPage() {
  const [params, setParams] = useSearchParams();
  const { aiDown } = useWorkspace();
  const credentials = useLive(api.credentials);
  const caregivers = useLive(api.caregivers, [], 600000);
  const samples = useLive(api.samples, [], 600000);
  const reference = useLive(api.reference, [], 600000);

  const selectedId = params.get("credential");
  const selected = credentials.data?.find((c) => c.id === selectedId) ?? null;
  const [caregiverId, setCaregiverId] = useState(params.get("caregiver") ?? "");
  const [choice, setChoice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const names = useMemo(() => Object.fromEntries((caregivers.data ?? []).map((c) => [c.id, c.name])), [caregivers.data]);
  const sampleList = (samples.data ?? []).filter((s) => s.kind !== "training");
  const sampleFiles = sampleList.map((s) => s.file);

  const check = useAction(async () => {
    if (choice === UPLOAD) { if (!file) throw new Error("Choose a file to upload first."); return api.uploadCredential(file, caregiverId || undefined); }
    return api.extractSample(choice, caregiverId || undefined);
  });
  const run = async () => {
    const result = await check.run();
    if (result) { await credentials.reload(); broadcastRefresh(); setParams({ credential: result.id }); }
  };
  const decided = selected?.status === "verified" || selected?.status === "rejected";
  const step = !selected ? 1 : decided ? 4 : 2;

  if (selectedId && credentials.data && !selected) {
    return (
      <Page title="Document not found" back={{ to: "/documents", label: "All documents" }}>
        <Notice tone="info">This document isn’t in your demo agency any more; the demo may have been reset. <Link to="/verify">Check a new document</Link>.</Notice>
      </Page>
    );
  }

  return (
    <Page title="Verify a caregiver" lead="Gemini reads the registration certificate. Plain rules decide if it’s valid. You approve.">
      <Steps steps={["Choose a document", "Check the result", "Approve or reject"]} current={step} />

      {!selected ? (
        <StepCard n={1} title="Which document?">
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="doc">Document</label>
              <select id="doc" className="input" value={choice} onChange={(e) => { setChoice(e.target.value); if (e.target.value === UPLOAD) fileInput.current?.click(); }}>
                <option value="">Choose a document…</option>
                <optgroup label="Synthetic samples">
                  {sampleList.map((s) => <option key={s.file} value={s.file}>{s.label}</option>)}
                </optgroup>
                <option value={UPLOAD}>Upload your own (PNG, JPG, PDF)…</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cg">Caregiver</label>
              <select id="cg" className="input" value={caregiverId} onChange={(e) => setCaregiverId(e.target.value)}>
                <option value="">Match by the name on the document</option>
                {caregivers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" aria-label="Upload a document"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setChoice(UPLOAD); e.target.value = ""; }} />
          {choice === UPLOAD && (
            <p className="small">{file ? <>File: <strong>{file.name}</strong> · </> : null}
              <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>{file ? "Choose another file" : "Choose a file"}</button>
              <span className="muted"> · Only fictional documents, please.</span></p>
          )}
          <div className="inline">
            <button className="btn primary" disabled={!choice || (choice === UPLOAD && !file) || check.busy || aiDown} onClick={run}>Check document</button>
            {check.busy && <Spinner label="Gemini is reading it, then the rules check it…" />}
          </div>
          {aiDown && <Notice tone="review">Gemini is paused. Enter the details by hand below; the same rules check them.</Notice>}
          <ErrorNotice error={check.error} />
          <More label="Enter the details by hand instead" open={aiDown}>
            <ManualEntry caregiverId={caregiverId} onDone={async (c) => { await credentials.reload(); broadcastRefresh(); setParams({ credential: c.id }); }} />
          </More>
        </StepCard>
      ) : (
        <DoneStep label="Document" value={<>{selected.caregiver_id ? names[selected.caregiver_id] ?? selected.caregiver_id : selected.fields.caregiver_name ?? "Unlinked"} · {selected.document_name}</>}
          edit={{ onClick: () => setParams({}), label: "Check another" }} />
      )}

      {selected && <CredentialSteps key={selected.id} credential={selected} sampleFiles={sampleFiles} reference={reference.data}
        onChanged={async () => { await credentials.reload(); broadcastRefresh(); }} />}
    </Page>
  );
}

function CredentialSteps({ credential: c, sampleFiles, reference, onChanged }: {
  credential: Credential; sampleFiles: string[]; reference: Awaited<ReturnType<typeof api.reference>> | null; onChanged: () => void;
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
  const verdict = blocking ? `Blocked: ${blocking.detail}`
    : reviews.length ? `${reviews.length} item${reviews.length > 1 ? "s need" : " needs"} a person: ${reviews.map((r) => r.label.toLowerCase()).join("; ")}.`
    : "Every rule passed. Approve it so this caregiver can be booked.";
  const value = (f: keyof CredentialFields) => {
    const raw = c.fields[f];
    return raw && (f === "issue_date" || f === "valid_until") ? fullDate(String(raw)) : (raw as string | null);
  };

  return (
    <>
      <StepCard n={2} title="What we found" aside={<VerificationChip status={c.status} />}>
        <p className="verdict">{verdict}</p>
        <dl className="facts">
          <dt>Name</dt><dd>{value("caregiver_name") ?? <Missing />}</dd>
          <dt>Registration</dt><dd>{value("registration_number") ?? <Missing />}</dd>
          <dt>Valid until</dt><dd>{value("valid_until") ?? <Missing />}</dd>
          <dt>Council</dt><dd>{value("issuing_authority") ?? <Missing />}</dd>
        </dl>
        <p className="small muted">{c.extraction_source === "gemini" ? <><ByGemini>Read by Gemini</ByGemini> · </> : null}{passed} of {c.checks.length} rules passed.</p>
        <More label="Show details: every field, every rule, the document">
          <div className="table-wrap">
            <table style={{ minWidth: 520 }}>
              <thead><tr><th>Field</th><th>Value</th><th>Read from</th><th style={{ textAlign: "right" }}>Confidence</th></tr></thead>
              <tbody>
                {FIELD_ORDER.map((f) => {
                  const ev = confidence[f];
                  const low = ev && ev.confidence < 0.85;
                  return (
                    <tr key={f} className={low || !c.fields[f] ? "flag" : ""}>
                      <td className="muted">{fieldLabel(f)}</td>
                      <td><strong>{value(f) ?? <Missing />}</strong></td>
                      <td className="small muted">{ev?.source_text ?? "—"}</td>
                      <td className="num" style={{ textAlign: "right", fontSize: 15, color: low ? "var(--review)" : undefined }}>{ev ? ev.confidence.toFixed(2) : "—"}</td>
                    </tr>
                  );
                })}
                <tr><td className="muted">Skills</td><td colSpan={3}>{c.fields.skills.length ? c.fields.skills.join(" · ") : <span className="muted">None listed</span>}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">Values read below 0.85 confidence go to a person instead of being used automatically.</p>
          <h3 className="more-title">Rules</h3>
          <div className="stack-sm">{c.checks.map((check) => <CheckRow key={check.rule_id} check={check} />)}</div>
          {reference && usedRefs.size > 0 && (
            <>
              <h3 className="more-title">Sources</h3>
              <ul className="plain-list small">
                {reference.authorities.filter((a) => usedRefs.has(a.id)).map((a) => (
                  <li key={a.id}><strong>{a.name}</strong>{a.synthetic ? " (synthetic)" : ""}{a.source_url && <> · <a href={a.source_url} target="_blank" rel="noreferrer">source</a></>}</li>
                ))}
                {reference.documents.filter((d) => usedRefs.has(d.id)).map((d) => (
                  <li key={d.id}><strong>{d.title}</strong> · <a href={d.url} target="_blank" rel="noreferrer">{d.publisher}</a></li>
                ))}
              </ul>
            </>
          )}
          <h3 className="more-title">The document</h3>
          {sampleFiles.includes(c.document_name) ? (
            <figure className="doc-preview">
              <img src={api.sampleUrl(c.document_name)} alt={`Synthetic document: ${c.document_name}`} />
              <figcaption>Fictional document, generated for this demo. No real person, seal or signature.</figcaption>
            </figure>
          ) : c.storage_path ? (
            original ? (c.mime_type === "application/pdf"
              ? <a className="btn secondary small" href={original} target="_blank" rel="noreferrer">Open PDF</a>
              : <figure className="doc-preview"><img src={original} alt={`Uploaded document: ${c.document_name}`} /></figure>)
              : <button className="btn secondary small" style={{ alignSelf: "flex-start" }} disabled={loadOriginal.busy}
                  onClick={async () => { const url = await loadOriginal.run(); if (url) setOriginal(url); }}>View the uploaded original</button>
          ) : <p className="small muted">Entered by hand.</p>}
          <ErrorNotice error={loadOriginal.error} />
        </More>
      </StepCard>

      {!decided ? (
        <StepCard n={3} title="Your decision">
          {!c.caregiver_id && <Notice tone="review">This document isn’t linked to a caregiver. Check it again with the caregiver chosen, then approve.</Notice>}
          <div className="inline">
            <button className="btn primary" disabled={decide.busy || Boolean(blocking) || !c.caregiver_id}
              onClick={async () => { if (await decide.run("approve")) onChanged(); }}><IconCheck size={16} />Approve</button>
            <button className="btn secondary" disabled={decide.busy} onClick={async () => { if (await decide.run("reject")) onChanged(); }}>Reject</button>
          </div>
          {blocking && <p className="small muted">Blocked documents can’t be approved. Ask the caregiver for a renewed registration.</p>}
          <More label="Add a note for the audit trail">
            <label className="sr-only" htmlFor="note">Note</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the council to confirm" />
          </More>
          <ErrorNotice error={decide.error} />
        </StepCard>
      ) : (
        <div className={`done-card ${c.status === "verified" ? "ok" : "risk"}`}>
          <strong>{c.status === "verified" ? "Approved" : "Rejected"}{c.decided_at ? ` ${relativeDay(c.decided_at).toLowerCase()} at ${time(c.decided_at)}` : ""}.</strong>
          <span>{c.status === "verified" ? "This caregiver can now be booked." : "The caregiver can’t be booked until a valid document is approved."}{c.decision_note ? ` Note: ${c.decision_note}` : ""}</span>
          <div className="inline">
            {c.status === "verified" && <Link className="btn small" to="/requests/new">Next: book a caregiver</Link>}
            <Link className="btn secondary small" to="/verify">Check another document</Link>
          </div>
        </div>
      )}
    </>
  );
}

const Missing = () => <span style={{ color: "var(--risk)" }}>Missing or unreadable</span>;

function CheckRow({ check }: { check: CheckResult }) {
  const tone = check.severity === "block" ? "risk" : check.severity === "review" ? "review" : check.severity === "info" ? "" : "ok";
  const icon = check.severity === "block" ? <IconX size={14} /> : check.severity === "review" ? <span style={{ fontWeight: 800 }}>!</span>
    : check.severity === "info" ? <span style={{ fontWeight: 800 }}>i</span> : <IconCheck size={14} />;
  return (
    <div className="rule-row">
      <span className={`chip ${tone}`} style={{ width: 24, height: 24, padding: 0, justifyContent: "center", flex: "none" }}>{icon}</span>
      <span className="stack-sm" style={{ gap: 0 }}><strong style={{ fontSize: 14 }}>{check.label}</strong><span className="small muted">{check.detail}</span></span>
      <span className="small muted" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>Rule {check.rule_id}</span>
    </div>
  );
}

/** Every document checked so far. */
export function DocumentsPage() {
  const credentials = useLive(api.credentials);
  const caregivers = useLive(api.caregivers, [], 600000);
  const names = Object.fromEntries((caregivers.data ?? []).map((c) => [c.id, c.name]));
  return (
    <Page title="All documents" actions={<Link className="btn primary small" to="/verify">Check a document</Link>}>
      {credentials.loading && !credentials.data && <Spinner label="Loading…" />}
      <ul className="row-list">
        {credentials.data?.map((c) => (
          <li key={c.id}>
            <Link to={`/verify?credential=${c.id}`} className="row-link">
              <span className="stack-sm" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                <strong>{c.caregiver_id ? names[c.caregiver_id] ?? c.caregiver_id : c.fields.caregiver_name ?? "Unlinked"}</strong>
                <span className="small muted ellipsis">{c.document_name}</span>
              </span>
              <VerificationChip status={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
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
      <div className="form-grid two">
        <div className="field"><label htmlFor="m-name">Name on document</label><input id="m-name" className="input" required value={f.caregiver_name ?? ""} onChange={set("caregiver_name")} /></div>
        <div className="field"><label htmlFor="m-type">Credential type</label>
          <select id="m-type" className="input" value={f.credential_type ?? ""} onChange={set("credential_type")}>
            <option>Registered Nurse</option><option>Registered Nurse &amp; Registered Midwife</option><option>Auxiliary Nurse Midwife</option>
          </select></div>
        <div className="field"><label htmlFor="m-num">Registration number</label><input id="m-num" className="input" value={f.registration_number ?? ""} onChange={set("registration_number")} /></div>
        <div className="field"><label htmlFor="m-auth">Issuing authority</label><input id="m-auth" className="input" value={f.issuing_authority ?? ""} onChange={set("issuing_authority")} /></div>
        <div className="field"><label htmlFor="m-issue">Issue date</label><input id="m-issue" type="date" className="input" value={f.issue_date ?? ""} onChange={set("issue_date")} /></div>
        <div className="field"><label htmlFor="m-valid">Valid until</label><input id="m-valid" type="date" className="input" value={f.valid_until ?? ""} onChange={set("valid_until")} /></div>
      </div>
      <div className="field"><label htmlFor="m-skills">Skills on document (comma separated)</label><input id="m-skills" className="input" value={skills} onChange={(e) => setSkills(e.target.value)} /></div>
      <button className="btn" type="submit" style={{ alignSelf: "flex-start" }} disabled={save.busy}>Run the checks</button>
      <ErrorNotice error={save.error} />
    </form>
  );
}
