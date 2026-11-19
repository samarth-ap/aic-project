import { after } from "next/server";
import { addTranscript, clearTranscript } from "@/lib/db";
import { parseCaptions } from "@/lib/analysis/transcript";
import { refreshSummary } from "@/lib/analysis/live";
import { apiLecture, error, json, lectureNow } from "@/lib/server";

// POST /api/lectures/:code/transcript  (professor)
//   { text }                 -> one finished phrase from live speech-to-text; the server stamps the time
//   { captions, offsetMs? }  -> a whole .vtt/.srt file (replaces the transcript)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { staff: true });
  if (a instanceof Response) return a;
  const s = a.session;
  const body = await req.json().catch(() => ({}));
  if (typeof body.captions === "string") {
    const segs = parseCaptions(body.captions, Number(body.offsetMs ?? 0));
    if (!segs.length) return error("No captions found in that file");
    await clearTranscript(s.id);
    await addTranscript(s.id, segs);
    return json({ ok: true, segments: segs.length });
  }
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) return error("empty text");
  if (s.ended_at) return error("This lecture has ended", 409);
  // A finished phrase arrives just after it was spoken; estimate its start from its length (~2.5 words/s).
  const end = lectureNow(s);
  const words = text.split(/\s+/).length;
  await addTranscript(s.id, [{ start_ms: Math.max(0, end - (words / 2.5) * 1000), end_ms: end, text }]);
  after(() => refreshSummary(s.id).catch((e) => console.error("summary", e)));
  return json({ ok: true, t_ms: end });
}
