import { upsertUser } from "@/lib/db";
import { devLoginEnabled, emailAllowed, allowedDomains, safeNext, signIn } from "@/lib/auth";
import { error, json } from "@/lib/api";

// POST /api/auth/dev { email, name, next }  — local testing only (see devLoginEnabled).
export async function POST(req: Request) {
  if (!devLoginEnabled()) return error("Not found", 404);
  const { email, name, next } = await req.json().catch(() => ({}));
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) return error("Enter an email");
  if (!emailAllowed(e)) return error(`Use a ${allowedDomains().map((d) => "@" + d).join(" / ")} email`);
  const user = await upsertUser(e, String(name ?? ""));
  await signIn(user);
  return json({ ok: true, next: safeNext(next) });
}
