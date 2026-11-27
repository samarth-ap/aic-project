import { checkEmailCode } from "@/lib/db";
import { LoginError, safeNext, signInVerifiedEmail } from "@/lib/auth";
import { error, json } from "@/lib/server";

// POST /api/auth/email/verify { email, code, next } -> signs in
export async function POST(req: Request) {
  const { email, code, next } = await req.json().catch(() => ({}));
  const e = String(email ?? "").trim().toLowerCase();
  const c = String(code ?? "").replace(/\D/g, "");
  if (c.length !== 6) return error("Enter the 6-digit code");
  if (!(await checkEmailCode(e, c))) return error("That code didn't work. Check it, or ask for a new one.", 401);
  const destination = safeNext(next);
  try {
    await signInVerifiedEmail(e, destination);
  } catch (err) {
    if (err instanceof LoginError) return error(err.message, 403);
    throw err;
  }
  return json({ ok: true, next: destination });
}
