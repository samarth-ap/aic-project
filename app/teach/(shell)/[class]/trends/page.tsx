import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server";
import { termTrends } from "@/lib/views";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Trends({ params }: { params: Promise<{ class: string }> }) {
  const code = (await params).class;
  const u = await requireUser(`/teach/${code}/trends`);
  const v = await termTrends(u, code);
  if (!v) notFound();
  const max = Math.max(0.01, ...v.lectures.map((l) => l.lost_share));
  const top = new Set(v.most_lost.map((l) => l.code));
  return (
    <>
      <p className="crumb">{v.cls.short}{v.cls.term ? ` · ${v.cls.term}` : ""} · {v.lectures.length} lecture{v.lectures.length === 1 ? "" : "s"} so far</p>
      <h1>Term trends</h1>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 270px", gap: 20, marginTop: 22 }} className="live-grid">
        <div className="card" style={{ padding: 24 }}>
          <div className="between">
            <h3>Students lost at least once, by lecture</h3>
            <span className="small muted">% of students joined</span>
          </div>
          {v.lectures.length ? (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 190, marginTop: 22, borderBottom: "1px solid var(--border)" }}>
                {v.lectures.map((l) => (
                  <Link key={l.code} href={`/teach/${v.cls.code}/lecture/${l.code}`} title={`${l.no} · ${l.title}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", textDecoration: "none" }}>
                    <span className="tiny bold" style={{ color: "var(--text)" }}>{Math.round(l.lost_share * 100)}</span>
                    <span style={{ width: "100%", maxWidth: 44, height: `${(l.lost_share / max) * 150}px`, minHeight: 3, background: top.has(l.code) ? "var(--violet)" : "#bdb6e6", borderRadius: "6px 6px 0 0", marginTop: 4 }} />
                  </Link>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                {v.lectures.map((l) => <span key={l.code} className="tiny muted center" style={{ flex: 1 }}>L{l.no}</span>)}
              </div>
              {v.most_lost.length > 0 && (
                <p className="muted" style={{ marginTop: 16 }}>
                  {v.most_lost.map((l) => `Lecture ${l.no} (${l.title})`).join(" and ")} lost the most students.
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ marginTop: 14 }}>Trends appear after the first lecture is processed.</p>
          )}
        </div>
        <div className="stack" style={{ marginTop: 0 }}>
          <div className="card" style={{ padding: 22 }}>
            <p className="small muted">Resolved by the tutor, term average</p>
            <p style={{ fontSize: "2.2rem", fontWeight: 700 }}>{v.resolved_avg == null ? "–" : pct(v.resolved_avg)}</p>
            {v.resolved_first4 != null && v.lectures.length > 4 && (
              <p className="small muted">{v.resolved_avg! >= v.resolved_first4 ? "Up" : "Down"} from {pct(v.resolved_first4)} in the first four lectures</p>
            )}
          </div>
          {v.suggest.length > 0 && (
            <div className="card dark" style={{ padding: 22 }}>
              <p className="small bold" style={{ color: "var(--gold)" }}>Suggested before {v.cls.exam_name}</p>
              <p style={{ marginTop: 8, fontSize: "1.1rem", lineHeight: 1.45 }}>
                A review session on {v.suggest.map((t) => t.name.toLowerCase()).join(" and ")}.{" "}
                {v.suggest.length > 1 ? "Both keep" : "It keeps"} producing hotspots{v.suggest.some((t) => t.still_fuzzy) ? ' and still have students marked "still fuzzy"' : ""}.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="card table-card" style={{ marginTop: 20 }}>
        <h3 style={{ padding: "20px 18px 4px" }}>Topics that keep coming up</h3>
        <table className="table">
          <thead>
            <tr><th>Topic</th><th>Hotspots</th><th>Lectures</th><th>Students lost, peak</th><th>Still fuzzy now</th><th>Clarifications</th></tr>
          </thead>
          <tbody>
            {v.topics.map((t) => (
              <tr key={t.name}>
                <td className="bold">{t.name}</td>
                <td>{t.hotspots}</td>
                <td>{t.lectures.map((n) => `L${n}`).join(", ")}</td>
                <td>{pct(t.peak)}</td>
                <td className={t.still_fuzzy >= 5 ? "gold bold" : ""}>{t.still_fuzzy} student{t.still_fuzzy === 1 ? "" : "s"}</td>
                <td>{[t.published && `${t.published} published`, t.drafts && `${t.drafts} draft${t.drafts > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "None"}</td>
              </tr>
            ))}
            {!v.topics.length && <tr><td colSpan={6} className="muted">No hotspots yet this term.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
