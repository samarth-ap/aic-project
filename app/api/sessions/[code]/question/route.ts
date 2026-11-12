import { addQuestion, getQuestions } from "@/lib/db";
import { error, isAdmin, json, sessionFrom, validDeviceId } from "@/lib/api";

// POST /api/sessions/:code/question  { deviceId, text }  (anonymous)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  if (s.ended_at) return error("This lecture has ended", 409);
  const { deviceId, text } = await req.json().catch(() => ({}));
  if (!validDeviceId(deviceId)) return error("bad deviceId");
  const clean = String(text ?? "").trim().slice(0, 280);
  if (!clean) return error("empty question");
  addQuestion(s.id, deviceId, Date.now() - s.started_at, clean);
  return json({ ok: true });
}

// GET (professor) -> questions without device ids
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);
  return json(getQuestions(s.id).map((q) => ({ t_ms: q.t_ms, text: q.text })));
}
