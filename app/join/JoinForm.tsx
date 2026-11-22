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
/**
 * Returns a function that reads QR codes from the current video frame.
 * Uses the browser's built-in BarcodeDetector where it exists (Chrome on Android),
 * otherwise decodes frames with jsQR (iPhone Safari, Firefox, desktop browsers).
 */
async function qrReader(v: HTMLVideoElement): Promise<() => Promise<string[]>> {
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Ctor) {
    const det = new Ctor({ formats: ["qr_code"] });
    return async () => (await det.detect(v)).map((h) => h.rawValue);
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return async () => {
    if (!v.videoWidth) return [];
    const scale = Math.min(1, 640 / v.videoWidth); // smaller frames decode faster on phones
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    return hit ? [hit.data] : [];
  };
}
const spaced = (c: string) => (c.length > 3 ? `${c.slice(0, 3)} ${c.slice(3)}` : c);

export default function JoinForm({ initial = "", initialError = "", signedInAs, standalone = true }: { initial?: string; initialError?: string; signedInAs: string; standalone?: boolean }) {
  const [state, action, pending] = useActionState(joinWithCode, initialError ? { error: initialError } : {});
  const [code, setCode] = useState(spaced(initial));
  const [scanning, setScanning] = useState(false);
  const [camErr, setCamErr] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // Whether this browser can open the camera at all (needs https or localhost). Checked after
  // the first render so the server and the browser draw the same page.
  const [canScan, setCanScan] = useState(false);
  useEffect(() => setCanScan(Boolean(navigator.mediaDevices?.getUserMedia)), []);

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        // Camera permission is asked only now, when the student chooses to scan.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current || stop) return;
        video.current.srcObject = stream;
        await video.current.play();
        const read = await qrReader(video.current);
        while (!stop) {
          const c = (await read().catch(() => [] as string[])).map(codeFrom).find(Boolean);
          if (c) {
            setCode(spaced(c));
            setScanning(false);
            setTimeout(() => form.current?.requestSubmit(), 50);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (e) {
        const denied = (e as Error)?.name === "NotAllowedError";
        setCamErr(denied ? "Camera access was blocked. Allow it in your browser settings, or type the code." : "Couldn't open the camera. Type the code instead.");
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

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
          ) : canScan ? (
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
