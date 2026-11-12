"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { adminKey as readKey, api, fmt, pct } from "@/lib/client";
import { Timeline } from "@/components/Timeline";
import { LiveCaptions } from "@/components/LiveCaptions";

interface Info { code: string; title: string; course: string; started_at: number; ended_at: number | null }
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

  useEffect(() => {
    setKey(readKey(code));
    setOrigin(window.location.origin);
    api<Info>(`/api/sessions/${code}`).then(setInfo).catch((e) => setMsg(e.message));
  }, [code]);

  const poll = useCallback(async () => {
    if (!key) return;
    try { setLive(await api<Live>(`/api/sessions/${code}/live`, { key })); } catch (e) { setMsg((e as Error).message); }
  }, [code, key]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  async function endAndAnalyze() {
    if (!key) return;
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
    if (!key) return;
    const captions = await file.text();
    try {
      const r = await api<{ segments: number }>(`/api/sessions/${code}/transcript`, { body: { captions }, key });
      setMsg(`Loaded ${r.segments} caption lines from ${file.name}.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (key === null && info) {
    return (
      <main className="wrap narrow stack">
        <h1>Professor key needed</h1>
        <p className="muted">Open this page from the browser where you started the lecture, or use the link with <code>#k=…</code>.</p>
      </main>
    );
  }
  if (!info) return <main className="wrap muted">{msg || "Loading…"}</main>;

  const joinUrl = `${origin}/s/${code}`;
  return (
    <main className="wrap stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="brand" href="/">Lost <span>&amp;</span> Found</Link>
        <span className="small muted">Professor console · only you can see this</span>
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

      <div className="grid2">
        <section className="card row" style={{ alignItems: "center", gap: 20 }}>
          {origin && <img className="qr" src={`/api/sessions/${code}/qr?origin=${encodeURIComponent(origin)}`} alt={`QR code for ${joinUrl}`} />}
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="stat-label">Students join at</div>
            <div className="small mono" style={{ wordBreak: "break-all" }}>{joinUrl}</div>
            <div className="code-big mono">{code}</div>
          </div>
        </section>
        <section className="card">
          <div className="row" style={{ gap: 28 }}>
            <div><div className="stat">{live?.students ?? 0}</div><div className="stat-label">joined</div></div>
            <div><div className="stat">{live?.total_taps ?? 0}</div><div className="stat-label">taps</div></div>
            <div><div className="stat">{live?.questions ?? 0}</div><div className="stat-label">questions</div></div>
            <div><div className="stat mono">{fmt(live?.now_ms ?? 0)}</div><div className="stat-label">elapsed</div></div>
          </div>
        </section>
      </div>

      <section className="card stack">
        <h2>Confusion, live</h2>
        {live ? (
          <Timeline bins={live.bins} binMs={15_000} durationMs={live.now_ms} />
        ) : (
          <p className="muted">Waiting for taps…</p>
        )}
        <p className="small muted">Bars show the share of students who tapped in each 15-second window. Orange means 15% or more.</p>
      </section>

      <section className="card stack">
        <h2>Transcript</h2>
        {key && <LiveCaptions code={code} adminKey={key} disabled={!!info.ended_at} />}
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
