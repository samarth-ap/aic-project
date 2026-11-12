import { createSession } from "@/lib/db";
import { error, json } from "@/lib/api";

// POST /api/sessions  { title, course }  -> { code, adminKey }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, 120);
  const course = String(body.course ?? "").trim().slice(0, 60);
  if (!title) return error("title is required");
  const s = createSession(title, course);
  return json({ code: s.code, adminKey: s.admin_key });
}
