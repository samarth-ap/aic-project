"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, saveAdminKey } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ code: string; adminKey: string }>("/api/sessions", { body: { title, course } });
      saveAdminKey(r.code, r.adminKey);
      router.push(`/prof/${r.code}#k=${r.adminKey}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap narrow stack">
      <div className="brand" style={{ fontSize: "1.1rem" }}>
        Lost <span>&amp;</span> Found
      </div>
      <h1>Tap when you&apos;re lost. Get found after class.</h1>
      <p className="muted">
        Anonymous “I&apos;m lost” taps during lecture, lined up with what was being said. Students get a catch-up card for the
        exact moment they got lost; professors get a two-minute brief on what to re-teach.
      </p>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/s/${code.trim().toUpperCase()}`);
        }}
      >
        <h2>I&apos;m a student</h2>
        <div>
          <label htmlFor="code">Lecture code</label>
          <input
            id="code"
            className="mono"
            placeholder="e.g. K7Q2MX"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button className="btn" disabled={!code.trim()}>
          Join lecture
        </button>
      </form>

      <form className="card stack" onSubmit={start}>
        <h2>I&apos;m teaching</h2>
        <div>
          <label htmlFor="title">Lecture title</label>
          <input id="title" placeholder="Lecture 7: Eigenvalues" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="course">Course (groups lectures for the quarter view)</label>
          <input id="course" placeholder="MATH 208" value={course} onChange={(e) => setCourse(e.target.value)} />
        </div>
        {err && <div className="banner alert">{err}</div>}
        <button className="btn" disabled={busy || !title.trim()}>
          {busy ? "Starting…" : "Start lecture"}
        </button>
      </form>
    </main>
  );
}
