import { addQuestion, getQuestions } from "@/lib/db";
import { error, json, lectureActor, sessionFrom } from "@/lib/api";
import { canManage } from "@/lib/auth";

// POST /api/sessions/:code/question  { deviceId, text }  (anonymous)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  if (s.ended_at) return error("This lecture has ended", 409);
  const { deviceId, text } = await req.json().catch(() => ({}));
  const who = await lectureActor(req, s, deviceId);
  if (who instanceof Response) return who;
  const clean = String(text ?? "").trim().slice(0, 280);
  if (!clean) return error("empty question");
  await addQuestion(s.id, who.actor, Date.now() - s.started_at, clean);
  return json({ ok: true });
}

// GET (professor) -> questions without device ids
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!(await canManage(req, s))) return error("Professor key required", 403);
  return json((await getQuestions(s.id)).map((q) => ({ t_ms: q.t_ms, text: q.text })));
}
