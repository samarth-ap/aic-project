import { addTranscript, clearTranscript, getTranscript } from "@/lib/db";
import { parseCaptions } from "@/lib/analysis/transcript";
import { error, isAdmin, json, sessionFrom } from "@/lib/api";

// POST /api/sessions/:code/transcript  (professor)
//   { text }                   -> one live-caption line; server stamps the time
//   { captions, offsetMs? }    -> a whole .vtt/.srt file (replaces the transcript)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);
  const body = await req.json().catch(() => ({}));

  if (typeof body.captions === "string") {
    const segs = parseCaptions(body.captions, Number(body.offsetMs ?? 0));
    if (!segs.length) return error("No captions found in that file");
    clearTranscript(s.id);
    addTranscript(s.id, segs);
    return json({ ok: true, segments: segs.length });
  }

  const text = String(body.text ?? "").trim();
  if (!text) return error("empty text");
  // A finished speech-recognition phrase arrives just after it was spoken.
  // Estimate its start from its length (~2.5 words/sec).
  const end = Date.now() - s.started_at;
  const words = text.split(/\s+/).length;
  addTranscript(s.id, [{ start_ms: Math.max(0, end - (words / 2.5) * 1000), end_ms: end, text }]);
  return json({ ok: true });
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);
  return json(getTranscript(s.id).map(({ start_ms, end_ms, text }) => ({ start_ms, end_ms, text })));
}
