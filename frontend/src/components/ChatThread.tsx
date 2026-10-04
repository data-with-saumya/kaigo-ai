import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { relativeDay, time } from "../lib/format";
import type { Message } from "../lib/types";
import { IconSpark } from "./Icons";
import { ErrorNotice, Spinner } from "./ui";

const KIND_LABEL: Record<Message["kind"], string> = {
  text: "", acknowledgement: "Kaigo · automatic reply", confirmation: "Kaigo · booking confirmed",
  handover: "Handover note · drafted by Gemini", notice: "Kaigo · update",
};

/** One caregiver ↔ agency thread. `viewer` decides which side is "mine". */
export function ChatThread({ messages, viewer, linkEvents, names }: {
  messages: Message[]; viewer: "caregiver" | "coordinator"; linkEvents?: boolean; names?: { caregiver: string };
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  if (!messages.length) return <p className="muted small">No messages yet.</p>;
  return (
    <div className="chat" role="log" aria-live="polite">
      {messages.map((m) => {
        const mine = m.sender === viewer;
        const cls = m.sender === "kaigo" ? `kaigo${m.kind === "handover" ? " handover" : ""}` : mine ? "mine" : "theirs";
        const who = m.sender === "kaigo" ? KIND_LABEL[m.kind] || "Kaigo"
          : m.sender === "coordinator" ? "Care coordinator" : names?.caregiver ?? "Caregiver";
        return (
          <div key={m.id} className={`bubble ${cls}`}>
            {m.sender === "kaigo" && m.kind === "handover" && <span className="chip ai" style={{ marginBottom: 6 }}><IconSpark size={12} />Handover note</span>}
            <div>{m.text}</div>
            <div className="meta">
              <span>{mine ? "You" : who}</span><span>·</span><span>{relativeDay(m.at)} {time(m.at)}</span>
              {linkEvents && m.event_id && m.sender === "caregiver" && (
                <Link to={`/continuity/${m.event_id}`} style={{ fontWeight: 600 }}>Kaigo opened a replan →</Link>
              )}
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

export function Composer({ onSend, placeholder, quickReplies = [] }: {
  onSend: (text: string) => Promise<unknown>; placeholder: string; quickReplies?: string[];
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const send = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(value.trim());
      setText("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };
  return (
    <div className="stack-sm">
      {quickReplies.length > 0 && (
        <div className="inline" style={{ flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2 }} aria-label="Quick replies">
          {quickReplies.map((q) => (
            <button key={q} type="button" className="btn quiet small" style={{ flex: "none" }} disabled={busy} onClick={() => send(q)}>{q}</button>
          ))}</div>
      )}
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="compose">Message</label>
        <textarea id="compose" className="input" rows={1} value={text} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
      {busy && <Spinner label="Sending…" />}
      <ErrorNotice error={error} />
    </div>
  );
}
