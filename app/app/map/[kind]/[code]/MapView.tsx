"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtClock } from "@/lib/format";
import type { MapNode } from "@/lib/views";

export default function MapView({ nodes }: { nodes: MapNode[] }) {
  const [sel, setSel] = useState<MapNode | null>(null);
  const kids = (id: string | null) => nodes.filter((n) => n.parent === id);
  const roots = kids(null);
  if (!nodes.length) return <p className="notice dark" style={{ marginTop: 24 }}>The map is built when a lecture ends. Check back after class.</p>;

  const render = (n: MapNode) => {
    const children = kids(n.id);
    const cls = n.kind === "root" ? "root" : n.kind === "lecture" ? "lecture" : n.share > 0 ? "hot" : "taught";
    return (
      <div className="map-item" key={n.id}>
        <button className={`map-node ${cls}`} onClick={() => setSel(n)}>
          {n.name}
          {n.share >= 0.01 && <span className="lost"> · {Math.round(n.share * 100)}% lost</span>}
        </button>
        {n.questions.map((q) => (
          <Link key={q.event_id} className="map-q small" href={`/app/moments/${q.event_id}`}>
            <b>You asked{q.fuzzy ? " · still fuzzy" : ""}</b>
            {q.text}
          </Link>
        ))}
        {children.length > 0 && <div className="map-children">{children.map(render)}</div>}
      </div>
    );
  };

  return (
    <>
      <div className="map" style={{ marginTop: 10 }}>{roots.map(render)}</div>
      <p className="notice dark" style={{ marginTop: 28 }}>Tap a topic for its TLDR, the recording and your chat</p>
      {sel && (
        <>
          <div className="sheet-back" onClick={() => setSel(null)} />
          <div className="sheet" style={{ height: "auto", maxHeight: "75dvh" }} role="dialog" aria-label={sel.name}>
            <button className="grab" onClick={() => setSel(null)} aria-label="Close" />
            <div className="sheet-body" style={{ paddingBottom: 28 }}>
              <p className="small" style={{ color: "var(--gold)", fontWeight: 700 }}>{sel.kind === "concept" ? `From ${fmtClock(sel.t_ms)}` : "Lecture"}</p>
              <h2 style={{ marginTop: 4 }}>{sel.name}</h2>
              {sel.tldr && <p className="tldr-body" style={{ marginTop: 10 }}>{sel.tldr}</p>}
              <div className="row" style={{ marginTop: 18 }}>
                <Link className="btn gold sm" href={`/app/lecture/${sel.lecture}?t=${sel.t_ms}`}>Play the recording</Link>
                {sel.questions[0] && <Link className="btn outline-light sm" href={`/app/moments/${sel.questions[0].event_id}`}>Your chat</Link>}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
