import { analyzeSession } from "@/lib/pipeline";
import { error, isAdmin, json, sessionFrom } from "@/lib/api";
import { publicReport } from "@/lib/analysis/report";

export const maxDuration = 300; // the Claude call can take a minute on long lectures

// POST /api/sessions/:code/analyze  (professor) -> builds and stores the report
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);
  const report = await analyzeSession(s);
  return json(publicReport(report));
}
