import { getReport } from "@/lib/db";
import { error, json, sessionFrom, validDeviceId } from "@/lib/api";
import { hashDevice, type Report } from "@/lib/analysis/report";

// GET /api/sessions/:code/catchup?deviceId=...
// Returns catch-up cards for the moments THIS device tapped in, plus the
// class-wide top moments. Only the device itself knows its id.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  const deviceId = new URL(req.url).searchParams.get("deviceId");
  if (!validDeviceId(deviceId)) return error("bad deviceId");
  const r = getReport<Report>(s.id);
  if (!r) return json({ ready: false });

  const me = hashDevice(deviceId);
  const card = (m: Report["moments"][number]) => ({
    id: m.id,
    concept: m.concept_name,
    start_ms: m.start_ms,
    share: m.share,
    ...m.catch_up,
  });
  const mine = r.moments.filter((m) => r.private.moment_devices[m.id]?.includes(me));
  const others = r.moments.filter((m) => !mine.includes(m)).slice(0, 3);
  return json({ ready: true, title: r.session.title, mine: mine.map(card), class_top: others.map(card) });
}
