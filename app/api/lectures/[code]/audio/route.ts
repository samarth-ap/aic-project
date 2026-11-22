import { audioRuns, purgeExpiredAudio } from "@/lib/db";
import { apiLecture, error, json } from "@/lib/server";

// POST: lecture audio is no longer saved. The professor's laptop only makes a live
// transcript for the tutor; the university's lecture capture (Panopto) keeps the recording.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code, { staff: true });
  if (a instanceof Response) return a;
  return error("Lost and Found doesn't save lecture audio.", 410);
}

// GET /api/lectures/:code/audio -> audio runs saved by older versions, if any (class members)
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code);
  if (a instanceof Response) return a;
  if (a.cls) await purgeExpiredAudio(a.cls.id);
  return json({ runs: await audioRuns(a.session.id) });
}
