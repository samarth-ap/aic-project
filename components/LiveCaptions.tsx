"use client";
// Live transcription in the professor's browser using the Web Speech API
// (Chrome/Edge/Safari). Each finished phrase is sent to the server, which
// stamps it with the lecture time. No audio leaves the browser except to the
// browser vendor's own speech service. For better accuracy, upload the
// recording's captions (.vtt/.srt from Panopto/Zoom) after class instead.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

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

export function LiveCaptions({ code, adminKey, disabled }: { code: string; adminKey: string; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState("");
  const rec = useRef<Recognizer | null>(null);
  const wantOn = useRef(false);

  const Ctor: RecognizerCtor | undefined =
    typeof window !== "undefined"
      ? ((window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: RecognizerCtor }).webkitSpeechRecognition)
      : undefined;

  useEffect(() => () => { wantOn.current = false; rec.current?.stop(); }, []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);

  function start() {
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal && text) {
          setLines((l) => [...l.slice(-4), text]);
          api(`/api/sessions/${code}/transcript`, { body: { text }, key: adminKey }).catch(() => {});
        } else partial += text + " ";
      }
      setInterim(partial);
    };
    r.onerror = (e) => { if (e.error !== "no-speech") setErr(`Captions: ${e.error}`); };
    // Browsers stop recognition after a pause; restart while the prof wants it on.
    r.onend = () => { if (wantOn.current) r.start(); };
    rec.current = r;
    wantOn.current = true;
    r.start();
    setOn(true);
    setErr("");
  }
  function stop() {
    wantOn.current = false;
    rec.current?.stop();
    setOn(false);
    setInterim("");
  }

  if (!Ctor) {
    return <p className="small muted">Live captions need Chrome, Edge or Safari. You can upload a captions file after class instead.</p>;
  }
  return (
    <div className="stack">
      <div className="row">
        <button className={`btn ${on ? "ghost" : ""}`} onClick={on ? stop : start} disabled={disabled}>
          {on ? "■ Stop live captions" : "● Start live captions"}
        </button>
        {on && <span className="pill lost">Listening</span>}
      </div>
      {err && <div className="banner">{err}</div>}
      {(lines.length > 0 || interim) && (
        <div className="small muted" style={{ maxHeight: 120, overflow: "hidden" }}>
          {lines.map((l, i) => <div key={i}>{l}</div>)}
          {interim && <div style={{ opacity: 0.6 }}>{interim}</div>}
        </div>
      )}
    </div>
  );
}
