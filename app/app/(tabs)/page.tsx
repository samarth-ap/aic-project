import Link from "next/link";
import { requireUser } from "@/lib/server";
import { studentHome } from "@/lib/views";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Classes() {
  const u = await requireUser("/app");
  const { live, classes } = await studentHome(u);
  return (
    <>
      <div className="between" style={{ margin: "20px 0 22px" }}>
        <h1>Classes</h1>
        <Link className="fab" href="/join" aria-label="Join a class">+</Link>
      </div>
      <div className="stack">
        {live.map((l) => (
          <div key={l.code} className="card dark" style={{ padding: 20 }}>
            <p className="small bold"><span className="dot" style={{ marginRight: 6 }} />Live now · started {ago(l.started_at)}</p>
            <p className="small" style={{ color: "#cfcaf5", marginTop: 12 }}>{l.class_short} · Lecture {l.lecture_no}</p>
            <h2 style={{ fontSize: "1.35rem", marginTop: 2 }}>{l.title}</h2>
            <Link className="btn gold block" href={`/app/live/${l.code}`} style={{ marginTop: 16 }}>Join lecture</Link>
          </div>
        ))}
        {classes.map((c) => (
          <Link key={c.code} className="card" href={`/app/class/${c.code}`}>
            <h3 style={{ fontSize: "1.1rem" }}>{c.name}</h3>
            <p className="muted small" style={{ marginTop: 2 }}>
              {c.lectures} lecture{c.lectures === 1 ? "" : "s"} ·{" "}
              {c.role !== "student" ? "you teach this class" : c.my_lost ? `you were lost ${c.my_lost} time${c.my_lost === 1 ? "" : "s"}` : "no Lost moments yet"}
            </p>
          </Link>
        ))}
        {!classes.length && (
          <div className="card center stack" style={{ padding: 28 }}>
            <p className="muted">You haven&apos;t joined a class yet.</p>
            <Link className="btn" href="/join">Join a class</Link>
          </div>
        )}
      </div>
    </>
  );
}
