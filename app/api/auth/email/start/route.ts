import { createEmailCode, lastEmailCodeSent } from "@/lib/db";
import { validEmail } from "@/lib/access";
import { emailSignInAllowed, emailSignInMessage, LoginError, sendEmailCode } from "@/lib/auth";
import { error, json } from "@/lib/server";

// POST /api/auth/email/start { email, next? } -> emails a 6-digit code (or returns it in dev mode)
export async function POST(req: Request) {
  const { email, next } = await req.json().catch(() => ({}));
  const e = String(email ?? "").trim().toLowerCase();
  if (!validEmail(e)) return error("Enter your email address");
  if (!(await emailSignInAllowed(e, next))) return error(emailSignInMessage());
  const last = await lastEmailCodeSent(e);
  if (last && Date.now() - last < 30_000) return error("We just sent a code. Wait a few seconds before asking again.", 429);
  try {
    const code = await createEmailCode(e);
    const { devCode } = await sendEmailCode(e, code);
    return json({ ok: true, resendInS: 45, ...(devCode ? { devCode } : {}) });
  } catch (err) {
    return error(err instanceof LoginError ? err.message : "Couldn't send the code. Try again.", 500);
  }
}
