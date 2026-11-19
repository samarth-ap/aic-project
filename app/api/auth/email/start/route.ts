import { createEmailCode, lastEmailCodeSent } from "@/lib/db";
import { allowedDomains, emailAllowed, LoginError, sendEmailCode } from "@/lib/auth";
import { error, json } from "@/lib/server";

// POST /api/auth/email/start { email } -> emails a 6-digit code (or returns it in dev mode)
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return error("Enter your email address");
  if (!emailAllowed(e)) return error(`Use your university email (${allowedDomains().map((d) => "@" + d).join(" or ")})`);
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
