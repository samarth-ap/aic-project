import { getClassByCode, getReport, getRole, sessionsForClass } from "@/lib/db";
import { currentUser, isStaffRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { courseTrends } from "@/lib/analysis/trends";
import type { Report } from "@/lib/analysis/report";

export const maxDuration = 120;

// GET /api/classes/:code/trends  (instructor/TA) -> topics across the quarter, ranked by confusion
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const c = await getClassByCode((await params).code);
  if (!c) return error("No class with that code", 404);
  if (!isStaffRole(await getRole(c.id, user.id))) return error("Instructors and TAs only", 403);
  const sessions = await sessionsForClass(c.id);
  const reports = (
    await Promise.all(sessions.map(async (s) => ({ report: await getReport<Report>(s.id), started_at: s.started_at })))
  ).filter((r): r is { report: Report; started_at: number } => r.report !== null);
  return json({ topics: await courseTrends(reports) });
}
