import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatThread, Composer } from "../components/ChatThread";
import { Logo } from "../components/Brand";
import { ErrorNotice, Notice, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { relativeDay, span } from "../lib/format";
import { broadcastRefresh, useLive } from "../lib/hooks";

const QUICK = ["I can't make my shift tomorrow night", "Running about 15 minutes late", "Can someone call me?"];

/** What a caregiver sees on their phone. In the demo the coordinator opens it to play the caregiver. */
export function CaregiverAppPage() {
  const { id = "" } = useParams();
  const caregivers = useLive(api.caregivers, [], 600000);
  const shifts = useLive(() => api.shifts({ caregiver_id: id }), [id], 6000);
  const messages = useLive(() => api.thread(id), [id], 3000);
  const me = caregivers.data?.find((c) => c.id === id);
  const first = me?.name.split(" ")[0] ?? "";
  const upcoming = (shifts.data ?? []).filter((s) => new Date(s.end) > new Date()).slice(0, 4);

  useEffect(() => {
    if ((messages.data ?? []).some((m) => !m.read_by_caregiver)) api.markRead(id, "caregiver").catch(() => {});
  }, [id, messages.data]);

  return (
    <div className="phone">
      <header className="phone-head">
        <div className="spread" style={{ flexWrap: "nowrap" }}>
          <Logo height={22} tone="dark" />
          <span className="tag rule">Caregiver app · demo view</span>
        </div>
        <div>
          <div className="eyebrow">Signed in as</div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{me?.name ?? "…"}</h1>
        </div>
        <p className="small muted">In the real app caregivers sign in on their phone with a one-time code. <Link to="/messages">Back to coordinator view</Link></p>
      </header>

      <div className="phone-body">
        <section aria-labelledby="my-shifts" className="stack-sm">
          <h2 id="my-shifts" className="eyebrow">My next shifts</h2>
          {shifts.loading && !shifts.data && <Spinner label="Loading…" />}
          {upcoming.length === 0 && shifts.data && <p className="small muted">No upcoming shifts.</p>}
          {upcoming.map((s) => {
            const mine = s.segments.filter((seg) => seg.caregiver_id === id);
            return (
              <div key={s.id} className="card" style={{ padding: "12px 14px", gap: 4 }}>
                <span className="num" style={{ fontSize: 17 }}>{relativeDay(mine[0]?.start ?? s.start)} · {mine.map((seg) => span(seg.start, seg.end)).join(", ")}</span>
                <span className="small" style={{ color: "var(--ink-2)" }}>{s.client_name} · {s.vertical === "hospice" ? "Hospice" : "Home nursing"}</span>
              </div>
            );
          })}
        </section>

        <section aria-labelledby="agency-chat" className="stack-sm" style={{ flex: 1 }}>
          <h2 id="agency-chat" className="eyebrow">Chat with your agency</h2>
          <ErrorNotice error={messages.error} />
          <ChatThread messages={messages.data ?? []} viewer="caregiver" names={{ caregiver: me?.name ?? "" }} />
          {messages.data?.length === 0 && (
            <Notice tone="info">Message your coordinator here. If you can’t make a shift, just say so in your own words; Kaigo tells your coordinator straight away.</Notice>
          )}
        </section>
      </div>

      <footer className="phone-foot">
        <Composer placeholder={`Message your coordinator${first ? `, ${first}` : ""}…`} quickReplies={QUICK}
          onSend={async (text) => { await api.sendMessage(id, text, "caregiver"); await messages.reload(); shifts.reload(); broadcastRefresh(); }} />
      </footer>
    </div>
  );
}
