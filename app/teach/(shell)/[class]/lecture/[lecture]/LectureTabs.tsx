"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { ConfusionCurve, PlayButton, PlayerProvider, SeekLink, TimeReadout, TranscriptList } from "@/components/Player";
import { fmtClock, fmtDay, pct } from "@/lib/format";
import { addClarification, attachLink, dismissHotspot, publishHotspot, removeLecture, reprocessLecture, saveDraft, unpublishHotspot } from "@/app/actions";
import type { staffLecture } from "@/lib/views";

type V = NonNullable<Awaited<ReturnType<typeof staffLecture>>>;
type H = V["hotspots"][number];

export default function LectureTabs({ v, tab, start, base }: { v: V; tab: string; start: number; base: string }) {
  const real = v.hotspots.filter((h) => h.students > 0);
  return (
    <PlayerProvider code={v.lecture.code} duration={v.lecture.duration_ms} start={start}>
      {v.lecture.status === "processing" ? (
        <Processing code={v.lecture.code} />
      ) : tab === "insights" ? (
        <Insights v={v} hotspots={real} base={base} />
      ) : tab === "recording" ? (
        <Recording v={v} hotspots={real} />
      ) : (
        <Clarifications v={v} />
      )}
    </PlayerProvider>
  );
}

function Processing({ code }: { code: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>Finding where the class got lost…</h3>
      <p className="muted" style={{ marginTop: 6 }}>Hotspots and draft clarifications are ready within a few minutes of the lecture ending. Refresh to check.</p>
      <button className="btn sm ghost" style={{ marginTop: 14 }} disabled={pending} onClick={() => start(() => reprocessLecture(code))}>{pending ? "Working…" : "Run it now"}</button>
    </div>
  );
}

function Insights({ v, hotspots, base }: { v: V; hotspots: H[]; base: string }) {
  const ins = v.insights!;
  const drafts = hotspots.filter((h) => h.status !== "dismissed");
  const dismissed = hotspots.filter((h) => h.status === "dismissed");
  const [pending, start] = useTransition();
  return (
    <>
      {ins.warning && <p className="notice warn" style={{ marginTop: 18 }}>{ins.warning}</p>}
      <div className="grid4" style={{ marginTop: 22 }}>
        <Stat label="Lost taps" value={String(ins.stats.lost_taps)} />
        <Stat label="Students lost at least once" value={pct(ins.stats.lost_share)} />
        <Stat label="Resolved by the tutor" value={ins.stats.resolved_share == null ? "–" : pct(ins.stats.resolved_share)} />
        <Stat label="Hotspots" value={String(hotspots.length)} />
      </div>
      <div className="card" style={{ marginTop: 18, padding: 22 }}>
        <div className="between">
          <h3>Where students were lost</h3>
          <span className="small muted">Students per 30 seconds</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <ConfusionCurve buckets={ins.buckets} duration={v.lecture.duration_ms} peaks={hotspots.map((h) => ({ start_ms: h.start_ms, end_ms: h.end_ms, students: h.students }))} height={150} playhead={false} />
        </div>
      </div>
      <div className="stack-lg" style={{ marginTop: 18 }}>
        {drafts.map((h, i) => (
          <HotspotCard key={h.id} h={h} n={i + 1} base={base} defaultOpen={i === 0 || h.status === "draft"} />
        ))}
        {!hotspots.length && <p className="card muted">No hotspots: no part of this lecture lost at least 3 students (or 10% of those who joined).</p>}
      </div>
      {dismissed.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary className="small muted" style={{ cursor: "pointer" }}>{dismissed.length} dismissed</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {dismissed.map((h) => (
              <div key={h.id} className="card tight between">
                <span>{h.concept} <span className="muted">{fmtClock(h.start_ms)} – {fmtClock(h.end_ms)}</span></span>
                <button className="linkbtn small" onClick={() => start(() => dismissHotspot(h.id, false))} disabled={pending}>Restore</button>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="row small" style={{ marginTop: 34, gap: 18 }}>
        <button className="linkbtn small" disabled={pending} onClick={() => start(() => reprocessLecture(v.lecture.code))}>{pending ? "Working…" : "Re-run the analysis"}</button>
        <button className="linkbtn danger small" onClick={() => confirm("Delete this lecture, its recording, transcript and every student's chats from it? This can't be undone.") && start(() => removeLecture(v.lecture.code))}>
          Delete lecture
        </button>
      </div>
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="card stat">
    <p className="label">{label}</p>
    <p className="value">{value}</p>
  </div>
);

function HotspotCard({ h, n, base, defaultOpen }: { h: H; n: number; base: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState(h.status === "published" ? h.published : h.draft);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState(h.link_url);
  const [linkTitle, setLinkTitle] = useState(h.link_title);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="card" style={{ padding: 24, scrollMarginTop: 20 }} id={`h${h.id}`}>
      <button className="between" style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3 style={{ fontSize: "1.15rem" }}>
          {n} · {h.concept} <span className="muted" style={{ fontWeight: 500 }}>{fmtClock(h.start_ms)} – {fmtClock(h.end_ms)}</span>
          {h.status === "published" && <span className="tag ok" style={{ marginLeft: 10, verticalAlign: "middle" }}>Published</span>}
        </h3>
        <span className="violet bold small nowrap">{h.students} students · {pct(h.share)} of class</span>
      </button>
      {open && (
        <>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div>
              <p className="small muted bold">What you were saying</p>
              <p style={{ marginTop: 6, lineHeight: 1.6 }}>{h.excerpt ? `"…${h.excerpt}…"` : <span className="muted">No transcript here.</span>}</p>
              <Link href={`${base}?tab=recording&t=${h.start_ms}`} className="small" style={{ textDecoration: "underline", display: "inline-block", marginTop: 6 }}>
                Play from {fmtClock(h.start_ms)}
              </Link>
            </div>
            <div>
              <p className="small muted bold">What students asked the tutor</p>
              {h.questions.length ? (
                <ul style={{ marginTop: 6, paddingLeft: 20, lineHeight: 1.7 }}>
                  {h.questions.map((q, i) => (
                    <li key={i}>{q.text}{q.count > 1 ? ` (${q.count})` : ""}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small" style={{ marginTop: 6 }}>Students read the tutor&apos;s answer without typing a question.</p>
              )}
            </div>
          </div>
          <label className="field" style={{ marginTop: 18 }}>
            <span className="small muted">{h.status === "published" ? "Published clarification · edit and publish again to update it" : "Draft clarification for the class · edit before publishing"}</span>
            <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => h.status === "draft" && text !== h.draft && start(() => saveDraft(h.id, text))} placeholder="Write 2-3 plain sentences that clear this up for the class." />
          </label>
          {h.link_url && !linkOpen && (
            <p className="hl small bold" style={{ marginTop: 10 }}>▶ {h.link_title || h.link_url}</p>
          )}
          {linkOpen && (
            <div className="row" style={{ marginTop: 12 }}>
              <input className="input grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (video or page)" />
              <input className="input grow" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Title, e.g. Base cases, step by step · 3 min" />
              <button className="btn sm" disabled={pending} onClick={() => start(async () => { const r = await attachLink(h.id, url, linkTitle); setErr(r.error ?? ""); if (!r.error) setLinkOpen(false); })}>Save link</button>
            </div>
          )}
          {err && <p className="error" style={{ marginTop: 8 }}>{err}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await publishHotspot(h.id, text); setErr(r.error ?? ""); })}>
              {h.status === "published" ? "Update for class" : "Publish to class"}
            </button>
            <button className="btn ghost" onClick={() => setLinkOpen(!linkOpen)}>{h.link_url ? "Change link or video" : "Attach link or video"}</button>
            {h.status === "published" ? (
              <button className="btn text" disabled={pending} onClick={() => start(() => unpublishHotspot(h.id))}>Unpublish</button>
            ) : (
              <button className="btn text" disabled={pending} onClick={() => start(() => dismissHotspot(h.id))}>Dismiss</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Recording({ v, hotspots }: { v: V; hotspots: H[] }) {
  return (
    <>
      <div className="card dark" style={{ marginTop: 22, padding: 24 }}>
        <div className="between">
          <div className="row" style={{ gap: 18 }}>
            <PlayButton big light />
            <TimeReadout light />
          </div>
          <span className="small" style={{ color: "#cfcaf5" }}>1× speed</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <ConfusionCurve buckets={v.insights?.buckets ?? []} duration={v.lecture.duration_ms} dark height={60} showAxis={false} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 270px", gap: 20, marginTop: 20 }} className="live-grid">
        <div className="card" style={{ padding: 24 }}>
          <div className="between">
            <h3>Transcript</h3>
            <span className="small muted">Click a line to jump there</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <TranscriptList lines={v.transcript} hot={hotspots.map((h) => ({ start_ms: h.start_ms, end_ms: h.end_ms, label: `${h.students} students lost` }))} />
          </div>
        </div>
        <div className="card" style={{ padding: 24, alignSelf: "start" }}>
          <h3>Jump to a hotspot</h3>
          <div className="stack" style={{ marginTop: 14 }}>
            {[...hotspots].sort((a, b) => b.students - a.students).map((h) => (
              <div key={h.id} className="between">
                <SeekLink ms={h.start_ms}>{h.concept} · {fmtClock(h.start_ms)}</SeekLink>
                <span className="bold">{h.students}</span>
              </div>
            ))}
            {!hotspots.length && <p className="small muted">No hotspots.</p>}
          </div>
          <p className="small muted" style={{ marginTop: 18 }}>
            No audio is saved by Lost and Found; the class recording stays on Panopto. The transcript stays here.
          </p>
        </div>
      </div>
    </>
  );
}

function Clarifications({ v }: { v: V }) {
  const items = v.hotspots.filter((h) => h.status !== "dismissed" && (h.status === "published" || h.draft.trim()));
  const published = items.filter((h) => h.status === "published");
  const drafts = items.filter((h) => h.status === "draft");
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addClarification.bind(null, v.lecture.code), {});
  const [busy, start] = useTransition();
  return (
    <>
      <div className="between" style={{ marginTop: 20 }}>
        <p className="muted">What your class sees for this lecture. {published.length} published, {drafts.length} draft{drafts.length === 1 ? "" : "s"}.</p>
        <button className="btn" onClick={() => setAdding(!adding)}>Add a clarification</button>
      </div>
      {adding && (
        <form action={action} className="card stack" style={{ marginTop: 16, padding: 24 }}>
          <div className="row">
            <input className="input grow" name="concept" placeholder="Topic, e.g. Base cases" />
            <input className="input" name="at" placeholder="mm:ss" style={{ width: 110 }} />
          </div>
          <textarea className="input" name="text" placeholder="What should the class know?" required />
          <div className="row">
            <input className="input grow" name="link_url" placeholder="Optional link or video: https://…" />
            <input className="input grow" name="link_title" placeholder="Link title" />
          </div>
          {state?.error && <p className="error">{state.error}</p>}
          <button className="btn" disabled={pending}>Publish to class</button>
        </form>
      )}
      <div className="stack-lg" style={{ marginTop: 18 }}>
        {[...published, ...drafts].map((h) =>
          h.status === "published" ? (
            <div key={h.id} className="card" style={{ padding: 24 }}>
              <div className="between">
                <h3>{h.concept} <span className="muted" style={{ fontWeight: 500 }}>{fmtClock(h.start_ms)}{h.end_ms > h.start_ms ? ` – ${fmtClock(h.end_ms)}` : ""}{h.students ? ` · ${h.students} students lost` : ""}</span></h3>
                <span className="tag ok">Published {h.published_at ? fmtDay(h.published_at) : ""}</span>
              </div>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>{h.published}</p>
              {h.link_url && <a className="hl small bold" href={h.link_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12 }}>▶ {h.link_title || h.link_url}</a>}
              <div className="grid3" style={{ marginTop: 16 }}>
                <div><p className="small muted">Opened by</p><p className="bold" style={{ fontSize: "1.4rem" }}>{pct(h.stats.opened_share)} of class</p></div>
                {h.students > 0 && <div><p className="small muted">Of students lost here</p><p className="bold" style={{ fontSize: "1.4rem" }}>{h.stats.opened_lost} of {h.stats.lost} opened</p></div>}
                {h.students > 0 && <div><p className="small muted">Marked &quot;Got it&quot; after</p><p className="bold" style={{ fontSize: "1.4rem" }}>{h.stats.got_it} of {h.stats.opened_lost}</p></div>}
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn ghost sm" href={`?#h${h.id}`}>Edit</Link>
                <button className="btn text sm" disabled={busy} onClick={() => start(() => unpublishHotspot(h.id))}>Unpublish</button>
              </div>
            </div>
          ) : (
            <div key={h.id} className="card dashed" style={{ padding: 24 }}>
              <div className="between">
                <h3>{h.concept} <span className="muted" style={{ fontWeight: 500 }}>{fmtClock(h.start_ms)} – {fmtClock(h.end_ms)} · {h.students} students lost</span></h3>
                <span className="tag draft">Draft · not visible to students</span>
              </div>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>{h.draft}</p>
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn" href={`?#h${h.id}`}>Review and publish</Link>
                <button className="btn text" disabled={busy} onClick={() => start(() => dismissHotspot(h.id))}>Dismiss</button>
              </div>
            </div>
          ),
        )}
        {!items.length && <p className="card muted">Nothing yet. Drafts appear here when the lecture has hotspots; you can also add your own.</p>}
      </div>
    </>
  );
}
