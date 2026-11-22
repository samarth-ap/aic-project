"use client";
import Link from "next/link";
import { useState } from "react";
import { ConfusionCurve, PlayButton, PlayerProvider, TranscriptList, usePlayer } from "@/components/Player";
import { fmtClock, fmtShortDate } from "@/lib/format";
import { viewClarification } from "@/app/actions";
import type { studentLecture } from "@/lib/views";

type V = NonNullable<Awaited<ReturnType<typeof studentLecture>>>;

function HotspotCard({ h, moment }: { h: V["hotspots"][number]; moment?: V["moments"][number] }) {
  const p = usePlayer()!;
  const [open, setOpen] = useState(false);
  const [gotIt, setGotIt] = useState(false);
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && h.published) void viewClarification(h.id);
  };
  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={toggle}>
      <div className="between small">
        <span className="timepoint mono">
          {fmtClock(h.start_ms)} – {fmtClock(h.end_ms)} · {h.concept}
        </span>
        <span className="muted nowrap">{h.share_label}</span>
      </div>
      {h.published ? (
        <p style={{ marginTop: 8, fontSize: "1.05rem", lineHeight: 1.5, display: open ? undefined : "-webkit-box", WebkitLineClamp: open ? undefined : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.published}</p>
      ) : (
        <p className="muted small" style={{ marginTop: 8 }}>Your professor hasn&apos;t posted a clarification for this one yet.</p>
      )}
      {open && h.link_url && (
        <a className="hl small bold" href={h.link_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          ▶ {h.link_title || "Video or link from your professor"}
        </a>
      )}
      <div className="between small" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <span className="muted">{h.published ? "From your professor" : ""}</span>
        <span className="row" style={{ gap: 12 }} onClick={(e) => e.stopPropagation()}>
          <button className="linkbtn small" onClick={() => p.seek(h.start_ms)}>Play from {fmtClock(h.start_ms)}</button>
          {moment && (
            <Link href={`/app/moments/${moment.id}`} className="gold bold">
              You were lost here · view chat
            </Link>
          )}
        </span>
      </div>
      {open && h.published && (
        <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
          {gotIt ? (
            <span className="tag ok">Got it</span>
          ) : (
            <button className="btn sm ghost" onClick={() => { setGotIt(true); void viewClarification(h.id, true); }}>This cleared it up</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LectureReplay({ v, start }: { v: V; start: number }) {
  const [showTranscript, setShowTranscript] = useState(start > 0);
  return (
    <PlayerProvider code={v.lecture.code} duration={v.lecture.duration_ms} start={start}>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
          <PlayButton />
          <div>
            <h3>Where the class got lost</h3>
            <p className="small muted">Tap a peak to jump there</p>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <ConfusionCurve buckets={v.buckets} duration={v.lecture.duration_ms} mine={v.moments.map((m) => m.t_ms)} height={90} />
        </div>
        <div className="row small" style={{ marginTop: 12, gap: 16 }}>
          <span className="legend"><span style={{ width: 18, height: 11, borderRadius: 3, background: "rgba(100,87,230,0.22)", border: "1.5px solid var(--violet)" }} />Class</span>
          <span className="legend"><span className="dot" style={{ background: "var(--gold)" }} />Your moments</span>
        </div>
        <NoAudioNote deleteOn={v.lecture.audio_delete_on} />
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        {v.hotspots.map((h) => (
          <HotspotCard key={h.id} h={h} moment={v.moments.find((m) => m.hotspot_id === h.id)} />
        ))}
        {!v.hotspots.length && v.lecture.status === "ready" && <p className="card muted">No hotspots in this lecture: the class stayed with it.</p>}
      </div>

      {v.moments.some((m) => !m.hotspot_id) && (
        <>
          <p className="group-label">Your other Lost moments</p>
          <div className="stack">
            {v.moments
              .filter((m) => !m.hotspot_id)
              .map((m) => (
                <Link key={m.id} href={`/app/moments/${m.id}`} className="card tight">
                  <span className="timepoint mono">{fmtClock(m.t_ms)}{m.concept ? ` · ${m.concept}` : ""}</span>
                  {m.headline && <p className="small" style={{ marginTop: 4 }}>{m.headline}</p>}
                </Link>
              ))}
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="between">
          <h3>Transcript</h3>
          <button className="linkbtn small" onClick={() => setShowTranscript((s) => !s)}>{showTranscript ? "Hide" : "Show"}</button>
        </div>
        {showTranscript && (
          <div style={{ marginTop: 10 }}>
            <p className="tiny muted" style={{ marginBottom: 6 }}>Tap a line to play from there.</p>
            <TranscriptList lines={v.transcript} hot={v.hotspots.map((h) => ({ start_ms: h.start_ms, end_ms: h.end_ms, label: h.concept }))} />
          </div>
        )}
      </div>
    </PlayerProvider>
  );
}

function NoAudioNote({ deleteOn }: { deleteOn: number | null }) {
  const p = usePlayer()!;
  if (p.hasAudio === false) return <p className="tiny muted" style={{ marginTop: 10 }}>No recording kept for this lecture. The transcript stays.</p>;
  if (deleteOn) return <p className="tiny muted" style={{ marginTop: 10 }}>Audio is kept until {fmtShortDate(deleteOn)}, then deleted. The transcript stays.</p>;
  return null;
}
