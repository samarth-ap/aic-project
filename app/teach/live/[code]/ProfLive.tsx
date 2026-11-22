"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { setLiveCount, stopLecture } from "@/app/actions";
import { fmtClock, spacedCode } from "@/lib/format";
import { IconCheck } from "@/components/icons";

interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognizerCtor = new () => Recognizer;

interface Live {
  joined: number;
  enrolled: number;
  lost_2min: number | null;
  transcript_tail: string[];
  transcript_segments: number;
  now_ms: number;
  status: string;
}

export default function ProfLive({ code, classCode, title, sub, nowMs, slides, liveCountOn }: { code: string; classCode: string; title: string; sub: string; nowMs: number; slides: string; liveCountOn: boolean }) {
  const origin = useRef(Date.now() - nowMs);
  const now = useCallback(() => Date.now() - origin.current, []);
  const [, tick] = useState(0);
  const [live, setLive] = useState<Live | null>(null);
  const [countOn, setCountOn] = useState(liveCountOn);
  const [mic, setMic] = useState<"off" | "starting" | "on" | "denied">("off");
  const [micName, setMicName] = useState("");
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState(0);
  const [captions, setCaptions] = useState<"off" | "on" | "unsupported" | "error">("off");
  const [interim, setInterim] = useState("");
  const [slideName, setSlideName] = useState(slides);
  const [stopping, setStopping] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const queue = useRef<{ seq: number; blob: Blob }[]>([]);
  const run = useRef({ id: crypto.randomUUID(), start: 0, seq: 0 });
  const rec = useRef<Recognizer | null>(null);
  const wantCaptions = useRef(false);

  // ---- upload queue: chunks wait here until the server has them (network drops, laptop sleep) ----
  const flush = useCallback(async () => {
    while (queue.current.length) {
      const c = queue.current[0];
      const r = run.current;
      const ok = await fetch(`/api/lectures/${code}/audio?run=${r.id}&start=${Math.round(r.start)}&seq=${c.seq}`, {
        method: "POST",
        headers: { "content-type": c.blob.type || "audio/webm" },
        body: c.blob,
      })
        .then((x) => x.ok)
        .catch(() => false);
      if (!ok) break;
      queue.current.shift();
    }
    setPending(queue.current.length);
  }, [code]);

  const startCaptions = useCallback(() => {
    const Ctor = (window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognizerCtor }).webkitSpeechRecognition;
    if (!Ctor) return setCaptions("unsupported");
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal && text) {
          void fetch(`/api/lectures/${code}/transcript`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => {});
        } else partial += text + " ";
      }
      setInterim(partial.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantCaptions.current = false;
        setCaptions("error");
      }
    };
    // Browsers stop recognition after pauses; restart while the lecture runs.
    r.onend = () => {
      if (wantCaptions.current) setTimeout(() => { try { r.start(); } catch {} }, 250);
    };
    rec.current = r;
    wantCaptions.current = true;
    try {
      r.start();
      setCaptions("on");
    } catch {
      setCaptions("error");
    }
  }, [code]);

  const startMic = useCallback(async () => {
    setMic("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      setMicName(stream.getAudioTracks()[0]?.label?.replace(/\(.*\)/, "").trim() || "Microphone");
      // Level meter
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 70));
        if (recorder.current?.state !== "inactive") requestAnimationFrame(loop);
      };
      // Recorder: ~10 s chunks, low bitrate speech.
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
      run.current = { id: crypto.randomUUID(), start: now(), seq: 0 };
      mr.ondataavailable = (e) => {
        if (!e.data.size) return;
        queue.current.push({ seq: run.current.seq++, blob: e.data });
        setPending(queue.current.length);
        void flush();
      };
      mr.start(10_000);
      recorder.current = mr;
      requestAnimationFrame(loop);
      setMic("on");
      startCaptions();
    } catch {
      setMic("denied");
    }
  }, [flush, now, startCaptions]);

  useEffect(() => {
    void startMic();
    // Keep the laptop awake while recording.
    let lock: { release(): Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    const warn = (e: BeforeUnloadEvent) => {
      if (recorder.current?.state === "recording") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("online", flush);
    const retry = setInterval(flush, 15_000);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", flush);
      clearInterval(retry);
      wantCaptions.current = false;
      rec.current?.stop();
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      void lock?.release();
    };
  }, [startMic, flush]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const d = await fetch(`/api/lectures/${code}/live`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive || !d) return;
      origin.current = Date.now() - d.now_ms;
      setLive(d);
    };
    void poll();
    const p = setInterval(poll, 5000);
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => {
      alive = false;
      clearInterval(p);
      clearInterval(t);
    };
  }, [code]);

  async function stop() {
    if (!confirm("Stop the lecture? Recording ends and students' Lost button closes.")) return;
    setStopping(true);
    wantCaptions.current = false;
    rec.current?.stop();
    const mr = recorder.current;
    if (mr && mr.state !== "inactive") {
      await new Promise<void>((res) => {
        mr.addEventListener("stop", () => res(), { once: true });
        mr.stop();
      });
    }
    mr?.stream.getTracks().forEach((t) => t.stop());
    // Give the last chunk a moment to upload.
    for (let i = 0; i < 20 && queue.current.length; i++) {
      await flush();
      if (queue.current.length) await new Promise((r) => setTimeout(r, 500));
    }
    await stopLecture(code);
  }

  async function uploadSlides(f: File) {
    const fd = new FormData();
    fd.set("file", f);
    const r = await fetch(`/api/lectures/${code}/slides`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setSlideName(d.name);
    else alert(d.error ?? "Couldn't read that file");
  }

  return (
    <main className="prof-live">
      <div className="between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p className="small muted bold">{sub}</p>
          <h1 style={{ marginTop: 4 }}>{title}</h1>
        </div>
        <div className="row" style={{ gap: 18 }}>
          <span className="bold">
            <span className="dot" style={{ marginRight: 8, opacity: mic === "on" ? 1 : 0.4 }} />
            {mic === "on" ? "Recording" : mic === "denied" ? "Microphone blocked" : "Starting…"}
            <span className="muted mono" style={{ marginLeft: 8 }}>{fmtClock(now())}</span>
          </span>
          <button className="btn red" onClick={stop} disabled={stopping}>{stopping ? "Saving…" : "Stop lecture"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, marginTop: 28 }} className="live-grid">
        <div className="panel" style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap", justifyContent: "center", minHeight: 520 }}>
          <div className="qr-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/classes/${classCode}/qr`} alt={`QR code: join with class code ${classCode}`} />
          </div>
          <div style={{ maxWidth: 380 }}>
            <h2>Scan to join in the Lost and Found app</h2>
            <p className="muted" style={{ marginTop: 14 }}>or enter the class code</p>
            <p className="join-code mono">{spacedCode(classCode)}</p>
            <p className="muted" style={{ marginTop: 16 }}>This lecture is being recorded and transcribed. Audio is kept until the end of term.</p>
          </div>
        </div>
        <div className="stack" style={{ marginTop: 0 }}>
          <div className="panel">
            <p className="small muted">Students joined</p>
            <p style={{ fontSize: "2.6rem", fontWeight: 700, lineHeight: 1.1 }}>{live?.joined ?? 0}</p>
            <p className="small muted">of {live?.enrolled ?? 0} enrolled</p>
          </div>
          <div className="panel">
            <div className="between">
              <h3>Show live Lost count</h3>
              <button
                className={`toggle ${countOn ? "on" : ""}`}
                aria-pressed={countOn}
                aria-label="Show live Lost count"
                onClick={() => {
                  setCountOn(!countOn);
                  void setLiveCount(code, !countOn);
                }}
              >
                {countOn && <IconCheck />}
              </button>
            </div>
            {countOn && live?.lost_2min != null ? (
              <p style={{ marginTop: 10 }}>
                <span style={{ fontSize: "2rem", fontWeight: 700 }}>{live.lost_2min}</span> <span className="muted">tapped Lost in the last two minutes</span>
              </p>
            ) : (
              <p className="small muted" style={{ marginTop: 8 }}>Off by default. When on, shows how many students tapped Lost in the last two minutes.</p>
            )}
          </div>
          <div className="panel">
            <h3>Tutor context</h3>
            <p className="small muted" style={{ marginTop: 8 }}>
              {slideName ? `Slides attached: ${slideName}` : "No slides attached."}{" "}
              <label className="linkbtn small" style={{ color: "var(--gold)", cursor: "pointer" }}>
                {slideName ? "Replace" : "Attach slides or notes"}
                <input type="file" accept=".pdf,.txt,.md" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadSlides(e.target.files[0])} />
              </label>
            </p>
            <p className="small muted" style={{ marginTop: 10 }}>
              Microphone: {mic === "on" ? micName : mic === "denied" ? "blocked" : "starting"}
              {mic === "on" && (level > 0.08 ? ", good level" : ", quiet")}
            </p>
            {mic === "on" && <div className="level"><div style={{ width: `${level * 100}%` }} /></div>}
            {mic === "denied" && (
              <button className="btn gold sm" style={{ marginTop: 10 }} onClick={startMic}>Allow the microphone</button>
            )}
            <p className="small muted" style={{ marginTop: 10 }}>
              Live transcript:{" "}
              {captions === "on" ? `on (${live?.transcript_segments ?? 0} lines)` : captions === "unsupported" ? "needs Chrome, Edge or Safari" : captions === "error" ? "blocked by the browser" : "starting"}
            </p>
            {interim && <p className="small" style={{ marginTop: 6, opacity: 0.7 }}>{interim}</p>}
            {pending > 1 && <p className="small" style={{ color: "var(--gold)", marginTop: 8 }}>Offline: {pending} audio chunks saved, uploading when the connection is back.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
