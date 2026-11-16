import { createSession, getClassByCode, getRole } from "@/lib/db";
import { currentUser, isStaffRole } from "@/lib/auth";
import { error, json } from "@/lib/api";

// POST /api/sessions  { title, classCode }  -> { code, adminKey }   (instructor/TA of that class)
// POST /api/sessions  { title, course }     -> { code, adminKey }   (one-off lecture, no account; kept for demos)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, 120);
  if (!title) return error("title is required");

  if (body.classCode) {
    const user = await currentUser(req);
    if (!user) return error("Sign in to start a lecture for a class", 401);
    const c = await getClassByCode(String(body.classCode));
    if (!c) return error("Unknown class", 404);
    if (!isStaffRole(await getRole(c.id, user.id))) return error("Only the class's instructors and TAs can start lectures", 403);
    const s = await createSession(title, c.name, Date.now(), { classId: c.id, createdBy: user.id });
    return json({ code: s.code, adminKey: s.admin_key });
  }

  const course = String(body.course ?? "").trim().slice(0, 60);
  const s = await createSession(title, course);
  return json({ code: s.code, adminKey: s.admin_key });
}
