"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { adminKey as readKey, api, fmt, pct } from "@/lib/client";
import { Timeline } from "@/components/Timeline";
import type { Report } from "@/lib/analysis/report";

type PublicReport = Omit<Report, "private">;

export default function ReportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [r, setR] = useState<PublicReport | null>(null);
  const [err, setErr] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [classCode, setClassCode] = useState<string | null>(null);

  useEffect(() => {
    const k = readKey(code);
    setKey(k);
    // Key link or signed-in instructor/TA.
    api<PublicReport>(`/api/sessions/${code}/report`, { key: k }).then(setR).catch((e) => setErr(e.message));
    api<{ class_code: string | null }>(`/api/sessions/${code}`).then((i) => setClassCode(i.class_code)).catch(() => {});
  }, [code]);

  if (err) return <main className="wrap stack"><h1>No report</h1><p className="muted">{err}</p></main>;
  if (!r) return <main className="wrap muted">Loading report…</main>;

  const binMs = r.timeline.length > 1 ? r.timeline[1].start_ms - r.timeline[0].start_ms : 30_000;
  const concept = (id: string | null) => r.concepts.find((c) => c.id === id);

  return (
    <main className="wrap stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="brand" href="/">Lost <span>&amp;</span> Found</Link>
        <div className="row small">
          {classCode && <Link href={`/c/${classCode}`}>← Class</Link>}
          <Link href={`/prof/${code}`}>Console</Link>
          {!classCode && r.session.course && key && (
            <Link href={`/course?course=${encodeURIComponent(r.session.course)}#k=${key}`}>Quarter view</Link>
          )}
        </div>
      </div>

      <div>
        <div className="small muted">{r.session.course} · post-lecture brief</div>
        <h1>{r.session.title}</h1>
      </div>
      {r.warning && <div className="banner">{r.warning}</div>}

      <section className="card stack stats-card">
        <p style={{ fontSize: "1.15rem", fontWeight: 600 }}>{r.headline}</p>
        <div className="stats">
          <div><div className="stat">{r.stats.active_devices}</div><div className="stat-label">students</div></div>
          <div><div className="stat">{r.stats.total_taps}</div><div className="stat-label">taps</div></div>
          <div><div className="stat">{r.moments.length}</div><div className="stat-label">confusion moments</div></div>
          <div><div className="stat">{r.stats.questions}</div><div className="stat-label">questions to you</div></div>
          {(r.stats.tutor_questions ?? 0) > 0 && (
            <div>
              <div className="stat">{r.stats.tutor_questions}</div>
              <div className="stat-label">asked the AI tutor ({r.stats.tutor_students} students)</div>
            </div>
          )}
        </div>
      </section>

      <AtAGlance r={r} />

      <section className="card stack">
        <h2>Where students got lost</h2>
        <Timeline
          bins={r.timeline}
          binMs={binMs}
          durationMs={r.session.duration_ms}
          moments={r.moments}
          concepts={r.concepts.map((c) => ({ name: c.name, start_ms: c.start_ms }))}
          height={200}
        />
        <p className="small muted">Taps are shifted ~20s earlier to account for reaction time. Shaded bands are the confusion moments below.</p>
      </section>

      {r.moments.map((m, i) => (
        <section key={m.id} className="card stack moment">
          <div className="row small">
            <span className="pill lost">#{i + 1} · {pct(m.share)} of class</span>
            <span className="muted mono">{fmt(m.start_ms)}–{fmt(m.end_ms)}</span>
            <span className="muted">lost {m.kinds.lost} · too fast {m.kinds.too_fast} · example {m.kinds.example}</span>
          </div>
          <h2>{m.concept_name}</h2>
          {m.transcript_quote && <blockquote>“{m.transcript_quote}”</blockquote>}
          {m.why_confusing && <p><strong>Why it likely lost people:</strong> {m.why_confusing}</p>}
          {m.root_cause && (
            <div className="card soft small">
              <strong>Root cause:</strong> probably <em>{m.root_cause.concept_name}</em>
              {concept(m.root_cause.concept_id) && <> (at {fmt(concept(m.root_cause.concept_id)!.start_ms)})</>}. {m.root_cause.reason}
            </div>
          )}
          {m.suggested_fix && <p><strong>Try next time:</strong> {m.suggested_fix}</p>}
          <details>
            <summary>Student catch-up card</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              <h3>{m.catch_up.title}</h3>
              <p>{m.catch_up.explanation}</p>
              <p className="small"><strong>Practice:</strong> {m.catch_up.practice_question}</p>
            </div>
          </details>
        </section>
      ))}

      <div className="grid2">
        <section className="card stack">
          <h2>Open next lecture with</h2>
          <h3>{r.recap_slide.title}</h3>
          <ul style={{ paddingLeft: 20 }}>{r.recap_slide.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </section>
        {r.question_clusters.length > 0 && (
          <section className="card stack">
            <h2>What students asked</h2>
            <p className="small muted">Questions to the AI tutor are private chats, so they appear only as paraphrased themes.</p>
            {r.question_clusters.map((q, i) => (
              <div key={i}>
                <div className="row small">
                  <strong>{q.theme}</strong>
                  <span className="pill">{q.count}</span>
                  {q.source && q.source !== "professor" && (
                    <span className="pill lost">{q.source === "both" ? "you + AI tutor" : "AI tutor"}</span>
                  )}
                </div>
                <div className="muted small">“{q.representative_question}”</div>
              </div>
            ))}
          </section>
        )}
      </div>

      {r.clarification_post && (
        <section className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Clarification post for Canvas / Ed</h2>
            <button className="btn ghost" onClick={() => navigator.clipboard.writeText(r.clarification_post).then(() => setCopied(true))}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{r.clarification_post}</p>
        </section>
      )}

      <section className="card stack">
        <h2>Lecture outline</h2>
        {r.concepts.map((c) => (
          <div key={c.id} className="row small" style={{ alignItems: "baseline" }}>
            <span className="mono muted" style={{ width: 48 }}>{fmt(c.start_ms)}</span>
            <strong>{c.name}</strong>
            {c.confusion > 0 && <span className="pill lost">{pct(c.confusion)} lost</span>}
            <span className="muted" style={{ flexBasis: "100%", paddingLeft: 60 }}>{c.summary}</span>
          </div>
        ))}
      </section>

      <p className="small muted">
        Students see their catch-up cards at <span className="mono">/s/{code}/catchup</span>. Generated {new Date(r.generated_at).toLocaleString()} ({r.mode === "ai" ? "AI analysis" : "offline mode"}).
      </p>
    </main>
  );
}

/** The quick numbers a professor asked for: how many got lost, when, and on what. */
function AtAGlance({ r }: { r: PublicReport }) {
  const active = Math.max(r.stats.active_devices, 1);
  const peaks = [...r.timeline]
    .filter((b) => b.devices > 0)
    .sort((a, b) => b.devices - a.devices || a.start_ms - b.start_ms)
    .slice(0, 3)
    .sort((a, b) => a.start_ms - b.start_ms);
  const binMs = r.timeline.length > 1 ? r.timeline[1].start_ms - r.timeline[0].start_ms : 30_000;
  const topics = [...r.concepts].filter((c) => c.confusion > 0).sort((a, b) => b.confusion - a.confusion).slice(0, 5);
  const maxConf = Math.max(0.0001, ...topics.map((t) => t.confusion));
  return (
    <div className="grid3">
      <section className="card stack">
        <h2>Who clicked &ldquo;lost&rdquo;</h2>
        {r.stats.lost_students != null ? (
          <>
            <div className="stat">
              {r.stats.lost_students} <span className="muted" style={{ fontSize: "1rem", fontWeight: 500 }}>of {r.stats.active_devices}</span>
            </div>
            <div className="lostbar" aria-hidden="true">
              <span style={{ width: pct(r.stats.lost_students / active) }} />
            </div>
            <p className="small muted">
              {pct(r.stats.lost_students / active)} of students tapped &ldquo;I&apos;m lost&rdquo; at least once ({r.stats.lost_taps} taps in total).
            </p>
          </>
        ) : (
          <p className="small muted">Re-run the analysis to see this for older lectures.</p>
        )}
      </section>
      <section className="card stack">
        <h2>When the most got lost</h2>
        {peaks.length ? (
          <ol className="peaks">
            {peaks.map((b) => (
              <li key={b.start_ms}>
                <span className="mono">{fmt(b.start_ms)}–{fmt(b.start_ms + binMs)}</span>
                <span className="muted small">{b.devices} students ({pct(b.rate)})</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small muted">No taps this lecture.</p>
        )}
      </section>
      <section className="card stack">
        <h2>Most confusing topics</h2>
        {topics.length ? (
          topics.map((t) => (
            <div key={t.id}>
              <div className="row small" style={{ justifyContent: "space-between", gap: 8 }}>
                <strong>{t.name}</strong>
                <span className="muted">{pct(t.confusion)}</span>
              </div>
              <div className="topic-bar" style={{ width: `${(t.confusion / maxConf) * 100}%` }} />
            </div>
          ))
        ) : (
          <p className="small muted">No topic passed the confusion threshold.</p>
        )}
      </section>
    </div>
  );
}
