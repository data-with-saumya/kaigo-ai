import { Page } from "../components/Shell";
import { Card, Provenance } from "../components/ui";
import { api } from "../lib/api";
import { useLive } from "../lib/hooks";

const LOOP = [
  { layer: "trust", title: "Trust", body: "Gemini reads the credential document. Rules check expiry, format, eligibility and evidence. A coordinator approves." },
  { layer: "fit", title: "Fit", body: "Gemini turns a plain-language request into requirements. Anything ambiguous waits for the coordinator to confirm." },
  { layer: "fit", title: "Match", body: "Rules decide who is eligible and why others are ruled out. A transparent seven-factor score ranks the rest." },
  { layer: "continuity", title: "Continuity", body: "When a caregiver cancels, Gemini reads the message, rules find the affected shift and build replacement plans with trade-offs." },
  { layer: "continuity", title: "Human decision", body: "The coordinator approves, picks another option, or rejects. The plan is rechecked, then the care state and audit trail update." },
];

const PRINCIPLES = [
  ["People decide", "Staffing changes, verifications and assignments only happen when a coordinator clicks approve."],
  ["Rules stay rules", "Expiry, eligibility, availability, overlaps, rest periods and full coverage are deterministic code, never AI."],
  ["Structured AI only", "Every Gemini answer must match a schema. Invalid answers are retried once, then sent to a person."],
  ["Grounded explanations", "Explanations are built from the rules’ own numbers. One that cites a figure not in the data is withheld."],
  ["Low confidence goes to people", "Values read below 0.85 confidence, and ambiguous dates or senders, are flagged instead of acted on."],
  ["Not clinical", "No diagnoses, no treatment advice. Medical details in requests are dropped. The score is operational only."],
  ["Works without AI", "If Gemini is down, records, rules, matching and replanning still work. AI steps say they are unavailable."],
  ["Synthetic data", "Every person and document in this demo is fictional. Public regulatory information is labelled and sourced."],
];

export function HowItWorksPage() {
  const metrics = useLive(api.metrics, [], 15000);
  return (
    <Page note="the whole loop." back={{ to: "/learn", label: "Learn" }} eyebrow="About" title="How KaigoAI works">
      <Card title="Trust → Fit → Continuity → Human decision → Updated state">
        <ol className="grid-auto" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {LOOP.map((step, i) => (
            <li key={step.title} className="card" style={{ padding: 16, gap: 8 }}>
              <span className="inline"><span className={`dot ${step.layer}`} style={{ width: 14, height: 11 }} /><span className="eyebrow">Step {i + 1}</span></span>
              <strong style={{ fontSize: 17 }}>{step.title}</strong>
              <span className="small" style={{ color: "var(--ink-2)" }}>{step.body}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="row">
        <Card title="Google Cloud architecture" className="grow-2">
          <div className="stack" style={{ alignItems: "stretch" }}>
            <ArchBox title="Firebase Hosting + Authentication" body="Coordinator UI (React). Anonymous sign-in gives each visitor an isolated synthetic workspace. Firestore listeners push live updates." />
            <Arrow />
            <ArchBox title="Cloud Run · FastAPI" body="Small agents behind one API: intake, request, verification, matching, scheduling, simulation, continuity, audit. Structured JSON logs to Cloud Logging." />
            <Arrow />
            <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <ArchBox title="Gemini" body="Reads documents and messages, extracts requirements, explains trade-offs. Called with Cloud Run's service account, so there are no API keys." />
              <ArchBox title="Firestore" body="Caregivers, credentials, clients, requests, assignments, shifts, events, approvals, audit logs." />
              <ArchBox title="Rules + reference" body="Per-vertical YAML rules and an approved reference corpus (public sources plus clearly-marked synthetic entries)." />
            </div>
          </div>
        </Card>
        <Card title="Who produced this value?" className="grow-1 linen">
          <div className="stack">
            <div className="stack-sm"><Provenance kind="ai">Gemini · proposed</Provenance><span className="small">Dashed: AI output. Schema-checked, never final on its own.</span></div>
            <div className="stack-sm"><Provenance kind="rule">Rule V-01 · checked</Provenance><span className="small">Solid: deterministic rule. Same input, same answer.</span></div>
            <div className="stack-sm"><Provenance kind="human">Coordinator · decided</Provenance><span className="small">Filled: a person decided. Written to the audit trail.</span></div>
          </div>
        </Card>
      </div>

      <Card title="Responsible AI">
        <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {PRINCIPLES.map(([title, body]) => (
            <div key={title} className="stack-sm"><strong>{title}</strong><span className="small" style={{ color: "var(--ink-2)" }}>{body}</span></div>
          ))}
        </div>
      </Card>

      <div className="row">
        <Card title="One engine, many care types" className="grow-1">
          <p className="small" style={{ color: "var(--ink-2)" }}>Verticals differ only in configuration: accepted credentials, skills that need evidence, rest rules and score weights. Hospice weighs familiarity and handovers more heavily than home nursing. Childcare is next, with safeguarding checks added as rules.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Weight</th><th>Home nursing</th><th>Hospice</th></tr></thead>
            <tbody>
              {[["Qualification", 20, 20], ["Skills", 20, 20], ["Coverage", 20, 15], ["Familiarity", 15, 20], ["Location", 10, 5], ["Stability", 10, 10], ["Handovers", 5, 10]].map(([k, a, b]) => (
                <tr key={k as string}><td>{k}</td><td className="num">{a}</td><td className="num">{b}</td></tr>))}
            </tbody>
          </table></div>
        </Card>
        <Card title="Gemini calls in your workspace" className="grow-1">
          {!metrics.data?.ai_calls ? <p className="muted small">No AI calls yet. Upload a sample document or send the example message to see live latency and token counts.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Task</th><th>Calls</th><th>Median latency</th><th>Tokens in / out</th></tr></thead>
              <tbody>{Object.entries(metrics.data.by_task).map(([task, t]) => (
                <tr key={task}><td>{task.replace(/_/g, " ")}</td><td className="num">{t.calls}</td>
                  <td className="num">{t.median_latency_ms ? `${(t.median_latency_ms / 1000).toFixed(1)} s` : "—"}</td>
                  <td className="num">{t.input_tokens} / {t.output_tokens}</td></tr>))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </Page>
  );
}

function ArchBox({ title, body }: { title: string; body: string }) {
  return <div className="card" style={{ padding: 16, gap: 6 }}><strong>{title}</strong><span className="small" style={{ color: "var(--ink-2)" }}>{body}</span></div>;
}
function Arrow() {
  return <div aria-hidden="true" style={{ textAlign: "center", color: "var(--gold)", fontSize: 20, lineHeight: 1 }}>↓</div>;
}
