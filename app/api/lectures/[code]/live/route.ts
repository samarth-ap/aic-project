import { countEnrolled, countLostSince, countPresence, getTranscript, lectureStatus } from "@/lib/db";
import { apiLecture, json, lectureNow } from "@/lib/server";

// GET /api/lectures/:code/live (professor) -> what the live screen shows
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { staff: true });
  if (a instanceof Response) return a;
  const s = a.session;
  const now = lectureNow(s);
  const [joined, enrolled, transcript] = await Promise.all([
    countPresence(s.id),
    a.cls ? countEnrolled(a.cls.id) : Promise.resolve(0),
    getTranscript(s.id),
  ]);
  return json({
    status: lectureStatus(s),
    now_ms: now,
    joined,
    enrolled,
    live_count_on: Boolean(s.live_count_on),
    // Off by default. When on: students who tapped Lost in the last two minutes.
    lost_2min: s.live_count_on ? await countLostSince(s.id, now - 120_000) : null,
    transcript_tail: transcript.slice(-3).map((t) => t.text),
    transcript_segments: transcript.length,
  });
}
