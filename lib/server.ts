// Shared server-side helpers for pages, server actions and API routes.
//
// Privacy rules enforced here and in lib/views.ts:
// - Professors never see which student tapped Lost: only counts and shares.
// - Students see only their own moments and chats; class data has no names.
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { currentUser, isStaffRole } from "./auth";
import { addMembership, getClassById, getRole, getSession, userActorId, type Class, type Role, type Session, type User } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Pages: the signed-in user, or a redirect to the welcome screen. */
export async function requireUser(next?: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(next ? `/?next=${encodeURIComponent(next)}` : "/");
  return u;
}

export interface LectureAccess {
  session: Session;
  cls: Class | null;
  user: User;
  role: Role | null;
  staff: boolean;
  actor: string;
}

/**
 * Who may open a lecture: staff of its class, or any signed-in student (joining
 * a lecture by its code enrolls them in the class, as with Slido).
 */
export async function lectureAccess(
  code: string,
  user: User | null,
  opts: { enroll?: boolean } = {},
): Promise<LectureAccess | null> {
  if (!user) return null;
  const session = await getSession(code);
  if (!session) return null;
  const cls = session.class_id ? ((await getClassById(session.class_id)) ?? null) : null;
  let role = cls ? await getRole(cls.id, user.id) : null;
  if (cls && !role && opts.enroll) {
    await addMembership(cls.id, user.id, "student");
    role = "student";
  }
  if (cls && !role) return null;
  return { session, cls, user, role, staff: isStaffRole(role), actor: userActorId(user.id) };
}

/** API routes: the lecture for a signed-in member, or an error response. */
export async function apiLecture(req: Request, code: string, opts: { staff?: boolean; enroll?: boolean } = {}): Promise<LectureAccess | Response> {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const a = await lectureAccess(code, user, { enroll: opts.enroll });
  if (!a) return error("No lecture with that code", 404);
  if (opts.staff && !a.staff) return error("Only the class's professor or TAs can do that", 403);
  return a;
}

/** Lecture time now (ms from the start of the recording), frozen once it ends. */
export const lectureNow = (s: Session) => (s.ended_at ?? Date.now()) - s.started_at;

export { fmtClock } from "./format";
