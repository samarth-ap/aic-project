import { endSession } from "@/lib/db";
import { error, isAdmin, json, sessionFrom } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("Not found", 404);
  if (!isAdmin(req, s)) return error("Professor key required", 403);
  endSession(s.id);
  return json({ ok: true });
}
