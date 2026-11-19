import Link from "next/link";
import { requireUser } from "@/lib/server";
import { studyView } from "@/lib/views";
import { ClassPicker, ExamDate } from "./StudyBits";

export const dynamic = "force-dynamic";

const BAR: Record<string, { w: string; c: string; label: string }> = {
  weak: { w: "28%", c: "var(--gold)", label: "Weak" },
  okay: { w: "62%", c: "#b9b2f3", label: "Okay" },
  solid: { w: "100%", c: "var(--violet)", label: "Solid" },
};

export default async function Study({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const u = await requireUser("/app/study");
  const v = await studyView(u, (await searchParams).class);
  if (!v.cls) {
    return (
      <>
        <h1 className="page-title">Study</h1>
        <p className="card muted">Join a class first. Your study plan is built from the moments you tap Lost.</p>
      </>
    );
  }
  const examLabel = v.exam && v.days != null ? (v.days > 0 ? `${v.exam.name} in ${v.days} day${v.days === 1 ? "" : "s"}` : v.days === 0 ? `${v.exam.name} today` : `${v.exam.name} has passed`) : "No exam date yet";
  const share = v.weak_total ? v.cleared / v.weak_total : 0;
  const total = v.plan.reduce((n, p) => n + p.minutes, 0);
  return (
    <>
      <div className="between" style={{ margin: "20px 0 18px" }}>
        <h1>Study</h1>
        <ClassPicker classes={v.classes} current={v.cls.code} />
      </div>
      <div className="card dark" style={{ padding: 20 }}>
        <div className="between">
          <h2 style={{ fontSize: "1.3rem" }}>{examLabel}</h2>
          <span className="small" style={{ color: "#cfcaf5" }}>{v.lectures_range}</span>
        </div>
        <div className="bar on-dark" style={{ marginTop: 14 }}>
          <div style={{ width: `${Math.max(share * 100, v.weak_total ? 3 : 0)}%` }} />
        </div>
        <p className="small" style={{ color: "#dcd9f7", marginTop: 10 }}>
          {v.weak_total ? `${v.cleared} of ${v.weak_total} weak spots cleared. ` : "No weak spots yet. "}Built from where you tapped Lost.
        </p>
        {!v.cls.exam_by_prof && <ExamDate classCode={v.cls.code} current={v.exam?.date ?? null} />}
      </div>

      <div className="between" style={{ margin: "26px 0 12px" }}>
        <h2>Today{total ? ` · about ${total} min` : ""}</h2>
        <Link href={`/app/map/class/${v.cls.code}`} className="small bold">See on map</Link>
      </div>
      <div className="stack">
        {v.plan.map((p, i) => (
          <div key={p.key} className="card">
            <div className="between">
              <h3 style={{ fontSize: "1.1rem" }}>{i + 1} · {p.name}</h3>
              <span className="small muted nowrap">{p.minutes} min</span>
            </div>
            <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{p.reason}</p>
            <div className="row" style={{ marginTop: 14 }}>
              <Link className="btn sm" href={`/app/study/check?class=${v.cls!.code}&topic=${encodeURIComponent(p.key)}`}>
                {p.kind === "check" ? "Quick check" : "5-question check"}
              </Link>
              <Link className="btn sm ghost" href={`/app/lecture/${p.clip.lecture}?t=${p.clip.t_ms}`}>Rewatch 2 min</Link>
              <Link className="btn sm ghost" href={`/app/moments/${p.event_id}?again=1`}>Explain again</Link>
            </div>
          </div>
        ))}
        {!v.plan.length && <p className="card muted">{v.standing.length ? "Nothing left for today. Every weak spot is cleared." : "Tap Lost in a lecture when you lose the thread. Those moments become your plan."}</p>}
      </div>

      {v.standing.length > 0 && (
        <>
          <h3 className="group-label" style={{ marginTop: 28 }}>Where you stand, by topic</h3>
          <div className="stack">
            {v.standing.map((t) => (
              <div key={t.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 48px", alignItems: "center", gap: 12 }}>
                <span className="bold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                <div className="bar"><div style={{ width: BAR[t.standing].w, background: BAR[t.standing].c }} /></div>
                <span className="small muted">{BAR[t.standing].label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
