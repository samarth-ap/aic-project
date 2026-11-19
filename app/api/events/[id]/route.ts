import { currentUser } from "@/lib/auth";
import { deleteEvent, getEvent, getSessionById, getThread, updateEvent, userActorId } from "@/lib/db";
import { error, json, lectureNow } from "@/lib/server";

async function mine(req: Request, id: string) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const e = await getEvent(Number(id));
  if (!e || e.actor !== userActorId(user.id)) return error("Not found", 404);
  return e;
}

// GET /api/events/:id -> one of my Lost moments with its tutor thread
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await mine(req, (await params).id);
  if (e instanceof Response) return e;
  const s = (await getSessionById(e.session_id))!;
  return json({
    event: { id: e.id, t_ms: e.t_ms, concept: e.concept, status: e.status },
    lecture: { code: s.code, title: s.title, ended: Boolean(s.ended_at) },
    messages: (await getThread(e.id)).map((m) => ({ role: m.role, kind: m.kind, content: m.content, t_ms: m.t_ms })),
  });
}

// PATCH /api/events/:id { status?: "got_it" | "fuzzy", closed?: true }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await mine(req, (await params).id);
  if (e instanceof Response) return e;
  const body = await req.json().catch(() => ({}));
  const s = (await getSessionById(e.session_id))!;
  const f: Parameters<typeof updateEvent>[1] = {};
  if (body.status === "got_it" || body.status === "fuzzy" || body.status === "open") f.status = body.status;
  if (body.closed && e.closed_at_ms == null) f.closed_at_ms = lectureNow(s);
  await updateEvent(e.id, f);
  return json({ ok: true });
}

// DELETE /api/events/:id -> a student deletes their own tutor thread
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await mine(req, (await params).id);
  if (e instanceof Response) return e;
  await deleteEvent(e.id);
  return json({ ok: true });
}
