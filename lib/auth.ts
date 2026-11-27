// Sign-in (Google, Apple, or a 6-digit email code) and the permission checks
// used by pages, server actions and API routes.
//
// The cookie holds a random token; the DB stores only its SHA-256 hash.
// Sessions last 60 days, so people stay signed in on their phone.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { allowedDomains, classEmailAllowed, classGuestSignInEnabled, emailAllowed, validEmail } from "./access";
import {
  addMembership,
  classesForUser,
  createAuthSession,
  deleteAuthSession,
  getClassByCode,
  getRole,
  getUserByEmail,
  upsertUser,
  userActorId,
  userForToken,
  type Role,
  type Session,
  type User,
} from "./db";

export const SESSION_COOKIE = "lf_session";
const STATE_COOKIE = "lf_oauth";
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export { allowedDomains, emailAllowed } from "./access";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const appleConfigured = () =>
  Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/**
 * Local testing without an email provider: the 6-digit code is shown on screen
 * instead of emailed. On by default only outside production when no email
 * provider is set. DEV_LOGIN=1 forces it on — never on a public deployment.
 */
export const devLoginEnabled = () =>
  process.env.DEV_LOGIN === "1" || (process.env.DEV_LOGIN !== "0" && !emailConfigured() && process.env.NODE_ENV !== "production");

/**
 * Email-code sign-in works only with an email service (Resend) or in dev mode.
 * When it can't send codes (e.g. a deployment without RESEND_API_KEY), the app hides it.
 */
export const emailLoginAvailable = () => emailConfigured() || devLoginEnabled();

const secure = () => process.env.NODE_ENV === "production";

// ---------- current user ----------

async function accountMaySignIn(user: User): Promise<boolean> {
  return emailAllowed(user.email) || (classGuestSignInEnabled() && (await classesForUser(user.id)).length > 0);
}

/** The signed-in user, or null. Rejects cross-site writes (CSRF) for cookie-authenticated requests. */
export async function currentUser(req?: Request): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (req && req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(req.url).host) return null;
  }
  return userForToken(token)
    .then(async (user) => (user && await accountMaySignIn(user) ? user : null))
    .catch(() => null);
}

async function signIn(user: User) {
  const token = await createAuthSession(user.id, SESSION_TTL_MS);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteAuthSession(token).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/** Only same-site relative paths, so the login can't be used as an open redirect. */
export const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/home";

export class LoginError extends Error {}

export function emailSignInMessage(): string {
  const university = `Use your university email (${allowedDomains().map((domain) => `@${domain}`).join(" or ")})`;
  return classGuestSignInEnabled()
    ? `${university} or open an invite link for a class that allows guest email sign-in.`
    : `${university}.`;
}

async function emailSignInAccess(email: string, next: unknown): Promise<{ classId: number | null } | null> {
  if (emailAllowed(email)) return { classId: null };
  if (!classGuestSignInEnabled() || !validEmail(email)) return null;

  const code = /^\/join\/([a-z0-9]{6})\/?(?:[?#]|$)/i.exec(safeNext(next))?.[1];
  const invited = code ? await getClassByCode(code) : undefined;
  if (invited && classEmailAllowed(email, invited.allow_guests, "student")) return { classId: invited.id };

  const user = await getUserByEmail(email);
  return user && await accountMaySignIn(user) ? { classId: null } : null;
}

export async function emailSignInAllowed(email: string, next: unknown): Promise<boolean> {
  return Boolean(await emailSignInAccess(email, next));
}

/** Called only after the email code or OAuth provider has verified the address. */
export async function signInVerifiedEmail(email: string, next: unknown, name = "", picture = "") {
  const access = await emailSignInAccess(email, next);
  if (!access) throw new LoginError(emailSignInMessage());

  const user = await upsertUser(email, name, picture);
  if (access.classId !== null && !(await addMembership(access.classId, user.id, "student"))) {
    throw new LoginError(emailSignInMessage());
  }
  if (!(await accountMaySignIn(user))) throw new LoginError(emailSignInMessage());
  await signIn(user);
}

// ---------- email code ----------

/** Sends the sign-in code. Returns the code itself only in dev mode (shown on screen). */
export async function sendEmailCode(email: string, code: string): Promise<{ devCode?: string }> {
  if (emailConfigured()) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `${code} is your Lost and Found code`,
        text: `Your Lost and Found sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
      }),
    });
    if (!res.ok) throw new LoginError("We couldn't send the email. Try again in a minute.");
    return {};
  }
  if (devLoginEnabled()) {
    console.log(`[dev] sign-in code for ${email}: ${code}`);
    return { devCode: code };
  }
  throw new LoginError("Email sign-in isn't set up on this server yet.");
}

// ---------- OAuth (Google, Apple) ----------

// The address the browser used, so the callback comes back to the same site (and its cookies).
// PUBLIC_URL is only for links shown to others (the QR code), not for sign-in.
const origin = (req: Request) => process.env.AUTH_URL ?? new URL(req.url).origin;

async function saveState(next: string): Promise<string> {
  const state = crypto.randomBytes(16).toString("base64url");
  (await cookies()).set(STATE_COOKIE, JSON.stringify({ state, next: safeNext(next) }), {
    httpOnly: true,
    secure: secure(),
    // Apple posts the callback cross-site, so its state cookie must be SameSite=None.
    sameSite: secure() ? "none" : "lax",
    path: "/",
    maxAge: 600,
  });
  return state;
}
async function takeState(got: string | null): Promise<string> {
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  let expected: { state: string; next: string } | null = null;
  try {
    expected = saved ? JSON.parse(saved) : null;
  } catch {}
  if (!got || !expected || got !== expected.state) throw new LoginError("Sign-in expired or was started in another tab. Please try again.");
  return expected.next;
}

async function finishWithEmail(email: string | undefined, verified: boolean, next: string, name: string, picture = ""): Promise<void> {
  if (!email || !verified) throw new LoginError("Your account has no verified email.");
  await signInVerifiedEmail(email, next, name, picture);
}

export async function googleAuthUrl(req: Request, next: string): Promise<string> {
  const state = await saveState(next);
  const domains = allowedDomains();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin(req)}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    ...(!classGuestSignInEnabled() && domains.length === 1 && domains[0] !== "*" ? { hd: domains[0] } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function finishGoogleLogin(req: Request): Promise<string> {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) throw new LoginError("Sign-in was cancelled.");
  const next = await takeState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!code) throw new LoginError("Sign-in failed. Please try again.");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin(req)}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new LoginError("Google sign-in failed. Please try again.");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new LoginError("Couldn't read your Google profile. Please try again.");
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
  await finishWithEmail(info.email, Boolean(info.email_verified), next, info.name ?? "", info.picture ?? "");
  return next;
}

/** Apple's client secret is a short-lived ES256 JWT signed with the team's key. */
function appleClientSecret(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: process.env.APPLE_KEY_ID });
  const body = b64({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: process.env.APPLE_CLIENT_ID });
  const key = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

export async function appleAuthUrl(req: Request, next: string): Promise<string> {
  const state = await saveState(next);
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!,
    redirect_uri: `${origin(req)}/api/auth/callback/apple`,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params}`;
}

export async function finishAppleLogin(req: Request): Promise<string> {
  const form = await req.formData();
  if (form.get("error")) throw new LoginError("Sign-in was cancelled.");
  const next = await takeState(String(form.get("state") ?? ""));
  const code = String(form.get("code") ?? "");
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_CLIENT_ID!,
      client_secret: appleClientSecret(),
      redirect_uri: `${origin(req)}/api/auth/callback/apple`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new LoginError("Apple sign-in failed. Please try again.");
  // The id_token comes straight from Apple over TLS in exchange for our secret, so its payload is trusted.
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  const claims = JSON.parse(Buffer.from(String(id_token).split(".")[1] ?? "", "base64url").toString() || "{}") as {
    email?: string;
    email_verified?: boolean | string;
  };
  let name = "";
  try {
    const u = JSON.parse(String(form.get("user") ?? "{}"));
    name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(" ");
  } catch {}
  await finishWithEmail(claims.email, claims.email_verified === true || claims.email_verified === "true", next, name);
  return next;
}

// ---------- permissions ----------

/** The id a student's taps and chats are stored under. Students must be signed in. */
export const actorOf = (user: User) => userActorId(user.id);

/** Professor/TA access to a lecture: being instructor or TA of its class (or the lecture's key, for scripts). */
export async function canManage(req: Request | null, session: Session, user?: User | null): Promise<boolean> {
  if (req) {
    const key = req.headers.get("x-admin-key") ?? new URL(req.url).searchParams.get("k");
    if (key && key === session.admin_key) return true;
  }
  if (!session.class_id) return false;
  const u = user === undefined ? await currentUser(req ?? undefined) : user;
  if (!u) return false;
  return isStaffRole(await getRole(session.class_id, u.id));
}

export const isStaffRole = (r: Role | null) => r === "instructor" || r === "ta";
