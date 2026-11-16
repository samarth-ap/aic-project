import { endSession } from "@/lib/db";
import { error, json, sessionFrom } from "@/lib/api";
import { canManage } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!(await canManage(req, s))) return error("Professor key required", 403);
  await endSession(s.id);
  return json({ ok: true });
}
