import { getReport, listSessions } from "@/lib/db";
import { error, json } from "@/lib/api";
import { courseTrends } from "@/lib/analysis/trends";
import type { Report } from "@/lib/analysis/report";

// GET /api/courses/trends?course=MATH 208&k=<admin key of any lecture in that course>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const course = url.searchParams.get("course") ?? "";
  const key = req.headers.get("x-admin-key") ?? url.searchParams.get("k");
  const sessions = listSessions(course);
  if (!course || !sessions.length) return error("Unknown course", 404);
  if (!sessions.some((s) => s.admin_key === key)) return error("Professor key required", 403);

  const reports = sessions
    .map((s) => ({ report: getReport<Report>(s.id), started_at: s.started_at }))
    .filter((r): r is { report: Report; started_at: number } => r.report !== null);
  return json({
    course,
    lectures: reports.map((r) => ({
      code: r.report.session.code,
      title: r.report.session.title,
      date: r.started_at,
      moments: r.report.moments.length,
      peak_share: Math.max(0, ...r.report.moments.map((m) => m.share)),
    })),
    topics: await courseTrends(reports),
  });
}
