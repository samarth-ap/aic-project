import { countPresence, getQuestions, getTaps } from "@/lib/db";
import { computeSignal, DEFAULT_CONFIG } from "@/lib/analysis/signal";
import { error, isAdmin, json, sessionFrom } from "@/lib/api";

// GET /api/sessions/:code/live  (professor) -> live timeline for the console
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);

  const now = (s.ended_at ?? Date.now()) - s.started_at;
  const taps = getTaps(s.id);
  const joined = countPresence(s.id);
  // Live view uses raw time (no lag shift) so the prof sees taps as they land.
  const signal = computeSignal(taps, Math.max(now, 60_000), joined, { ...DEFAULT_CONFIG, lagMs: 0, binMs: 15_000 });
  const recentWindow = 60_000;
  const recentDevices = new Set(
    taps.filter((t) => t.kind !== "got_it" && t.t_ms >= now - recentWindow).map((t) => t.device_id),
  ).size;
  const activeNow = Math.max(countPresence(s.id, now - 5 * 60_000), 1);
  return json({
    now_ms: now,
    students: joined,
    active_now: activeNow,
    lost_last_minute: recentDevices,
    lost_share_last_minute: recentDevices / activeNow,
    alert: recentDevices >= DEFAULT_CONFIG.minDevices && recentDevices / activeNow >= 0.15,
    total_taps: taps.length,
    questions: getQuestions(s.id).length,
    bins: signal.bins.map((b) => ({ start_ms: b.start_ms, devices: b.devices, rate: b.rate })),
  });
}
