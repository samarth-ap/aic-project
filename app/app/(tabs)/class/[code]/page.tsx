import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server";
import { studentClass } from "@/lib/views";
import { daysUntil, fmtDay, minutesLong } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await requireUser(`/app/class/${code}`);
  const v = await studentClass(u, code);
  if (!v) notFound();
  const days = v.exam ? daysUntil(v.exam.date) : null;
  return (
    <>
      <Link className="back" href="/app">Classes</Link>
      <h1 style={{ marginTop: 12 }}>{v.cls.short}</h1>
      <p className="muted" style={{ marginTop: 4 }}>{[v.cls.long, v.cls.term].filter(Boolean).join(" · ")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 }}>
        <Link className="card dark" href={`/app/study?class=${v.cls.code}`} style={{ color: "#fff" }}>
          <h3 style={{ color: "var(--gold)" }}>Study plan</h3>
          <p className="small" style={{ color: "#dcd9f7", marginTop: 2 }}>
            {v.exam && days != null ? (days > 0 ? `${v.exam.name} in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? `${v.exam.name} today` : "Exam passed") : "Built from your Lost moments"}
          </p>
        </Link>
        <Link className="card soft" href={`/app/map/class/${v.cls.code}`}>
          <h3 className="violet">Concept map</h3>
          <p className="small muted" style={{ marginTop: 2 }}>{v.topics ? `${v.topics} topics so far` : "Builds after each lecture"}</p>
        </Link>
      </div>
      <div className="between" style={{ margin: "26px 0 12px" }}>
        <h2>Lectures</h2>
        <span className="row" style={{ gap: 12 }}>
          <span className="legend gold"><span className="dot gold" />you</span>
          <span className="legend violet"><span className="dot violet" />class hotspots</span>
        </span>
      </div>
      <div className="stack">
        {v.lectures.map((l) =>
          l.status === "live" ? (
            <Link key={l.code} href={`/app/live/${l.code}`} className="card selected lecture-row">
              <div>
                <h3>{l.no} · {l.title}</h3>
                <p className="small bold redtext">Live now</p>
              </div>
              <span className="violet bold">Join</span>
            </Link>
          ) : (
            <Link key={l.code} href={`/app/lecture/${l.code}`} className="card lecture-row">
              <div className="grow">
                <h3>{l.no} · {l.title}</h3>
                <p className="small muted">{fmtDay(l.started_at)} · {minutesLong(l.duration_ms)}{l.status === "processing" ? " · processing" : ""}</p>
              </div>
              <span className="counts mono">
                <span className="gold" title="Your Lost moments">{l.mine}</span>
                <span className="violet" title="Class hotspots">{l.hotspots}</span>
              </span>
            </Link>
          ),
        )}
        {!v.lectures.length && <p className="muted card">No lectures yet. When your professor starts one, it shows up here.</p>}
      </div>
    </>
  );
}
