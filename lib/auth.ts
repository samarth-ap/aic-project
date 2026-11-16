// Sign-in with Google, restricted to UW accounts (NetID@uw.edu), plus the
// permission checks the API routes use.
//
// Flow: /api/auth/google -> Google -> /api/auth/callback/google -> cookie.
// The cookie holds a random token; the DB stores only its SHA-256 hash.
// Sessions last 60 days, so people stay signed in ("auto-login").
import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  createAuthSession,
  deleteAuthSession,
  getRole,
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

/** Email domains allowed to sign in. Default: UW only. */
export const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS ?? "uw.edu")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

export const emailAllowed = (email: string) => {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return allowedDomains().includes(domain);
};

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Dev login (type any email, no Google) for local testing. On by default only
 * when Google isn't configured and we're not in production. DEV_LOGIN=1 forces
 * it on — never do that on a public deployment.
 */
export const devLoginEnabled = () =>
  process.env.DEV_LOGIN === "1" || (process.env.DEV_LOGIN !== "0" && !googleConfigured() && process.env.NODE_ENV !== "production");

const secure = () => process.env.NODE_ENV === "production";

// ---------- current user ----------

/** The signed-in user, or null. Rejects cross-site writes (CSRF) for cookie-authenticated requests. */
export async function currentUser(req?: Request): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (req && req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(req.url).host) return null;
  }
  return userForToken(token).catch(() => null);
}

export async function signIn(user: User) {
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
export const safeNext = (next: string | null | undefined) =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";

// ---------- Google OAuth (OpenID Connect, authorization-code flow) ----------

const redirectUri = (req: Request) => `${process.env.PUBLIC_URL ?? new URL(req.url).origin}/api/auth/callback/google`;

export async function googleAuthUrl(req: Request, next: string): Promise<string> {
  const state = crypto.randomBytes(16).toString("base64url");
  (await cookies()).set(STATE_COOKIE, JSON.stringify({ state, next: safeNext(next) }), {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const domains = allowedDomains();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    // Shows only UW accounts in Google's picker. Not a security check by itself (we check the email below).
    ...(domains.length === 1 ? { hd: domains[0] } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export class LoginError extends Error {}

/** Handles Google's redirect back. Returns where to send the user next. */
export async function finishGoogleLogin(req: Request): Promise<string> {
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  let expected: { state: string; next: string } | null = null;
  try {
    expected = saved ? JSON.parse(saved) : null;
  } catch {}
  if (url.searchParams.get("error")) throw new LoginError("Sign-in was cancelled.");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected.state) {
    throw new LoginError("Sign-in expired or was started in another tab. Please try again.");
  }

  // Exchange the code directly with Google over TLS; this response is trusted without verifying a JWT signature.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new LoginError("Google sign-in failed. Please try again.");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) throw new LoginError("Couldn't read your Google profile. Please try again.");
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };

  if (!info.email || !info.email_verified) throw new LoginError("Your Google account has no verified email.");
  if (!emailAllowed(info.email)) {
    throw new LoginError(`Please sign in with your UW account (${allowedDomains().map((d) => "@" + d).join(" or ")}).`);
  }
  const user = await upsertUser(info.email, info.name ?? info.email.split("@")[0], info.picture ?? "");
  await signIn(user);
  return expected.next;
}

// ---------- permissions ----------

/**
 * Who is acting on a lecture: a signed-in user (stable across their devices,
 * so they get a history) or an anonymous device id. Returns null if neither is valid.
 */
export async function actorFor(req: Request, deviceId: unknown): Promise<{ actor: string; user: User | null } | null> {
  const user = await currentUser(req);
  if (user) return { actor: userActorId(user.id), user };
  if (typeof deviceId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(deviceId) && !deviceId.startsWith("user-")) {
    return { actor: deviceId, user: null };
  }
  return null;
}

/** Professor/TA access to a lecture: the lecture's admin key, or being instructor/TA of its class. */
export async function canManage(req: Request, session: Session): Promise<boolean> {
  const key = req.headers.get("x-admin-key") ?? new URL(req.url).searchParams.get("k");
  if (key && key === session.admin_key) return true;
  if (!session.class_id) return false;
  const user = await currentUser(req);
  if (!user) return false;
  const role = await getRole(session.class_id, user.id);
  return role === "instructor" || role === "ta";
}

export const isStaffRole = (r: Role | null) => r === "instructor" || r === "ta";
