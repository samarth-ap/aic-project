"use client";
// Lecture replay: the recording (if it's still kept), a playhead shared by the
// confusion curve, the transcript and any "Play from 21:30" link on the page.
// The recording can be several runs (if the professor's page reloaded mid-lecture);
// each run starts at its own lecture time, so seeking picks the right one.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fmtAxis, fmtClock } from "@/lib/format";
import { IconPause, IconPlay } from "./icons";

interface Run {
  run_id: string;
  run_start_ms: number;
}
interface Ctx {
  t: number;
  playing: boolean;
  hasAudio: boolean | null;
  seek: (ms: number, play?: boolean) => void;
  toggle: () => void;
  duration: number;
}
const PlayerCtx = createContext<Ctx | null>(null);
export const usePlayer = () => useContext(PlayerCtx);

export function PlayerProvider({ code, duration, start = 0, children }: { code: string; duration: number; start?: number; children: React.ReactNode }) {
  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const loaded = useRef<{ run: string; url: string } | null>(null);
  const tRef = useRef(start);
  tRef.current = t;

  useEffect(() => {
    let live = true;
    fetch(`/api/lectures/${code}/audio`)
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => live && setRuns(d.runs ?? []))
      .catch(() => live && setRuns([]));
    return () => {
      live = false;
      audio.current?.pause();
      if (loaded.current) URL.revokeObjectURL(loaded.current.url);
    };
  }, [code]);

  const runFor = useCallback(
    (ms: number) => {
      if (!runs?.length) return null;
      let r = runs[0];
      for (const x of runs) if (x.run_start_ms <= ms) r = x;
      return r;
    },
    [runs],
  );

  const playAt = useCallback(
    async (ms: number) => {
      const r = runFor(ms);
      if (!r) return false;
      if (!audio.current) {
        audio.current = new Audio();
        audio.current.ontimeupdate = () => {
          const cur = loaded.current && runs?.find((x) => x.run_id === loaded.current!.run);
          if (cur && Number.isFinite(audio.current!.currentTime)) setT(cur.run_start_ms + audio.current!.currentTime * 1000);
        };
        audio.current.onended = () => {
          const i = runs!.findIndex((x) => x.run_id === loaded.current?.run);
          const next = runs![i + 1];
          if (next) void playAt(next.run_start_ms);
          else setPlaying(false);
        };
      }
      const a = audio.current;
      if (loaded.current?.run !== r.run_id) {
        const blob = await fetch(`/api/lectures/${code}/audio/${r.run_id}`).then((x) => x.blob());
        if (loaded.current) URL.revokeObjectURL(loaded.current.url);
        loaded.current = { run: r.run_id, url: URL.createObjectURL(blob) };
        a.src = loaded.current.url;
        await new Promise<void>((res) => {
          a.onloadedmetadata = () => res();
          a.onerror = () => res();
        });
        // Recordings made in the browser don't store their length; asking for the end makes the browser work it out, so seeking works.
        if (a.duration === Infinity) {
          await new Promise<void>((res) => {
            a.ondurationchange = () => {
              if (a.duration !== Infinity) res();
            };
            a.currentTime = 1e101;
            setTimeout(res, 1500);
          });
        }
      }
      a.currentTime = Math.max(0, (ms - r.run_start_ms) / 1000);
      await a.play().catch(() => {});
      setPlaying(true);
      return true;
    },
    [code, runFor, runs],
  );

  const seek = useCallback(
    (ms: number, play = true) => {
      const v = Math.max(0, Math.min(duration, ms));
      setT(v);
      if (play && runs?.length) void playAt(v);
      else if (audio.current && loaded.current) {
        const r = runFor(v);
        if (r?.run_id === loaded.current.run) audio.current.currentTime = (v - r.run_start_ms) / 1000;
      }
    },
    [duration, playAt, runFor, runs],
  );

  const toggle = useCallback(() => {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
    } else void playAt(tRef.current);
  }, [playing, playAt]);

  const value = useMemo(() => ({ t, playing, hasAudio: runs === null ? null : runs.length > 0, seek, toggle, duration }), [t, playing, runs, seek, toggle, duration]);
  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function PlayButton({ big, light }: { big?: boolean; light?: boolean }) {
  const p = usePlayer()!;
  const disabled = p.hasAudio === false;
  return (
    <button
      type="button"
      onClick={p.toggle}
      disabled={disabled}
      aria-label={p.playing ? "Pause recording" : "Play recording"}
      title={disabled ? "No recording kept for this lecture" : undefined}
      style={{
        width: big ? 56 : 50,
        height: big ? 56 : 50,
        borderRadius: "50%",
        border: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        background: light ? "var(--gold)" : "var(--violet)",
        color: light ? "var(--indigo-950)" : "#fff",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {p.playing ? <IconPause /> : <IconPlay />}
    </button>
  );
}

export function SeekLink({ ms, children, className }: { ms: number; children: React.ReactNode; className?: string }) {
  const p = usePlayer();
  return (
    <button type="button" className={`linkbtn ${className ?? ""}`} onClick={() => p?.seek(ms)} style={{ textDecoration: "underline" }}>
      {children}
    </button>
  );
}

export function TimeReadout({ light }: { light?: boolean }) {
  const p = usePlayer()!;
  return (
    <span className="mono" style={{ fontWeight: 700, color: light ? "#fff" : undefined }}>
      {fmtClock(p.t)} <span style={{ opacity: 0.7, fontWeight: 500 }}>/ {fmtClock(p.duration)}</span>
    </span>
  );
}

export function TranscriptList({ lines, hot }: { lines: { start_ms: number; text: string }[]; hot: { start_ms: number; end_ms: number; label: string }[] }) {
  const p = usePlayer()!;
  const current = lines.reduce((i, l, k) => (l.start_ms <= p.t ? k : i), -1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.playing) return;
    ref.current?.querySelector(".now")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current, p.playing]);
  if (!lines.length) return <p className="muted">No transcript was recorded for this lecture.</p>;
  return (
    <div ref={ref} style={{ maxHeight: 520, overflowY: "auto" }}>
      {lines.map((l, i) => {
        const h = hot.find((x) => l.start_ms >= x.start_ms && l.start_ms < x.end_ms && !lines.slice(0, i).some((o) => o.start_ms >= x.start_ms && o.start_ms < x.end_ms));
        return (
          <div
            key={i}
            className={`tline ${h ? "hl" : ""} ${i === current ? "now" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => p.seek(l.start_ms)}
            onKeyDown={(e) => e.key === "Enter" && p.seek(l.start_ms)}
            style={{ margin: h ? "6px 0" : undefined }}
          >
            <b className="mono">{fmtClock(l.start_ms)}</b>
            {h && <b style={{ color: "var(--violet)" }}>· {h.label} </b>}
            {l.text}
          </div>
        );
      })}
    </div>
  );
}

// ---------- the confusion curve ----------

/** Smooths bucket counts (light Gaussian) and draws a monotone curve through them. */
function curvePath(points: [number, number][]): string {
  if (points.length < 2) return "";
  const n = points.length;
  const dx = points.map((p, i) => (i < n - 1 ? points[i + 1][0] - p[0] : 0));
  const slope = points.map((p, i) => (i < n - 1 ? (points[i + 1][1] - p[1]) / dx[i] : 0));
  const m = points.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

export function ConfusionCurve({
  buckets,
  duration,
  height = 120,
  mine = [],
  peaks = [],
  dark,
  showAxis = true,
  playhead = true,
}: {
  buckets: { start_ms: number; students: number }[];
  duration: number;
  height?: number;
  mine?: number[];
  peaks?: { start_ms: number; end_ms: number; students: number }[];
  dark?: boolean;
  showAxis?: boolean;
  playhead?: boolean;
}) {
  const p = usePlayer();
  const W = 1000;
  const top = peaks.length ? 26 : 8;
  const H = height;
  const base = H - 6;
  const dur = Math.max(duration, 1);
  // Gaussian smoothing over ±3 buckets (±90 s) so peaks read like a "most replayed" curve.
  const W7 = [0.05, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05];
  const vals = buckets.map((_, i) => W7.reduce((s, w, j) => s + (buckets[i + j - 3]?.students ?? 0) * w, 0));
  const max = Math.max(1, ...vals, ...peaks.map((x) => x.students * 0.6));
  const pts: [number, number][] = [[0, base], ...buckets.map((b, i): [number, number] => [((b.start_ms + 15_000) / dur) * W, base - (vals[i] / max) * (base - top)]), [W, base]];
  const line = curvePath(pts);
  const fillC = dark ? "rgba(160,150,255,0.45)" : "rgba(100,87,230,0.22)";
  const lineC = dark ? "rgba(190,182,255,0.9)" : "var(--violet)";
  const x = (ms: number) => (Math.min(ms, dur) / dur) * W;
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!p) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ms = ((e.clientX - r.left) / r.width) * dur;
    // Snap to a nearby peak, so "tap a peak to jump there" is forgiving.
    const near = peaks.find((pk) => Math.abs((pk.start_ms + pk.end_ms) / 2 - ms) < dur * 0.04);
    p.seek(near ? near.start_ms : ms);
  };
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H + 10}`}
        preserveAspectRatio="none"
        width="100%"
        height={H + 10}
        onClick={click}
        style={{ cursor: p ? "pointer" : undefined, display: "block", overflow: "visible" }}
        role="img"
        aria-label="Where students tapped Lost across the lecture"
      >
        {peaks.map((pk, i) => (
          <rect key={i} x={x(pk.start_ms)} y={top - 4} width={Math.max(8, x(pk.end_ms) - x(pk.start_ms))} height={base - top + 4} fill={dark ? "rgba(255,255,255,0.06)" : "rgba(100,87,230,0.09)"} />
        ))}
        <path d={`${line} L${W},${base} L0,${base} Z`} fill={fillC} />
        <path d={line} fill="none" stroke={lineC} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={base} y2={base} stroke={lineC} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {p && playhead && p.t > 0 && (
          <>
            <line x1={0} x2={x(p.t)} y1={base} y2={base} stroke="var(--gold)" strokeWidth={4} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* Labels and dots in HTML so they don't stretch with the SVG. */}
      <div style={{ position: "relative", height: 0 }}>
        {peaks.map((pk, i) => (
          <span key={i} className="tiny bold" style={{ position: "absolute", left: `${(x((pk.start_ms + pk.end_ms) / 2) / W) * 100}%`, top: -(H + 10) + 2, transform: "translateX(-50%)", color: dark ? "#fff" : "var(--text)" }}>
            {pk.students}
          </span>
        ))}
        {mine.map((ms, i) => (
          <span
            key={i}
            title={`You tapped Lost at ${fmtClock(ms)}`}
            style={{ position: "absolute", left: `${(x(ms) / W) * 100}%`, top: -22, width: 13, height: 13, borderRadius: "50%", background: "var(--gold)", border: "2px solid #fff", transform: "translateX(-50%)" }}
          />
        ))}
        {p && playhead && p.t > 0 && (
          <span style={{ position: "absolute", left: `${(x(p.t) / W) * 100}%`, top: -21, width: 14, height: 14, borderRadius: "50%", background: "var(--gold)", transform: "translateX(-50%)", boxShadow: "0 0 0 3px rgba(243,179,62,0.3)" }} />
        )}
      </div>
      {showAxis && (
        <div className="between tiny" style={{ marginTop: 8, color: dark ? "#d6d2f6" : "var(--muted)" }}>
          <span>0:00</span>
          <span>{fmtAxis(dur / 2)}</span>
          <span>{fmtAxis(dur)}</span>
        </div>
      )}
    </div>
  );
}
