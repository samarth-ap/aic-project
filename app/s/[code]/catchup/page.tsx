"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, deviceId, fmt, pct, useMe } from "@/lib/client";
import TopBar from "@/components/TopBar";
import TutorChat from "@/components/TutorChat";

interface Card {
  id: string;
  concept: string;
  start_ms: number;
  share: number;
  title: string;
  explanation: string;
  practice_question: string;
  practice_answer: string;
}
interface Data {
  ready: boolean;
  title?: string;
  mine?: Card[];
  class_top?: Card[];
}

function CatchUpCard({ c }: { c: Card }) {
  return (
    <article className="card stack">
      <div className="row small muted">
        <span className="pill lost">{c.concept}</span>
        <span>at {fmt(c.start_ms)} · {pct(c.share)} of class were lost too</span>
      </div>
      <h2>{c.title}</h2>
      <p>{c.explanation}</p>
      <div className="card soft">
        <strong>Check yourself:</strong> {c.practice_question}
        <details style={{ marginTop: 8 }}>
          <summary>Show answer</summary>
          <p style={{ marginTop: 6 }}>{c.practice_answer}</p>
        </details>
      </div>
    </article>
  );
}

export default function CatchUp({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const { me } = useMe();

  useEffect(() => {
    const load = () => api<Data>(`/api/sessions/${code}/catchup?deviceId=${deviceId()}`).then(setData).catch(() => setData({ ready: false }));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [code]);

  return (
    <main className="wrap narrow stack">
      <TopBar me={me} />
      {!data ? (
        <p className="muted">Loading…</p>
      ) : !data.ready ? (
        <>
          <h1>Catch-up cards are on the way</h1>
          <p className="muted">They appear here after the professor ends the lecture and runs the analysis. This page refreshes on its own.</p>
        </>
      ) : (
        <>
          <h1>Your catch-up: {data.title}</h1>
          {data.mine?.length ? (
            data.mine.map((c) => <CatchUpCard key={c.id} c={c} />)
          ) : (
            <p className="muted">You didn&apos;t tap during a confusion spike. Here&apos;s what tripped up the most classmates:</p>
          )}
          {!!data.class_top?.length && (
            <>
              {!!data.mine?.length && <h2 style={{ marginTop: 24 }}>Also tricky for the class</h2>}
              {data.class_top.map((c) => <CatchUpCard key={c.id} c={c} />)}
            </>
          )}
        </>
      )}

      {/* Chat history for this lecture; after class the tutor can go deeper. */}
      <h2 style={{ marginTop: 24 }}>Your AI tutor chat</h2>
      <TutorChat code={code} live={false} />
      {me && !me.user && (
        <p className="small muted">
          <Link href={`/login?next=${encodeURIComponent(`/s/${code}/catchup`)}`}>Sign in</Link> to keep your chats and catch-up
          cards across lectures and devices.
        </p>
      )}
    </main>
  );
}
