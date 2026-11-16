"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { adminKey as readKey, api, fmt, pct } from "@/lib/client";
import { Timeline } from "@/components/Timeline";
import { LiveCaptions } from "@/components/LiveCaptions";

interface Info { code: string; title: string; course: string; started_at: number; ended_at: number | null; class_code?: string | null }
interface Live {
  now_ms: number;
  students: number;
  active_now: number;
  lost_last_minute: number;
  lost_share_last_minute: number;
  alert: boolean;
  total_taps: number;
  questions: number;
  bins: { start_ms: number; devices: number; rate: number }[];
}

export default function ProfConsole({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [origin, setOrigin] = useState("");
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setKey(readKey(code));
    setOrigin(window.location.origin);
    api<Info>(`/api/sessions/${code}`).then(setInfo).catch((e) => setMsg(e.message));
  }, [code]);

  // Works with the lecture's key link OR by being signed in as the class's instructor/TA.
  const poll = useCallback(async () => {
    try {
      setLive(await api<Live>(`/api/sessions/${code}/live`, { key }));
      setDenied(false);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 403) setDenied(true);
      else setMsg(err.message);
    }
  }, [code, key]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  async function endAndAnalyze() {
    setBusy("Ending lecture…");
    try {
      if (!info?.ended_at) await api(`/api/sessions/${code}/end`, { body: {}, key });
      setInfo((i) => (i ? { ...i, ended_at: Date.now() } : i));
      setBusy("Analyzing — lining up taps with the transcript…");
      await api(`/api/sessions/${code}/analyze`, { body: {}, key });
      router.push(`/prof/${code}/report`);
    } catch (e) {
      setMsg((e as Error).message);
      setBusy("");
    }
  }

  async function upload(file: File) {
    const captions = await file.text();
    try {
      const r = await api<{ segments: number }>(`/api/sessions/${code}/transcript`, { body: { captions }, key });
      setMsg(`Loaded ${r.segments} caption lines from ${file.name}.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (denied && info) {
    return (
      <main className="wrap narrow stack">
        <h1>Instructors only</h1>
        <p className="muted">
          Sign in with the UW account that teaches this class, or open the lecture&apos;s professor link (the one with <code>#k=…</code>).
        </p>
        <Link className="btn" href={`/login?next=${encodeURIComponent(`/prof/${code}`)}`}>Sign in</Link>
      </main>
    );
  }
  if (!info) return <main className="wrap muted">{msg || "Loading…"}</main>;

  const joinUrl = `${origin}/s/${code}`;
  return (
    <main className="wrap stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="brand" href="/">Lost <span>&amp;</span> Found</Link>
        <div className="row small">
          {info.class_code && <Link href={`/c/${info.class_code}`}>← Class</Link>}
          <span className="muted">Professor console · only staff can see this</span>
        </div>
      </div>
      <div>
        <div className="small muted">{info.course}</div>
        <h1>{info.title}</h1>
      </div>

      {live?.alert && !info.ended_at && (
        <div className="banner alert">
          {live.lost_last_minute} students ({pct(live.lost_share_last_minute)}) signalled confusion in the last minute.
        </div>
      )}
      {msg && <div className="banner">{msg}</div>}

      {/* Phone: stacked. Tablet/desktop/projector: big QR on the left, live stats + chart on the right. */}
      <div className="console-grid">
        <section className="card join-card">
          {origin && <img className="qr" src={`/api/sessions/${code}/qr?origin=${encodeURIComponent(origin)}`} alt={`QR code for ${joinUrl}`} />}
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="stat-label">Students join at</div>
            <div className="small mono" style={{ wordBreak: "break-all" }}>{joinUrl}</div>
            <div className="code-big mono">{code}</div>
          </div>
        </section>
        <div className="stack console-main">
          <section className="card stats-card">
            <div className="stats">
              <div><div className="stat">{live?.students ?? 0}</div><div className="stat-label">joined</div></div>
              <div><div className="stat">{live?.total_taps ?? 0}</div><div className="stat-label">taps</div></div>
              <div><div className="stat">{live?.questions ?? 0}</div><div className="stat-label">questions</div></div>
              <div><div className="stat mono">{fmt(live?.now_ms ?? 0)}</div><div className="stat-label">elapsed</div></div>
            </div>
          </section>

          <section className="card stack">
            <h2>Confusion, live</h2>
            {live ? (
              <Timeline bins={live.bins} binMs={15_000} durationMs={live.now_ms} />
            ) : (
              <p className="muted">Waiting for taps…</p>
            )}
            <p className="small muted">Bars show the share of students who tapped in each 15-second window. Orange means 15% or more.</p>
          </section>
        </div>
      </div>

      <section className="card stack">
        <h2>Transcript</h2>
        <LiveCaptions code={code} adminKey={key} disabled={!!info.ended_at} />
        <div>
          <label htmlFor="cap">…or upload captions from the recording (.vtt / .srt, e.g. from Panopto or Zoom)</label>
          <input id="cap" type="file" accept=".vtt,.srt,text/vtt" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </section>

      <div className="row">
        <button className="btn danger" onClick={endAndAnalyze} disabled={!!busy}>
          {busy || (info.ended_at ? "Re-run analysis" : "End lecture & analyze")}
        </button>
        {info.ended_at && <Link className="btn ghost" href={`/prof/${code}/report`}>View report</Link>}
      </div>
    </main>
  );
}
