"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api, deviceId, loginHref } from "@/lib/client";
import TutorChat, { type TutorTrigger } from "@/components/TutorChat";

type Kind = "lost" | "too_fast" | "example" | "got_it";
const LABELS: Record<Kind, string> = { lost: "I'm lost", too_fast: "Too fast", example: "Example please", got_it: "Got it" };

interface Info {
  code: string;
  title: string;
  course: string;
  ended_at: number | null;
  students?: number;
  class_code?: string | null;
  class_name?: string | null;
  signed_in?: boolean;
}

export default function StudentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [toast, setToast] = useState("");
  const [coolUntil, setCoolUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [count, setCount] = useState(0);
  const [q, setQ] = useState("");
  const [showQ, setShowQ] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [trigger, setTrigger] = useState<TutorTrigger>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const heartbeat = useCallback(async () => {
    try {
      setInfo(await api<Info>(`/api/sessions/${code}`, { body: { deviceId: deviceId() } }));
    } catch (e) {
      const err = e as Error & { data?: { needLogin?: boolean } };
      if (err.data?.needLogin) setNeedLogin(true);
      else setErr(err.message);
    }
  }, [code]);

  useEffect(() => {
    heartbeat();
    const hb = setInterval(heartbeat, 45_000);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(hb);
      clearInterval(tick);
    };
  }, [heartbeat]);

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  async function tap(kind: Kind) {
    if (navigator.vibrate) navigator.vibrate(30);
    try {
      const r = await api<{ cooldownMs: number }>(`/api/sessions/${code}/tap`, { body: { deviceId: deviceId(), kind } });
      setCoolUntil(Date.now() + r.cooldownMs);
      if (kind !== "got_it") setCount((c) => c + 1);
      if (kind === "lost" || kind === "example") {
        // Open the AI tutor with an automatic "what just happened?" prompt.
        setChatOpen(true);
        setTrigger({ kind, nonce: Date.now() });
        flash("Bookmarked. Asking the AI tutor…");
      } else {
        flash(kind === "got_it" ? "Nice 👍" : "Bookmarked — your catch-up card will cover this.");
      }
    } catch (e) {
      const err = e as Error & { status?: number; data?: { cooldownMs?: number } };
      if (err.status === 429) setCoolUntil(Date.now() + (err.data?.cooldownMs ?? 3000));
      else if (err.status === 409) heartbeat();
      else flash(err.message);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      await api(`/api/sessions/${code}/question`, { body: { deviceId: deviceId(), text: q } });
      setQ("");
      setShowQ(false);
      flash("Sent anonymously.");
    } catch (e) {
      flash((e as Error).message);
    }
  }

  if (needLogin) {
    return (
      <main className="wrap narrow stack">
        <div className="brand">Lost <span>&amp;</span> Found</div>
        <h1>Sign in to join</h1>
        <p className="muted">
          This class uses UW sign-in so you get your own history and study plan. Your professor still never sees who tapped.
        </p>
        <Link className="btn" href={loginHref(`/s/${code}`)}>Sign in with UW</Link>
      </main>
    );
  }
  if (err) {
    return (
      <main className="wrap narrow stack">
        <h1>Hmm.</h1>
        <p className="muted">{err}</p>
        <Link className="btn ghost" href="/">Try another code</Link>
      </main>
    );
  }
  if (!info) return <main className="wrap narrow muted">Joining…</main>;

  if (info.ended_at) {
    return (
      <main className="wrap narrow stack">
        <div className="brand">Lost <span>&amp;</span> Found</div>
        <h1>{info.title} has ended</h1>
        <p className="muted">Your catch-up cards appear once the professor runs the analysis.</p>
        <Link className="btn" href={`/s/${code}/catchup`}>See my catch-up cards</Link>
        {info.signed_in && <Link className="btn ghost" href="/dashboard">My dashboard</Link>}
        <TutorChat code={code} live={false} />
      </main>
    );
  }

  const cooling = coolUntil > now;
  return (
    <main className="wrap narrow stack" style={{ paddingTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="brand">Lost <span>&amp;</span> Found</div>
        <span className="pill">{info.students ?? 1} in class · {info.signed_in ? "private" : "anonymous"}</span>
      </div>
      <div>
        <div className="small muted">{info.class_name ?? info.course}</div>
        <h2 style={{ marginBottom: 0 }}>{info.title}</h2>
      </div>

      <button className="tap-big" onClick={() => tap("lost")} disabled={cooling}>
        {cooling ? `${Math.ceil((coolUntil - now) / 1000)}s` : LABELS.lost}
      </button>
      <div className="tap-row">
        {(["too_fast", "example", "got_it"] as Kind[]).map((k) => (
          <button key={k} className="tap-small" onClick={() => tap(k)} disabled={cooling}>
            {LABELS[k]}
          </button>
        ))}
      </div>
      <div className="toast" aria-live="polite">{toast}</div>

      {chatOpen ? (
        <TutorChat code={code} live trigger={trigger} onClose={() => setChatOpen(false)} />
      ) : (
        <button className="btn" onClick={() => setChatOpen(true)}>Ask the AI tutor</button>
      )}

      {showQ ? (
        <form className="card stack" onSubmit={ask}>
          <textarea rows={3} maxLength={280} autoFocus placeholder="Ask anonymously…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row">
            <button className="btn">Send</button>
            <button type="button" className="btn ghost" onClick={() => setShowQ(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn ghost" onClick={() => setShowQ(true)}>Ask the professor anonymously</button>
      )}

      <p className="small muted" style={{ textAlign: "center" }}>
        {count > 0 ? `${count} moment${count > 1 ? "s" : ""} bookmarked. ` : ""}Your professor never sees who tapped.
        {info.signed_in === false && (
          <>
            {" "}
            <Link href={loginHref(`/s/${code}`)}>Sign in</Link> to save this lecture to your dashboard.
          </>
        )}
      </p>
    </main>
  );
}
