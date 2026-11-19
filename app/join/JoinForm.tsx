"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { joinWithCode } from "../actions";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Pulls a class or lecture code out of a scanned QR (a /join/CODE link) or typed text. */
const codeFrom = (raw: string) => {
  const m = raw.match(/\/join\/([A-Za-z0-9]{6,8})/) ?? raw.match(/^\s*([A-Za-z0-9 ]{6,9})\s*$/);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
};
const spaced = (c: string) => (c.length > 3 ? `${c.slice(0, 3)} ${c.slice(3)}` : c);

export default function JoinForm({ initial = "", initialError = "", signedInAs, standalone = true }: { initial?: string; initialError?: string; signedInAs: string; standalone?: boolean }) {
  const [state, action, pending] = useActionState(joinWithCode, initialError ? { error: initialError } : {});
  const [code, setCode] = useState(spaced(initial));
  const [scanning, setScanning] = useState(false);
  const [camErr, setCamErr] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const Ctor = typeof window !== "undefined" ? (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector : undefined;

  useEffect(() => {
    if (!scanning || !Ctor) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        // Camera permission is asked only now, when the student chooses to scan.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const det = new Ctor({ formats: ["qr_code"] });
        while (!stop) {
          const hits = await det.detect(video.current).catch(() => []);
          const c = hits.map((h) => codeFrom(h.rawValue)).find(Boolean);
          if (c) {
            setCode(spaced(c));
            setScanning(false);
            setTimeout(() => form.current?.requestSubmit(), 50);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setCamErr("Couldn't open the camera. Type the code instead.");
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, Ctor]);

  return (
    <form ref={form} action={action} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {standalone && <p className="small bold muted" style={{ marginTop: 28 }}>Step 2 of 2</p>}
      <h1 style={{ marginTop: 6 }}>Join your class</h1>
      <p className="muted" style={{ marginTop: 10 }}>Scan the code your professor is showing, or type it in.</p>
      <div
        style={{ background: "var(--indigo-800)", borderRadius: 22, marginTop: 24, aspectRatio: "1.15", position: "relative", overflow: "hidden", display: "grid", placeItems: "center" }}
      >
        {scanning ? (
          <video ref={video} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
        <svg viewBox="0 0 200 200" width="56%" style={{ position: "relative" }} aria-hidden>
          {["M10 50V22a12 12 0 0 1 12-12h28", "M150 10h28a12 12 0 0 1 12 12v28", "M10 150v28a12 12 0 0 0 12 12h28", "M150 190h28a12 12 0 0 0 12-12v-28"].map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--gold)" strokeWidth={7} strokeLinecap="round" />
          ))}
        </svg>
        <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", color: "#e3e0ff", fontSize: "0.95rem" }}>
          {scanning ? (
            "Point the camera at the QR code"
          ) : Ctor ? (
            <button type="button" className="btn gold sm" onClick={() => { setCamErr(""); setScanning(true); }}>Scan the QR code</button>
          ) : (
            "Point your phone's camera app at the QR code"
          )}
        </div>
      </div>
      {camErr && <p className="error" style={{ marginTop: 8 }}>{camErr}</p>}
      <div className="divider-text" style={{ margin: "22px 0" }}>or enter the code</div>
      <label className="field">
        <span>Class code</span>
        <input
          className="input code-input mono"
          name="code"
          value={code}
          onChange={(e) => setCode(spaced(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8)))}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7M 2QP"
        />
      </label>
      {state?.error && <p className="error" style={{ marginTop: 10 }}>{state.error}</p>}
      <div style={{ flex: 1, minHeight: 32 }} />
      <button className="btn block lg" disabled={pending || code.replace(/\s/g, "").length < 6}>{pending ? "Joining…" : "Join class"}</button>
      <p className="center small muted" style={{ marginTop: 16 }}>
        Signed in as {signedInAs} · <Link href="/app/profile" style={{ textDecoration: "underline" }}>Switch account</Link>
      </p>
    </form>
  );
}
