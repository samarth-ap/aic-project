import { countPresence, touchPresence } from "@/lib/db";
import { error, json, publicSession, sessionFrom, validDeviceId } from "@/lib/api";

// GET /api/sessions/:code  -> public session info
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  return json(publicSession(s));
}

// POST /api/sessions/:code  { deviceId }  -> student heartbeat (counts active students)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  const { deviceId } = await req.json().catch(() => ({}));
  if (!validDeviceId(deviceId)) return error("bad deviceId");
  if (!s.ended_at) touchPresence(s.id, deviceId, Date.now() - s.started_at);
  return json({ ...publicSession(s), students: countPresence(s.id) });
}
