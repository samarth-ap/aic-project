import { recordLost, touchPresence } from "@/lib/db";
import { apiLecture, error, json, lectureNow } from "@/lib/server";

// POST /api/lectures/:code/lost { queued_t_ms? }
// The server stamps the lecture time, so every tap lands on the professor's one timeline.
// A tap made offline is sent later with the lecture time it was made at.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { enroll: true });
  if (a instanceof Response) return a;
  if (a.session.ended_at) return error("This lecture has ended", 409);
  const body = await req.json().catch(() => ({}));
  const now = lectureNow(a.session);
  const queued = Number(body.queued_t_ms);
  const t = Number.isFinite(queued) && queued >= 0 && queued <= now ? queued : now;
  const { event, reopened } = await recordLost(a.session.id, a.actor, t);
  await touchPresence(a.session.id, a.actor, now);
  return json({ event_id: event.id, t_ms: event.t_ms, reopened });
}
