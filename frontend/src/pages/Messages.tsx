import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChatThread, Composer } from "../components/ChatThread";
import { Page } from "../components/Shell";
import { Card, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { initials, relativeDay, time } from "../lib/format";
import { broadcastRefresh, useLive } from "../lib/hooks";

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const threads = useLive(api.threads, [], 4000);
  const selected = params.get("with") ?? threads.data?.find((t) => t.last)?.caregiver_id ?? threads.data?.[0]?.caregiver_id ?? null;
  const messages = useLive(() => (selected ? api.thread(selected) : Promise.resolve([])), [selected], 3000);
  const current = threads.data?.find((t) => t.caregiver_id === selected);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (selected && current?.unread) api.markRead(selected, "coordinator").then(broadcastRefresh).catch(() => {});
  }, [selected, current?.unread]);

  const visible = (threads.data ?? []).filter((t) => showAll || t.last);
  return (
    <Page note="one thread each." eyebrow="Continuity · In-app chat" title="Messages"
      actions={selected && <Link className="btn secondary small" to={`/caregiver/${selected}`} target="_blank" rel="noreferrer">Open {current?.name.split(" ")[0]}’s caregiver app</Link>}>
      <div className="row">
        <Card title="Caregivers" className="grow-1" actions={<button className="link-btn small" onClick={() => setShowAll((v) => !v)}>{showAll ? "Only active" : "Show all"}</button>}>
          {threads.loading && !threads.data && <Spinner label="Loading…" />}
          {visible.length === 0 && <p className="muted small">No conversations yet. Open a caregiver’s app to send the first message.</p>}
          <div className="stack-sm">
            {visible.map((t) => (
              <button key={t.caregiver_id} className={`thread-row${t.caregiver_id === selected ? " active" : ""}`}
                onClick={() => setParams({ with: t.caregiver_id })} aria-current={t.caregiver_id === selected ? "true" : undefined}>
                <span className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>{initials(t.name)}</span>
                <span className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{t.name}</strong>
                  <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.last ? `${t.last.sender === "coordinator" ? "You: " : t.last.sender === "kaigo" ? "KaigoAI: " : ""}${t.last.text}` : t.area}
                  </span>
                </span>
                <span className="stack-sm" style={{ alignItems: "flex-end", gap: 2 }}>
                  {t.last && <span className="small muted">{relativeDay(t.last.at) === "Today" ? time(t.last.at) : relativeDay(t.last.at)}</span>}
                  {t.unread > 0 && <span className="badge alert" style={{ marginLeft: 0 }}>{t.unread}</span>}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={current ? current.name : "Conversation"} className="grow-2"
          actions={<span className="small muted">Messages that report a change open a replan automatically</span>}>
          {selected ? (
            <>
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                <ChatThread messages={messages.data ?? []} viewer="coordinator" linkEvents names={{ caregiver: current?.name ?? "Caregiver" }} />
              </div>
              <Composer placeholder={`Message ${current?.name.split(" ")[0] ?? "caregiver"}…`}
                onSend={async (text) => { await api.sendMessage(selected, text, "coordinator"); await messages.reload(); broadcastRefresh(); }} />
            </>
          ) : <p className="muted">Choose a caregiver.</p>}
        </Card>
      </div>
    </Page>
  );
}
