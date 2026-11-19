import { eventsForActor, getPrefs, lectureNumber, lectureStatus, touchPresence } from "@/lib/db";
import { apiLecture, json, lectureNow } from "@/lib/server";

// GET /api/lectures/:code/state -> lecture status and this student's own moments. Also the "joined" heartbeat.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { enroll: true });
  if (a instanceof Response) return a;
  const s = a.session;
  const now = lectureNow(s);
  if (!s.ended_at && !a.staff) await touchPresence(s.id, a.actor, now);
  const [events, prefs, no] = await Promise.all([eventsForActor(a.actor, [s.id]), getPrefs(a.user.id), lectureNumber(s)]);
  return json({
    code: s.code,
    title: s.title,
    course: a.cls?.name ?? s.course,
    lecture_no: no,
    status: lectureStatus(s),
    now_ms: now,
    server_time: Date.now(),
    started_at: s.started_at,
    my_moments: events.map((e) => ({ id: e.id, t_ms: e.t_ms, concept: e.concept, status: e.status })),
    dark_live: prefs.dark_live,
    seen_anon_note: prefs.seen_anon_note,
  });
}
