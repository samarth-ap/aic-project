import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server";
import { staffClass } from "@/lib/views";
import { fmtDay, fmtShortDate, pct, spacedCode } from "@/lib/format";
import { ShowQr, StartLecture } from "./ClassBits";

export const dynamic = "force-dynamic";

export default async function ProfClass({ params }: { params: Promise<{ class: string }> }) {
  const code = (await params).class;
  const u = await requireUser(`/teach/${code}`);
  const v = await staffClass(u, code);
  if (!v) notFound();
  const c = v.cls;
  const clar = (l: (typeof v.lectures)[number]) =>
    [l.published && `${l.published} published`, l.drafts && `${l.drafts} draft${l.drafts > 1 ? "s" : ""}`, l.dismissed && `${l.dismissed} dismissed`].filter(Boolean).join(" · ") || (l.status === "ready" ? "None" : "");
  return (
    <>
      <div className="between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1>{c.name}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {[c.term, `${v.enrolled} student${v.enrolled === 1 ? "" : "s"} enrolled`, c.audio_delete_on && `audio deleted on ${fmtShortDate(c.audio_delete_on)}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="row">
          <Link className="btn ghost" href={`/teach/${c.code}/settings`}>Edit class</Link>
          {v.live ? (
            <Link className="btn red lg" href={`/teach/live/${v.live}`}>Back to live lecture</Link>
          ) : (
            <StartLecture classCode={c.code} nextNo={v.lectures.length + 1} />
          )}
        </div>
      </div>

      <div className="grid3" style={{ marginTop: 24 }}>
        <div className="card dark" style={{ padding: 22 }}>
          <p className="small" style={{ color: "#cfcaf5" }}>Class code · students scan or type it once</p>
          <p className="code-big mono" style={{ marginTop: 6 }}>{spacedCode(c.code)}</p>
          <ShowQr code={c.code} />
        </div>
        <div className="card" style={{ padding: 22 }}>
          <p className="small muted">Topics that keep coming up this term</p>
          <h3 style={{ marginTop: 6, fontSize: "1.1rem" }}>{v.top_topics.length ? v.top_topics.join(" · ") : "None yet"}</h3>
          <Link className="small" href={`/teach/${c.code}/trends`} style={{ textDecoration: "underline", display: "inline-block", marginTop: 6 }}>See term trends</Link>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <p className="small muted">Waiting for you</p>
          <h3 style={{ marginTop: 6, fontSize: "1.1rem" }}>
            {v.drafts ? `${v.drafts} draft clarification${v.drafts > 1 ? "s" : ""} to review` : "Nothing to review"}
          </h3>
          {v.first_draft_lecture && (
            <Link className="small" href={`/teach/${c.code}/lecture/${v.first_draft_lecture}?tab=clarifications`} style={{ textDecoration: "underline", display: "inline-block", marginTop: 6 }}>Review drafts</Link>
          )}
        </div>
      </div>

      <div className="card table-card" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Lecture</th>
              <th>Date</th>
              <th>Joined</th>
              <th>Lost at least once</th>
              <th>Hotspots</th>
              <th>Clarifications</th>
            </tr>
          </thead>
          <tbody>
            {v.lectures.map((l, i) => (
              <tr key={l.code}>
                <td>
                  <Link href={l.status === "live" ? `/teach/live/${l.code}` : `/teach/${c.code}/lecture/${l.code}`} style={{ color: i === 0 ? "var(--violet)" : "var(--text)" }}>
                    {l.no} · {l.title}
                  </Link>
                </td>
                <td className="nowrap">{fmtDay(l.started_at)}</td>
                <td>{l.joined}</td>
                <td>{l.status === "live" ? <span className="redtext bold">Live now</span> : l.status === "processing" ? <span className="muted">Processing…</span> : l.lost_share == null ? "–" : pct(l.lost_share)}</td>
                <td>{l.status === "ready" ? l.hotspots : ""}</td>
                <td className={l.drafts && !l.published ? "gold bold" : ""}>{clar(l)}</td>
              </tr>
            ))}
            {!v.lectures.length && (
              <tr>
                <td colSpan={6} className="muted">No lectures yet. Start one when class begins: students join with the code above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
