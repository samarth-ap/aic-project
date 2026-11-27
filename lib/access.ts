import type { Role } from "./db";

export const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS ?? "uw.edu")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

export const validEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

export function emailAllowed(email: string): boolean {
  if (!validEmail(email)) return false;
  const domains = allowedDomains();
  return domains.includes("*") || domains.includes(email.toLowerCase().split("@")[1]);
}

export const classGuestSignInEnabled = () => process.env.ENABLE_CLASS_GUEST_EMAILS === "1";

export const canSetClassGuestSignIn = (role: Role | null) =>
  role === "instructor" && classGuestSignInEnabled();

export function classEmailAllowed(email: string, allowGuests: number, role: Role): boolean {
  return emailAllowed(email) || (
    role === "student" && allowGuests === 1 && classGuestSignInEnabled() && validEmail(email)
  );
}
