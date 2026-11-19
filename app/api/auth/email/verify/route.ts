import { checkEmailCode, upsertUser } from "@/lib/db";
import { safeNext, signIn } from "@/lib/auth";
import { error, json } from "@/lib/server";

// POST /api/auth/email/verify { email, code, next } -> signs in
export async function POST(req: Request) {
  const { email, code, next } = await req.json().catch(() => ({}));
  const e = String(email ?? "").trim().toLowerCase();
  const c = String(code ?? "").replace(/\D/g, "");
  if (c.length !== 6) return error("Enter the 6-digit code");
  if (!(await checkEmailCode(e, c))) return error("That code didn't work. Check it, or ask for a new one.", 401);
  await signIn(await upsertUser(e, ""));
  return json({ ok: true, next: safeNext(next) });
}
