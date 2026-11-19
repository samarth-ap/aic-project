import { audioData } from "@/lib/db";
import { apiLecture, error } from "@/lib/server";

// GET /api/lectures/:code/audio/:run -> the audio of one recording run (class members)
export async function GET(req: Request, { params }: { params: Promise<{ code: string; run: string }> }) {
  const { code, run } = await params;
  const a = await apiLecture(req, code);
  if (a instanceof Response) return a;
  const audio = await audioData(a.session.id, run);
  if (!audio) return error("No audio", 404);
  return new Response(audio.data as unknown as BodyInit, {
    headers: { "content-type": audio.mime, "content-length": String(audio.data.length), "cache-control": "private, max-age=3600" },
  });
}
