// Small helpers shared by the API routes.
import { NextResponse } from "next/server";
import { getSession, type Session } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function sessionFrom(params: Promise<{ code: string }>): Promise<Session | null> {
  const { code } = await params;
  return getSession(code) ?? null;
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
