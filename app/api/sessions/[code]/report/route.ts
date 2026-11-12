import { getReport } from "@/lib/db";
import { error, isAdmin, json, sessionFrom } from "@/lib/api";
import { publicReport, type Report } from "@/lib/analysis/report";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);
  const r = getReport<Report>(s.id);
  return r ? json(publicReport(r)) : error("Not analyzed yet", 404);
}
