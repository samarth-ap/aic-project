import { addAudioChunk, audioRuns, purgeExpiredAudio } from "@/lib/db";
import { apiLecture, error, json } from "@/lib/server";

const MAX_CHUNK = 4 * 1024 * 1024;

// POST /api/lectures/:code/audio?run=<id>&start=<lecture ms>&seq=<n>  (professor, raw audio body)
// The professor's app records in ~10 s chunks; a "run" is one continuous recording
// (a new run starts if the page reloads). Chunks that fail to upload are retried.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { staff: true });
  if (a instanceof Response) return a;
  const u = new URL(req.url);
  const run = u.searchParams.get("run") ?? "";
  const start = Number(u.searchParams.get("start"));
  const seq = Number(u.searchParams.get("seq"));
  if (!/^[a-zA-Z0-9-]{4,64}$/.test(run) || !Number.isFinite(start) || !Number.isInteger(seq)) return error("bad chunk");
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length) return json({ ok: true });
  if (data.length > MAX_CHUNK) return error("chunk too large", 413);
  const mime = (req.headers.get("content-type") ?? "audio/webm").split(";")[0];
  await addAudioChunk(a.session.id, run, start, seq, mime, data);
  return json({ ok: true });
}

// GET /api/lectures/:code/audio -> the recording's runs (class members)
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code);
  if (a instanceof Response) return a;
  if (a.cls) await purgeExpiredAudio(a.cls.id);
  return json({ runs: await audioRuns(a.session.id) });
}
