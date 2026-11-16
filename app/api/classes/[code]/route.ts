import { getClassByCode, getRole, roster, sessionsForActor, sessionsForClass, updateClass, userActorId } from "@/lib/db";
import { currentUser, isStaffRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { lectureSummaries, myLectures } from "@/lib/classes";

type Params = { params: Promise<{ code: string }> };

// GET /api/classes/:code
//   staff   -> lectures with class-wide stats, roster (names only), codes
//   student -> lectures with *their own* activity
export async function GET(req: Request, { params }: Params) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const c = await getClassByCode((await params).code);
  if (!c) return error("No class with that code", 404);
  const role = await getRole(c.id, user.id);
  if (!role) return json({ joined: false, name: c.name, term: c.term }, 403);

  const sessions = await sessionsForClass(c.id);
  const base = { joined: true, code: c.code, name: c.name, term: c.term, role, allow_guests: Boolean(c.allow_guests) };
  if (isStaffRole(role)) {
    const lectures = (await lectureSummaries(sessions)).map((x) => x.sum);
    const people = await roster(c.id);
    return json({
      ...base,
      ...(role === "instructor" ? { staff_code: c.staff_code } : {}),
      lectures,
      roster: people,
      counts: {
        students: people.filter((p) => p.role === "student").length,
        staff: people.filter((p) => p.role !== "student").length,
      },
    });
  }
  const actor = userActorId(user.id);
  const attended = new Set((await sessionsForActor(actor)).map((s) => s.id));
  return json({ ...base, lectures: await myLectures(actor, sessions, attended) });
}

// PATCH /api/classes/:code { name?, term?, allow_guests? }  (instructor)
export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const c = await getClassByCode((await params).code);
  if (!c) return error("No class with that code", 404);
  if ((await getRole(c.id, user.id)) !== "instructor") return error("Only the instructor can change class settings", 403);
  const b = await req.json().catch(() => ({}));
  await updateClass(c.id, {
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : undefined,
    term: typeof b.term === "string" ? b.term.trim().slice(0, 40) : undefined,
    allow_guests: typeof b.allow_guests === "boolean" ? b.allow_guests : undefined,
  });
  return json({ ok: true });
}
