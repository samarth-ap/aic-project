import { createClass } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

// POST /api/classes { name, term } -> new class; the creator becomes its instructor.
export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const term = String(body.term ?? "").trim().slice(0, 40);
  if (!name) return error("Class name is required");
  const c = await createClass(name, term, user.id);
  return json({ code: c.code, staff_code: c.staff_code });
}
