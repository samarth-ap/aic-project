"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, pct } from "@/lib/client";
import type { Trend } from "@/lib/analysis/trends";

interface Data {
  course: string;
  lectures: { code: string; title: string; date: number; moments: number; peak_share: number }[];
  topics: Trend[];
}

function Course() {
  const course = useSearchParams().get("course") ?? "";
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const m = window.location.hash.match(/k=([a-f0-9]+)/);
    api<Data>(`/api/courses/trends?course=${encodeURIComponent(course)}`, { key: m?.[1] })
      .then(setD)
      .catch((e) => setErr(e.message));
  }, [course]);

  if (err) return <main className="wrap stack"><h1>Quarter view</h1><p className="muted">{err}</p></main>;
  if (!d) return <main className="wrap muted">Grouping concepts across lectures…</main>;
  const max = Math.max(0.01, ...d.topics.map((t) => t.total_confusion));

  return (
    <main className="wrap stack">
      <Link className="brand" href="/">Lost <span>&amp;</span> Found</Link>
      <div>
        <div className="small muted">Quarter view · {d.lectures.length} analyzed lectures</div>
        <h1>{d.course}: what keeps losing people</h1>
      </div>

      <section className="card stack">
        <h2>Topics ranked by confusion</h2>
        {d.topics.length === 0 && <p className="muted">No analyzed lectures yet.</p>}
        {d.topics.map((t) => (
          <div key={t.topic} className="stack" style={{ gap: 4 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t.topic}</strong>
              <span className="small muted">{t.lectures.length} lecture{t.lectures.length > 1 ? "s" : ""}</span>
            </div>
            <div className="topic-bar" style={{ width: `${Math.max(2, (t.total_confusion / max) * 100)}%`, opacity: t.total_confusion ? 1 : 0.2 }} />
            <div className="small muted">
              {t.lectures.map((l, i) => (
                <span key={i}>{i > 0 && " · "}{l.title}: {l.concept}{l.confusion > 0 ? ` (${pct(l.confusion)})` : ""}</span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>Lectures</h2>
        {d.lectures.map((l) => (
          <div key={l.code} className="row small" style={{ justifyContent: "space-between" }}>
            <Link href={`/prof/${l.code}/report`}>{l.title}</Link>
            <span className="muted">{new Date(l.date).toLocaleDateString()} · {l.moments} moments · peak {pct(l.peak_share)}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function CoursePage() {
  return <Suspense fallback={<main className="wrap muted">Loading…</main>}><Course /></Suspense>;
}
