"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { LostLevel, StudyItem } from "@/components/StudentBits";
import { api, fmtDate, loginHref, pct, saveAdminKey, useMe } from "@/lib/client";
import type { LectureSummary, MyLecture } from "@/lib/classes";
import type { StudyPlan } from "@/lib/analysis/study";

type Role = "instructor" | "ta" | "student";
interface Base { joined: true; code: string; name: string; term: string; role: Role; allow_guests: boolean }
interface StaffView extends Base {
  staff_code?: string;
  lectures: LectureSummary[];
  roster: { name: string; email: string; role: Role; joined_at: number }[];
  counts: { students: number; staff: number };
}
interface StudentView extends Base { lectures: MyLecture[] }
type View = StaffView | StudentView | { joined: false; name: string; term: string };

export default function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { me } = useMe();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api<View>(`/api/classes/${code}`)
      .then(setV)
      .catch((e) => {
        const x = e as Error & { status?: number; data?: View };
        if (x.status === 401) router.replace(loginHref(`/c/${code}`));
        else if (x.status === 403 && x.data && "joined" in x.data) setV(x.data);
        else setErr(x.message);
      });
  }, [code, router]);
  useEffect(load, [load]);

  if (err) return <main className="wrap stack"><TopBar me={me} /><h1>Class not found</h1><p className="muted">{err}</p></main>;
  if (!v) return <main className="wrap muted">Loading class…</main>;

  if (!v.joined) {
    return (
      <main className="wrap narrow stack">
        <TopBar me={me} />
        <h1>{v.name}</h1>
        <p className="muted">{v.term}</p>
        <button
          className="btn"
          onClick={async () => {
            await api("/api/classes/join", { body: { code } });
            load();
          }}
        >
          Join this class
        </button>
      </main>
    );
  }

  return (
    <main className="wrap stack">
      <TopBar me={me} />
      <div>
        <div className="small muted">
          {v.term}
          {v.term && " · "}
          {v.role === "instructor" ? "You teach this class" : v.role === "ta" ? "You're a TA" : "You're a student"}
        </div>
        <h1>{v.name}</h1>
      </div>
      {v.role === "student" ? <StudentClass v={v as StudentView} /> : <StaffClass v={v as StaffView} reload={load} />}
    </main>
  );
}

// ---------------- staff ----------------

function StaffClass({ v, reload }: { v: StaffView; reload: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [topics, setTopics] = useState<{ topic: string; total_confusion: number; lectures: { title: string; concept: string; confusion: number }[] }[] | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const analyzed = v.lectures.filter((l) => l.analyzed);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ code: string; adminKey: string }>("/api/sessions", { body: { title, classCode: v.code } });
      saveAdminKey(r.code, r.adminKey);
      router.push(`/prof/${r.code}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  async function loadTopics() {
    setLoadingTopics(true);
    try {
      setTopics((await api<{ topics: NonNullable<typeof topics> }>(`/api/classes/${v.code}/trends`)).topics);
    } finally {
      setLoadingTopics(false);
    }
  }

  return (
    <>
      <div className="grid2">
        <form className="card stack" onSubmit={start}>
          <h2>Start a lecture</h2>
          <div>
            <label htmlFor="lt">Lecture title</label>
            <input id="lt" placeholder={`Lecture ${v.lectures.length + 1}: …`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {err && <div className="banner alert">{err}</div>}
          <button className="btn" disabled={busy || !title.trim()}>{busy ? "Starting…" : "Start lecture"}</button>
          <p className="small muted">You get a lecture code + QR for the projector. End it from the console to get the summary.</p>
        </form>

        <section className="card stack">
          <h2>Class codes</h2>
          <div>
            <div className="stat-label">Students join with</div>
            <div className="code-big mono">{v.code}</div>
          </div>
          {v.staff_code && (
            <div>
              <div className="stat-label">TAs join with (keep private)</div>
              <div className="mono" style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "0.08em" }}>{v.staff_code}</div>
            </div>
          )}
          {v.role === "instructor" && (
            <label className="small check-row">
              <input
                type="checkbox"
                checked={!v.allow_guests}
                onChange={async (e) => {
                  await api(`/api/classes/${v.code}`, { method: "PATCH", body: { allow_guests: !e.target.checked } });
                  reload();
                }}
              />
              Require UW sign-in to tap (otherwise guests can join anonymously)
            </label>
          )}
        </section>
      </div>

      <section className="card stack">
        <h2>Lectures</h2>
        {v.lectures.length ? (
          <ul className="list">
            {v.lectures.map((l) => (
              <li key={l.code}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{l.title}</strong>
                    <div className="small muted">
                      {fmtDate(l.started_at)} · <span className="mono">{l.code}</span>
                    </div>
                  </div>
                  {!l.ended_at ? <span className="pill lost">Live</span> : !l.analyzed ? <span className="pill">Not analyzed</span> : null}
                </div>
                {l.analyzed && (
                  <div className="small">
                    {l.lost_students != null && (
                      <>
                        <strong>{l.lost_students}</strong> of {l.students} students clicked lost ({pct(l.lost_students / Math.max(1, l.students))}) ·{" "}
                      </>
                    )}
                    {l.moments} confusion moment{l.moments === 1 ? "" : "s"}
                    {l.moments > 0 && <> · peak {pct(l.peak_share)}</>}
                    {l.top_concepts.length > 0 && (
                      <div className="muted">Most confusing: {l.top_concepts.map((c) => c.name).join(", ")}</div>
                    )}
                  </div>
                )}
                <div className="row small">
                  <Link href={`/prof/${l.code}`}>{l.ended_at ? "Console" : "Open console"}</Link>
                  {l.analyzed && <Link href={`/prof/${l.code}/report`}>Summary</Link>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No lectures yet. Start one above.</p>
        )}
      </section>

      <div className="grid2">
        <section className="card stack">
          <h2>Topics that confused the most</h2>
          <p className="small muted">Across all {analyzed.length} analyzed lecture{analyzed.length === 1 ? "" : "s"} in this class.</p>
          {topics ? (
            topics.length ? (
              topics.slice(0, 8).map((t) => (
                <div key={t.topic}>
                  <div className="row small" style={{ justifyContent: "space-between" }}>
                    <strong>{t.topic}</strong>
                    <span className="muted">{t.lectures.length} lecture{t.lectures.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="topic-bar" style={{ width: `${(t.total_confusion / Math.max(0.0001, topics[0].total_confusion)) * 100}%` }} />
                </div>
              ))
            ) : (
              <p className="small muted">No confusion moments yet.</p>
            )
          ) : (
            <button className="btn ghost" onClick={loadTopics} disabled={loadingTopics || !analyzed.length}>
              {loadingTopics ? "Grouping topics…" : "Show topics"}
            </button>
          )}
        </section>

        <section className="card stack">
          <h2>People</h2>
          <p className="small muted">
            {v.counts.students} student{v.counts.students === 1 ? "" : "s"} · {v.counts.staff} staff. You see who&apos;s in the class, never who
            tapped or what anyone asked the AI tutor.
          </p>
          <ul className="list roster">
            {v.roster.map((p) => (
              <li key={p.email} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  {p.name} <span className="small muted">{p.email}</span>
                </span>
                {p.role !== "student" && <span className="pill">{p.role === "ta" ? "TA" : "Instructor"}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

// ---------------- student ----------------

function StudentClass({ v }: { v: StudentView }) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [making, setMaking] = useState(false);
  useEffect(() => {
    api<StudyPlan>(`/api/classes/${v.code}/plan`).then(setPlan).catch(() => {});
  }, [v.code]);
  const live = v.lectures.filter((l) => !l.ended_at);
  const moments = v.lectures.flatMap((l) => l.my_moments);

  return (
    <>
      {live.map((l) => (
        <Link key={l.code} href={`/s/${l.code}`} className="card live-card">
          <span className="pill lost">Live now</span>
          <strong style={{ minWidth: 0 }}>{l.title}</strong>
          <span className="btn">Join</span>
        </Link>
      ))}

      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Your study plan</h2>
          <button
            className="btn ghost"
            disabled={making}
            onClick={async () => {
              setMaking(true);
              try {
                setPlan(await api<StudyPlan>(`/api/classes/${v.code}/plan`, { method: "POST" }));
              } finally {
                setMaking(false);
              }
            }}
          >
            {making ? "Thinking…" : plan?.mode === "ai" ? "Refresh plan" : "Make my study plan"}
          </button>
        </div>
        {plan ? (
          <>
            <p>{plan.summary}</p>
            <ol className="plan">
              {plan.items.map((it, i) => (
                <li key={i}>
                  <strong>{it.topic}</strong>
                  <div className="small muted">{it.why}</div>
                  <div className="small">{it.what_to_do}</div>
                  {it.lecture_code && (
                    <Link className="small" href={`/s/${it.lecture_code}/catchup`}>Catch-up card →</Link>
                  )}
                </li>
              ))}
            </ol>
            <p className="small muted">
              {plan.mode === "ai" ? `Made by AI on ${fmtDate(plan.generated_at)} from the moments you got lost and your tutor questions.` : "Built from your catch-up cards."}{" "}
              Only you can see this.
            </p>
          </>
        ) : (
          <p className="muted small">Loading…</p>
        )}
      </section>

      {moments.length > 0 && (
        <section className="card stack">
          <h2>Every moment you got lost</h2>
          {moments.map((m, i) => <StudyItem key={i} m={m} />)}
        </section>
      )}

      <section className="card stack">
        <h2>Your lectures</h2>
        {v.lectures.length ? (
          <ul className="list">
            {v.lectures.map((l) => (
              <li key={l.code}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{l.title}</strong>
                    <div className="small muted">{fmtDate(l.started_at)}</div>
                  </div>
                  <LostLevel level={l.lost_level} />
                </div>
                <div className="small muted">
                  lost {l.my_lost} · too fast {l.my_too_fast} · example {l.my_example} · {l.my_chats} tutor question{l.my_chats === 1 ? "" : "s"}
                </div>
                <div className="row small">
                  {l.ended_at ? <Link href={`/s/${l.code}/catchup`}>Catch-up & chat history</Link> : <Link href={`/s/${l.code}`}>Join</Link>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No lectures yet.</p>
        )}
      </section>
    </>
  );
}
