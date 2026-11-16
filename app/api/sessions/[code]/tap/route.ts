import { addTap, lastTapMs, TAP_KINDS, touchPresence, type TapKind } from "@/lib/db";
import { DEFAULT_CONFIG } from "@/lib/analysis/signal";
import { error, json, lectureActor, sessionFrom } from "@/lib/api";

// POST /api/sessions/:code/tap  { deviceId, kind }
// Time is stamped by the server, not the phone, so clocks can't drift.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  if (s.ended_at) return error("This lecture has ended", 409);
  const { deviceId, kind } = await req.json().catch(() => ({}));
  const who = await lectureActor(req, s, deviceId);
  if (who instanceof Response) return who;
  if (!TAP_KINDS.includes(kind)) return error("bad kind");
  const actor = who.actor;

  const t = Date.now() - s.started_at;
  const prev = await lastTapMs(s.id, actor);
  if (prev !== null && t - prev < DEFAULT_CONFIG.cooldownMs) {
    return json({ ok: false, cooldownMs: DEFAULT_CONFIG.cooldownMs - (t - prev) }, 429);
  }
  await addTap(s.id, actor, kind as TapKind, t);
  await touchPresence(s.id, actor, t);
  return json({ ok: true, t_ms: t, cooldownMs: DEFAULT_CONFIG.cooldownMs });
}
