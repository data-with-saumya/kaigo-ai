import { relativeDay, time } from "../lib/format";
import type { AuditEntry } from "../lib/types";
import { actorLabel, Provenance } from "./ui";

export function AuditList({ entries, compact = false }: { entries: AuditEntry[]; compact?: boolean }) {
  if (!entries.length) return <p className="muted">Nothing recorded yet.</p>;
  return (
    <div role="list">
      {entries.map((e) => (
        <div key={e.id} className="audit-row" role="listitem" style={compact ? { gridTemplateColumns: "56px minmax(0,1fr)" } : undefined}>
          <span className="time" title={relativeDay(e.at)}>{time(e.at)}</span>
          <span><Provenance kind={e.actor_type}>{actorLabel(e.actor_type, e.actor)}</Provenance></span>
          <span style={compact ? { gridColumn: "1 / -1" } : undefined}>{e.summary}</span>
        </div>
      ))}
    </div>
  );
}
