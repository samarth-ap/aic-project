import { currentUser } from "@/lib/auth";
import { eventsForActor, getSessionById, threadsForEvents, userActorId } from "@/lib/db";
import { fmtClock } from "@/lib/format";
import { error } from "@/lib/server";

// GET /api/me/export -> all my tutor chats as a text file
export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const events = await eventsForActor(userActorId(user.id));
  const threads = await threadsForEvents(events.map((e) => e.id));
  const lectures = new Map<number, string>();
  const out: string[] = [`Lost and Found: tutor chats for ${user.email}`, `Exported ${new Date().toISOString()}`, ""];
  for (const e of events) {
    if (!lectures.has(e.session_id)) lectures.set(e.session_id, (await getSessionById(e.session_id))?.title ?? "Lecture");
    out.push(`== ${lectures.get(e.session_id)} · Lost at ${fmtClock(e.t_ms)}${e.concept ? ` · ${e.concept}` : ""} · ${e.status} ==`);
    for (const m of threads.get(e.id) ?? []) out.push(`${m.role === "user" ? "You" : "Tutor"}: ${m.content}`);
    out.push("");
  }
  return new Response(out.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="lost-and-found-chats.txt"' },
  });
}
