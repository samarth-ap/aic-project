import Link from "next/link";
import { requireUser } from "@/lib/server";
import { studentDashboard } from "@/lib/views";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** How lost a student was in one lecture, from their own Lost moments (never compared by name). */
function lostLevel(n: number): { label: string; pct: number; tone: "none" | "low" | "mid" | "high" } {
  if (n === 0) return { label: "Not lost", pct: 4, tone: "none" };
  if (n === 1) return { label: "A little lost", pct: 34, tone: "low" };
  if (n === 2) return { label: "Somewhat lost", pct: 66, tone: "mid" };
  return { label: "Lost a lot", pct: 100, tone: "high" };
}

// Home: a dashboard of the student's own progress, then their classes.
export default async function Home() {
  const u = await requireUser("/app");
  const d = await studentDashboard(u);
  const learning = d.classes.some((c) => c.role === "student");
  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="eyebrow">{today()}</p>
          <h1>Hi, {d.first_name}</h1>
        </div>
        <Link className="fab" href="/join" aria-label="Join a class">+</Link>
      </header>

      {d.live.map((l) => (
        <div key={l.code} className="card dark live-card">
          <p className="small bold"><span className="dot pulse" style={{ marginRight: 8 }} />Live now · started {ago(l.started_at)}</p>
          <p className="small" style={{ color: "var(--on-dark-muted)", marginTop: 12 }}>{l.class_short} · Lecture {l.lecture_no}</p>
          <h2 style={{ fontSize: "1.35rem", marginTop: 2 }}>{l.title}</h2>
          <Link className="btn gold block" href={`/app/live/${l.code}`} style={{ marginTop: 16 }}>Join lecture</Link>
        </div>
      ))}

      {learning && (
        <div className="dash-grid">
          <section className="dash-col">
            <div className="stat-grid">
              <div className="stat-tile"><span className="num">{d.totals.lectures}</span><span className="lbl">Lectures attended</span></div>
              <div className="stat-tile"><span className="num">{d.totals.lost}</span><span className="lbl">Times you tapped Lost</span></div>
              <div className="stat-tile warn"><span className="num">{d.totals.fuzzy}</span><span className="lbl">Still fuzzy</span></div>
              <div className="stat-tile ok"><span className="num">{d.totals.got_it}</span><span className="lbl">Got it</span></div>
            </div>

            {d.next_exam && (
              <Link className="card exam-strip" href={`/app/study?class=${d.next_exam.class_code}`}>
                <span className="exam-days"><b>{d.next_exam.days}</b> day{d.next_exam.days === 1 ? "" : "s"}</span>
                <span className="grow">
                  <b>{d.next_exam.name}</b> in {d.next_exam.class_short}
                  <span className="small muted" style={{ display: "block" }}>Your study plan is built from where you got lost</span>
                </span>
                <span aria-hidden="true" className="chev">›</span>
              </Link>
            )}

            <section className="card stack">
              <div className="between">
                <h2>What to study next</h2>
                <Link className="small bold" href="/app/study">Full plan</Link>
              </div>
              {d.study_next.length ? (
                d.study_next.map((p, i) => (
                  <div key={`${p.class_code}-${p.key}`} className="study-row">
                    <span className="study-no">{i + 1}</span>
                    <div className="grow">
                      <div className="between">
                        <b>{p.name}</b>
                        <span className="tiny muted nowrap">{p.class_short} · {p.minutes} min</span>
                      </div>
                      <p className="small muted" style={{ marginTop: 2 }}>{p.reason}</p>
                      <div className="row" style={{ marginTop: 8 }}>
                        <Link className="btn sm" href={`/app/study/check?class=${p.class_code}&topic=${encodeURIComponent(p.key)}`}>
                          {p.kind === "check" ? "Quick check" : "5-question check"}
                        </Link>
                        <Link className="btn sm ghost" href={`/app/moments/${p.event_id}?again=1`}>Explain again</Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="small muted">
                  {d.totals.lost ? "Nothing left to review. Every weak spot is cleared." : "Tap Lost in a lecture when you lose the thread. Those moments become your study plan."}
                </p>
              )}
            </section>
          </section>

          <section className="dash-col">
            <section className="card stack">
              <div className="between">
                <h2>How lost you were</h2>
                <Link className="small bold" href="/app/moments">My moments</Link>
              </div>
              {d.recent.length ? (
                d.recent.map((l) => {
                  const lv = lostLevel(l.lost);
                  return (
                    <Link key={l.code} href={`/app/lecture/${l.code}`} className="lost-row">
                      <div className="between">
                        <div className="grow">
                          <b className="clip">{l.title}</b>
                          <span className="tiny muted" style={{ display: "block" }}>{l.class_short} · Lecture {l.no} · {day(l.started_at)}</span>
                        </div>
                        <span className={`tag level-${lv.tone}`}>{lv.label}</span>
                      </div>
                      <div className={`meter level-${lv.tone}`} aria-hidden="true"><div style={{ width: `${lv.pct}%` }} /></div>
                      {l.lost > 0 && (
                        <span className="tiny muted">
                          {l.lost} Lost moment{l.lost === 1 ? "" : "s"}
                          {l.fuzzy ? ` · ${l.fuzzy} still fuzzy` : ""}
                          {l.got_it ? ` · ${l.got_it} got it` : ""}
                        </span>
                      )}
                    </Link>
                  );
                })
              ) : (
                <p className="small muted">Lectures you join show up here after class, with your Lost moments and the class&apos;s hotspots.</p>
              )}
            </section>
          </section>
        </div>
      )}

      <h2 className="section-title">Your classes</h2>
      <div className="stack">
        {d.classes.map((c) => (
          <Link key={c.code} className="card class-card" href={c.role === "student" ? `/app/class/${c.code}` : `/teach/${c.code}`}>
            <h3 style={{ fontSize: "1.1rem" }}>{c.name}</h3>
            <p className="muted small" style={{ marginTop: 2 }}>
              {c.lectures} lecture{c.lectures === 1 ? "" : "s"} ·{" "}
              {c.role !== "student" ? "you teach this class" : c.my_lost ? `you were lost ${c.my_lost} time${c.my_lost === 1 ? "" : "s"}` : "no Lost moments yet"}
            </p>
          </Link>
        ))}
        {!d.classes.length && (
          <div className="card center stack" style={{ padding: 28 }}>
            <p className="muted">You haven&apos;t joined a class yet.</p>
            <Link className="btn" href="/join">Join a class</Link>
          </div>
        )}
      </div>
    </div>
  );
}
