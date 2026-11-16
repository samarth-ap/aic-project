"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { api, saveAdminKey, useMe } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const { me } = useMe();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Signed in -> straight to the dashboard (auto-login).
  useEffect(() => {
    if (me?.user) router.replace("/dashboard");
  }, [me, router]);

  async function startDemo(e: React.FormEvent) {
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

  if (me?.user) return <main className="wrap narrow muted">Opening your dashboard…</main>;

  return (
    <main className="wrap narrow stack">
      <TopBar me={me} />
      <h1>Tap when you&apos;re lost. Get found after class.</h1>
      <p className="muted">
        Tap &ldquo;I&apos;m lost&rdquo; during lecture and an AI tutor explains what was just said. After class you get a
        catch-up card for the exact moment you got lost and a study plan; professors get a two-minute brief on what to re-teach.
        Professors never see who tapped.
      </p>

      <section className="card stack">
        <h2>Students, TAs and professors</h2>
        <p className="small muted">Sign in with your UW NetID account to see your classes, past lectures, chats and study plan.</p>
        <Link className="btn" href="/login">Sign in with UW</Link>
      </section>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/s/${code.trim().toUpperCase()}`);
        }}
      >
        <h2>Join a lecture</h2>
        <div>
          <label htmlFor="code">Lecture code (on the projector)</label>
          <input
            id="code"
            className="mono"
            placeholder="e.g. K7Q2MX"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button className="btn ghost" disabled={!code.trim()}>
          Join lecture
        </button>
      </form>

      <details className="card">
        <summary>Try it without an account (one-off demo lecture)</summary>
        <form className="stack" style={{ marginTop: 12 }} onSubmit={startDemo}>
          <div>
            <label htmlFor="title">Lecture title</label>
            <input id="title" placeholder="Lecture 7: Eigenvalues" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor="course">Course (optional)</label>
            <input id="course" placeholder="MATH 208" value={course} onChange={(e) => setCourse(e.target.value)} />
          </div>
          {err && <div className="banner alert">{err}</div>}
          <button className="btn" disabled={busy || !title.trim()}>
            {busy ? "Starting…" : "Start demo lecture"}
          </button>
          <p className="small muted">For real classes, sign in and create a class so lectures are grouped and saved.</p>
        </form>
      </details>
    </main>
  );
}
