"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtClock } from "@/lib/format";
import type { myMoments } from "@/lib/views";

type V = Awaited<ReturnType<typeof myMoments>>;

const Status = ({ s }: { s: string }) => (s === "fuzzy" ? <span className="tag fuzzy">Still fuzzy</span> : s === "got_it" ? <span className="tag ok">Got it</span> : null);

export default function MomentsList({ v }: { v: V }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "fuzzy" | "class">("all");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let gs = v.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => (filter !== "fuzzy" || i.status === "fuzzy") && (!needle || i.search.includes(needle))) }))
      .filter((g) => g.items.length);
    if (filter === "class") gs = [...gs].sort((a, b) => a.class_short.localeCompare(b.class_short) || b.started_at - a.started_at);
    return gs;
  }, [v.groups, q, filter]);

  return (
    <>
      <input className="search" type="search" placeholder="Search topics and chats" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search topics and chats" />
      <div className="row" style={{ marginTop: 14 }}>
        <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All {v.total}</button>
        <button className={`chip ${filter === "fuzzy" ? "on" : ""}`} onClick={() => setFilter("fuzzy")}>Still fuzzy {v.fuzzy}</button>
        <button className={`chip ${filter === "class" ? "on" : ""}`} onClick={() => setFilter("class")}>By class</button>
      </div>
      {groups.map((g) => (
        <section key={g.key}>
          <p className="group-label">
            {g.class_short} · Lecture {g.lecture_no} · {g.lecture_title}
          </p>
          <div className="stack">
            {g.items.map((i) => (
              <Link key={i.id} href={`/app/moments/${i.id}`} className="card">
                <div className="between">
                  <span className="timepoint mono">{fmtClock(i.t_ms)}{i.concept ? ` · ${i.concept}` : ""}</span>
                  <Status s={i.status} />
                </div>
                {i.headline ? <p style={{ marginTop: 6, lineHeight: 1.5 }}>{i.headline}</p> : <p className="muted small" style={{ marginTop: 6 }}>No answer yet. Open it to ask the tutor.</p>}
                <div className="between small" style={{ marginTop: 8 }}>
                  <span className="muted">
                    {i.messages} message{i.messages === 1 ? "" : "s"}
                    {i.share_label ? ` · ${i.share_label}` : ""}
                  </span>
                  <span className="violet bold nowrap">Open chat</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && (
        <p className="card muted" style={{ marginTop: 18 }}>
          {v.total ? "Nothing matches." : "When you tap Lost in a lecture, the moment and your chat with the tutor are saved here."}
        </p>
      )}
    </>
  );
}
