"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { LostLevel, StudyItem } from "@/components/StudentBits";
import { api, fmtDate, loginHref, pct, useMe } from "@/lib/client";
import type { LectureSummary, MyLecture, MyMoment } from "@/lib/classes";

interface Dash {
  user: { name: string; email: string };
  teaching: { code: string; name: string; term: string; role: string; lecture_count: number; live: LectureSummary[]; recent: LectureSummary[] }[];
  learning: { code: string; name: string; term: string; lectures_attended: number; lost_taps: number; moments: number; live: { code: string; title: string }[] }[];
  recent_lectures: MyLecture[];
  study_next: MyMoment[];
  totals: { lectures: number; lost_taps: number; chats: number; moments: number };
}

export default function Dashboard() {
  const router = useRouter();
  const { me } = useMe();
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api<Dash>("/api/me/dashboard")
      .then(setD)
      .catch((e) => {
        if ((e as { status?: number }).status === 401) router.replace(loginHref("/dashboard"));
        else setErr((e as Error).message);
      });
  }, [router]);
  useEffect(load, [load]);

  if (err) return <main className="wrap stack"><TopBar me={me} /><div className="banner alert">{err}</div></main>;
  if (!d) return <main className="wrap muted">Loading your dashboard…</main>;

  const live = [
    ...d.learning.flatMap((c) => c.live.map((l) => ({ ...l, cls: c.name, href: `/s/${l.code}`, label: "Join" }))),
    ...d.teaching.flatMap((c) => c.live.map((l) => ({ code: l.code, title: l.title, cls: c.name, href: `/prof/${l.code}`, label: "Open console" }))),
  ];
  const isStudent = d.learning.length > 0 || d.recent_lectures.length > 0;

  return (
    <main className="wrap stack">
      <TopBar me={me} />
      <h1>Hi, {d.user.name.split(" ")[0]}</h1>

      {live.map((l) => (
        <Link key={l.code} href={l.href} className="card live-card">
          <span className="pill lost">Live now</span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">{l.cls}</div>
            <strong>{l.title}</strong>
          </div>
          <span className="btn">{l.label}</span>
        </Link>
      ))}

      {isStudent && (
        <>
          <section className="card stats-card">
            <div className="stats">
              <div><div className="stat">{d.totals.lectures}</div><div className="stat-label">lectures attended</div></div>
              <div><div className="stat">{d.totals.lost_taps}</div><div className="stat-label">times you got lost</div></div>
              <div><div className="stat">{d.totals.moments}</div><div className="stat-label">moments to review</div></div>
              <div><div className="stat">{d.totals.chats}</div><div className="stat-label">questions to the AI tutor</div></div>
            </div>
          </section>

          <div className="dash-grid">
            <section className="card stack">
              <h2>What to study next</h2>
              {d.study_next.length ? (
                <>
                  {d.study_next.map((m, i) => <StudyItem key={i} m={m} />)}
                  {d.learning.length > 0 && (
                    <p className="small muted">
                      Want a full plan? Open a class below and tap <em>Make my study plan</em>.
                    </p>
                  )}
                </>
              ) : (
                <p className="muted small">
                  Nothing yet. When you tap &ldquo;I&apos;m lost&rdquo; in a lecture, the moments you got stuck on show up here after class
                  with a short re-explanation and a practice question.
                </p>
              )}
            </section>

            <section className="card stack">
              <h2>Recent lectures</h2>
              {d.recent_lectures.length ? (
                <ul className="list">
                  {d.recent_lectures.map((l) => (
                    <li key={l.code}>
                      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <strong>{l.title}</strong>
                          <div className="small muted">{fmtDate(l.started_at)}{!l.ended_at && " · live"}</div>
                        </div>
                        <LostLevel level={l.lost_level} />
                      </div>
                      <div className="small muted">
                        lost {l.my_lost} · too fast {l.my_too_fast} · example {l.my_example} · {l.my_chats} tutor question{l.my_chats === 1 ? "" : "s"}
                      </div>
                      <div className="row small">
                        <Link href={l.ended_at ? `/s/${l.code}/catchup` : `/s/${l.code}`}>
                          {l.ended_at ? "Catch-up & chat history" : "Rejoin"}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Lectures you join while signed in show up here.</p>
              )}
            </section>
          </div>
        </>
      )}

      <div className="grid2">
        {d.teaching.map((c) => (
          <Link key={c.code} href={`/c/${c.code}`} className="card stack class-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">{c.role === "ta" ? "TA" : "Teaching"}</span>
              <span className="small muted">{c.term}</span>
            </div>
            <h2>{c.name}</h2>
            <div className="small muted">
              {c.lecture_count} lecture{c.lecture_count === 1 ? "" : "s"}
              {c.recent[0]?.analyzed && c.recent[0].lost_students != null && (
                <> · last lecture: {c.recent[0].lost_students} of {c.recent[0].students} got lost ({pct(c.recent[0].lost_students / Math.max(1, c.recent[0].students))})</>
              )}
            </div>
          </Link>
        ))}
        {d.learning.map((c) => (
          <Link key={c.code} href={`/c/${c.code}`} className="card stack class-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill ok">Student</span>
              <span className="small muted">{c.term}</span>
            </div>
            <h2>{c.name}</h2>
            <div className="small muted">
              {c.lectures_attended} lecture{c.lectures_attended === 1 ? "" : "s"} · {c.moments} moment{c.moments === 1 ? "" : "s"} to review
            </div>
          </Link>
        ))}
      </div>

      <div className="grid2">
        <JoinClass onJoined={(code) => router.push(`/c/${code}`)} />
        <CreateClass onCreated={(code) => router.push(`/c/${code}`)} />
      </div>
    </main>
  );
}

function JoinClass({ onJoined }: { onJoined: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        try {
          const r = await api<{ code: string }>("/api/classes/join", { body: { code } });
          onJoined(r.code);
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    >
      <h2>Join a class</h2>
      <div>
        <label htmlFor="cc">Class code from your professor (TAs: use the staff code)</label>
        <input id="cc" className="mono" autoCapitalize="characters" placeholder="e.g. 7KQ2MX" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      {err && <div className="banner alert">{err}</div>}
      <button className="btn ghost" disabled={!code.trim()}>Join</button>
    </form>
  );
}

function CreateClass({ onCreated }: { onCreated: (code: string) => void }) {
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [err, setErr] = useState("");
  return (
    <details className="card">
      <summary>Teaching? Create a class</summary>
      <form
        className="stack"
        style={{ marginTop: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          try {
            const r = await api<{ code: string }>("/api/classes", { body: { name, term } });
            onCreated(r.code);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        <div>
          <label htmlFor="cn">Class name</label>
          <input id="cn" placeholder="MATH 208 A" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ct">Term</label>
          <input id="ct" placeholder="Autumn 2026" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        {err && <div className="banner alert">{err}</div>}
        <button className="btn" disabled={!name.trim()}>Create class</button>
        <p className="small muted">You&apos;ll get a class code for students and a staff code for TAs.</p>
      </form>
    </details>
  );
}
