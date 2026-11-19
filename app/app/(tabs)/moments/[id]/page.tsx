import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, getSessionById, getThread, userActorId } from "@/lib/db";
import { requireUser } from "@/lib/server";
import { fmtClock } from "@/lib/format";
import ThreadView from "./ThreadView";

export const dynamic = "force-dynamic";

export default async function Thread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ again?: string }> }) {
  const { id } = await params;
  const u = await requireUser(`/app/moments/${id}`);
  const e = await getEvent(Number(id));
  if (!e || e.actor !== userActorId(u.id)) notFound();
  const s = (await getSessionById(e.session_id))!;
  const msgs = await getThread(e.id);
  return (
    <>
      <Link className="back" href="/app/moments">My moments</Link>
      <p className="small muted bold" style={{ marginTop: 14 }}>{s.title}</p>
      <h1 style={{ fontSize: "1.6rem", marginTop: 2 }}>
        Lost at {fmtClock(e.t_ms)}
        {e.concept ? <span className="gold" style={{ display: "block", fontSize: "1.1rem", marginTop: 4 }}>{e.concept}</span> : null}
      </h1>
      <ThreadView
        code={s.code}
        eventId={e.id}
        tapMs={e.t_ms}
        status={e.status}
        live={!s.ended_at}
        again={(await searchParams).again === "1"}
        initial={msgs.map((m) => ({ role: m.role, kind: m.kind, content: m.content }))}
      />
    </>
  );
}
