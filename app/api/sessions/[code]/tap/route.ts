import { addTap, lastTapMs, TAP_KINDS, touchPresence, type TapKind } from "@/lib/db";
import { DEFAULT_CONFIG } from "@/lib/analysis/signal";
import { error, json, sessionFrom, validDeviceId } from "@/lib/api";

// POST /api/sessions/:code/tap  { deviceId, kind }
// Time is stamped by the server, not the phone, so clocks can't drift.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  if (s.ended_at) return error("This lecture has ended", 409);
  const { deviceId, kind } = await req.json().catch(() => ({}));
  if (!validDeviceId(deviceId)) return error("bad deviceId");
  if (!TAP_KINDS.includes(kind)) return error("bad kind");

  const t = Date.now() - s.started_at;
  const prev = lastTapMs(s.id, deviceId);
  if (prev !== null && t - prev < DEFAULT_CONFIG.cooldownMs) {
    return json({ ok: false, cooldownMs: DEFAULT_CONFIG.cooldownMs - (t - prev) }, 429);
  }
  addTap(s.id, deviceId, kind as TapKind, t);
  touchPresence(s.id, deviceId, t);
  return json({ ok: true, t_ms: t, cooldownMs: DEFAULT_CONFIG.cooldownMs });
}
