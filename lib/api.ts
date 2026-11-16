// Small helpers shared by the API routes.
import { NextResponse } from "next/server";
import { getSession, type Session } from "./db";
import { actorFor } from "./auth";
import { addMembership, getClassById } from "./db";
import type { User } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function sessionFrom(params: Promise<{ code: string }>): Promise<Session | null> {
  const { code } = await params;
  return await getSession(code) ?? null;
}

/** Professor-only routes need the session's admin key (header `x-admin-key` or `?k=`). */
export function isAdmin(req: Request, session: Session): boolean {
  const key = req.headers.get("x-admin-key") ?? new URL(req.url).searchParams.get("k");
  return key === session.admin_key;
}

/** Public fields only — never send admin_key to students. */
export const publicSession = (s: Session) => ({
  code: s.code,
  title: s.title,
  course: s.course,
  started_at: s.started_at,
  ended_at: s.ended_at,
});

export const validDeviceId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(id);

// ---------- lecture access (students) ----------

/**
 * Resolves who is acting on a lecture (signed-in user or anonymous device).
 * Returns an error response if the deviceId is invalid, or if the lecture's
 * class requires sign-in. With `enroll`, signed-in students are added to the class.
 */
export async function lectureActor(
  req: Request,
  s: Session,
  deviceId: unknown,
  opts: { enroll?: boolean } = {},
): Promise<{ actor: string; user: User | null } | Response> {
  const a = await actorFor(req, deviceId);
  if (!a) return error("bad deviceId");
  if (s.class_id) {
    const c = await getClassById(s.class_id);
    if (c && !c.allow_guests && !a.user) {
      return NextResponse.json({ error: "Sign in with your UW account to join this lecture.", needLogin: true }, { status: 401 });
    }
    if (a.user && opts.enroll) await addMembership(s.class_id, a.user.id, "student");
  }
  return a;
}
