"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startLecture } from "@/app/actions";
import { spacedCode } from "@/lib/format";

export function ShowQr({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="linkbtn small" style={{ color: "#fff", textDecoration: "underline", marginTop: 6 }} onClick={() => setOpen(true)}>Show QR code</button>
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/classes/${code}/qr`} alt={`QR code to join with class code ${code}`} style={{ width: "min(360px, 80vw)", height: "auto" }} />
            <p className="code-big mono" style={{ color: "var(--text)", marginTop: 14 }}>{spacedCode(code)}</p>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

export function StartLecture({ classCode, nextNo }: { classCode: string; nextNo: number }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await startLecture(classCode, title);
    if (!r.code) {
      setErr(r.error ?? "Couldn't start the lecture");
      setBusy(false);
      return;
    }
    if (file) {
      const f = new FormData();
      f.set("file", file);
      const up = await fetch(`/api/lectures/${r.code}/slides`, { method: "POST", body: f }).catch(() => null);
      if (!up?.ok) sessionStorage.setItem(`lf.slidesErr.${r.code}`, "1");
    }
    router.push(`/teach/live/${r.code}`);
  }
  return (
    <>
      <button className="btn lg" onClick={() => setOpen(true)}>Start lecture</button>
      {open && (
        <div className="modal-back" onClick={() => !busy && setOpen(false)}>
          <form className="modal stack-lg" onClick={(e) => e.stopPropagation()} onSubmit={go}>
            <h2>Start lecture {nextNo}</h2>
            <label className="field">
              <span>Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recursion and the call stack" autoFocus required />
            </label>
            <label className="field">
              <span>Slides or notes for the tutor (optional)</span>
              <input className="input" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ paddingTop: 13 }} />
              <p className="small muted" style={{ marginTop: 6 }}>PDF, .txt or .md. The tutor uses them to explain what you&apos;re teaching.</p>
            </label>
            <p className="small muted">Next, your browser asks to use the microphone. It only turns your speech into a live transcript for the AI tutor; no audio is saved, so keep using Panopto to record.</p>
            {err && <p className="error">{err}</p>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn text" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn" disabled={busy || !title.trim()}>{busy ? "Starting…" : "Start lecture"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
