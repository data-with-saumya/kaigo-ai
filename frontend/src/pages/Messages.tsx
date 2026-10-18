import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChatThread, Composer } from "../components/ChatThread";
import { Page } from "../components/Shell";
import { Spinner } from "../components/ui";
import { api } from "../lib/api";
import { broadcastRefresh, useLive } from "../lib/hooks";

/** Messages: pick a caregiver, read, reply. One conversation at a time. */
export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const threads = useLive(api.threads, [], 4000);
  const selected = params.get("with") ?? threads.data?.find((t) => t.last)?.caregiver_id ?? threads.data?.[0]?.caregiver_id ?? null;
  const messages = useLive(() => (selected ? api.thread(selected) : Promise.resolve([])), [selected], 3000);
  const current = threads.data?.find((t) => t.caregiver_id === selected);
  const first = current?.name.split(" ")[0] ?? "caregiver";

  useEffect(() => {
    if (selected && current?.unread) api.markRead(selected, "coordinator").then(broadcastRefresh).catch(() => {});
  }, [selected, current?.unread]);

  const active = (threads.data ?? []).filter((t) => t.last);
  const quiet = (threads.data ?? []).filter((t) => !t.last);
  return (
    <Page title="Messages" lead="If a caregiver says they can’t make a shift, KaigoAI opens a replan for you automatically.">
      <section className="chat-panel">
        <div className="chat-head">
          <label htmlFor="who" className="sr-only">Conversation with</label>
          <select id="who" className="input" value={selected ?? ""} onChange={(e) => setParams({ with: e.target.value })}>
            {active.length > 0 && <optgroup label="Recent">{active.map((t) => <option key={t.caregiver_id} value={t.caregiver_id}>{t.name}{t.unread ? ` (${t.unread} new)` : ""}</option>)}</optgroup>}
            <optgroup label="All caregivers">{quiet.map((t) => <option key={t.caregiver_id} value={t.caregiver_id}>{t.name}</option>)}</optgroup>
          </select>
          {selected && <Link className="small" to={`/caregiver/${selected}`} target="_blank" rel="noreferrer">See {first}’s phone app ↗</Link>}
        </div>
        {threads.loading && !threads.data && <Spinner label="Loading…" />}
        <div className="chat-scroll">
          {selected && <ChatThread messages={messages.data ?? []} viewer="coordinator" linkEvents names={{ caregiver: current?.name ?? "Caregiver" }} />}
        </div>
        {selected && (
          <Composer placeholder={`Message ${first}…`}
            onSend={async (text) => { await api.sendMessage(selected, text, "coordinator"); await messages.reload(); broadcastRefresh(); }} />
        )}
      </section>
    </Page>
  );
}
