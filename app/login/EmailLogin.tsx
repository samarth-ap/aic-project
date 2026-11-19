"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export default function EmailLogin({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const d = await post("/api/auth/email/start", { email });
      setDevCode(d.devCode ?? "");
      setWait(d.resendInS ?? 45);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const d = await post("/api/auth/email/verify", { email, code, next });
      window.location.href = d.next;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <main className="app no-tabs" style={{ display: "flex", flexDirection: "column" }}>
        <Link className="back" href={`/?next=${encodeURIComponent(next)}`}>Back</Link>
        <form onSubmit={send} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <p className="small bold muted" style={{ marginTop: 28 }}>Step 1 of 2</p>
          <h1 style={{ marginTop: 6 }}>{next.startsWith("/teach") ? "Set up your class" : "Sign in with email"}</h1>
          <p className="muted" style={{ marginTop: 10 }}>We&apos;ll email you a 6-digit code. No password to remember.</p>
          <label className="field" style={{ marginTop: 28 }}>
            <span>Your university email</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@uw.edu" autoFocus />
          </label>
          {err && <p className="error" style={{ marginTop: 10 }}>{err}</p>}
          <div style={{ flex: 1, minHeight: 40 }} />
          <button className="btn block lg" disabled={busy || !email}>{busy ? "Sending…" : "Send my code"}</button>
        </form>
      </main>
    );
  }
  return (
    <main className="app no-tabs" style={{ display: "flex", flexDirection: "column" }}>
      <button className="back linkbtn" style={{ textAlign: "left" }} onClick={() => setStep("email")}>Back</button>
      <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <p className="small bold muted" style={{ marginTop: 28 }}>Step 1 of 2</p>
        <h1 style={{ marginTop: 6 }}>Check your email</h1>
        <p className="muted" style={{ marginTop: 10 }}>
          We sent a 6-digit code to <b style={{ color: "var(--text)" }}>{email}</b>. It expires in 10 minutes.
        </p>
        {devCode && (
          <p className="notice warn" style={{ marginTop: 14 }}>
            Test mode (no email service set up): your code is <b className="mono">{devCode}</b>
          </p>
        )}
        <label className="field" style={{ marginTop: 24 }}>
          <span>6-digit code</span>
          <input
            ref={codeRef}
            className="input code-input mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
            }}
          />
        </label>
        <p className="small muted" style={{ marginTop: 8 }}>The code fills in by itself if your phone offers it.</p>
        <div className="between small" style={{ marginTop: 24 }}>
          {wait > 0 ? (
            <span className="muted">Didn&apos;t get it? Resend in 0:{String(wait).padStart(2, "0")}</span>
          ) : (
            <button type="button" className="linkbtn" onClick={() => send()}>Resend the code</button>
          )}
          <button type="button" className="linkbtn" onClick={() => { setStep("email"); setCode(""); }}>Change email</button>
        </div>
        {err && <p className="error" style={{ marginTop: 14 }}>{err}</p>}
        <div style={{ flex: 1, minHeight: 40 }} />
        <button className="btn block lg" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Continue"}</button>
        <p className="center small muted" style={{ marginTop: 16 }}>No password to remember. You stay signed in on this phone.</p>
      </form>
    </main>
  );
}
