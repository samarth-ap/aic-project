import { countPresence, getClassById, touchPresence } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { error, json, lectureActor, publicSession, sessionFrom } from "@/lib/api";

async function classInfo(classId: number | null) {
  const c = classId ? await getClassById(classId) : undefined;
  return c ? { class_code: c.code, class_name: c.name, need_login: !c.allow_guests } : { class_code: null, class_name: null, need_login: false };
}

// GET /api/sessions/:code  -> public session info
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  return json({ ...publicSession(s), ...(await classInfo(s.class_id)), signed_in: Boolean(await currentUser(req)) });
}

// POST /api/sessions/:code  { deviceId }  -> student heartbeat (counts active students).
// Signed-in students are added to the lecture's class.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  const { deviceId } = await req.json().catch(() => ({}));
  const who = await lectureActor(req, s, deviceId, { enroll: true });
  if (who instanceof Response) return who;
  if (!s.ended_at) await touchPresence(s.id, who.actor, Date.now() - s.started_at);
  return json({
    ...publicSession(s),
    ...(await classInfo(s.class_id)),
    signed_in: Boolean(who.user),
    students: await countPresence(s.id),
  });
}
