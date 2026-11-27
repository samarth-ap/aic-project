import Link from "next/link";
import { redirect } from "next/navigation";
import { classGuestSignInEnabled } from "@/lib/access";
import { appleConfigured, currentUser, emailLoginAvailable, googleConfigured, safeNext } from "@/lib/auth";
import { IconBulb } from "@/components/icons";

// Welcome / sign-in.
export default async function Welcome({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next);
  const q = `next=${encodeURIComponent(next)}`;
  const email = emailLoginAvailable();
  const google = googleConfigured();
  // Professors sign in the same way, then land on their classes (or "New class").
  const teachNext = `next=${encodeURIComponent("/teach")}`;
  const profHref = email ? `/login?${teachNext}` : google ? `/api/auth/google?${teachNext}` : `/?${teachNext}`;
  return (
    <div className="welcome">
      <main className="app no-tabs">
        <div style={{ color: "var(--gold)", marginTop: 40 }}>
          <IconBulb size={46} />
        </div>
        <h1>
          Lost <span>and found.</span>
        </h1>
        <p className="lede">Lose the thread in a lecture? Tap once and get back on track in under a minute.</p>
        {sp.deleted && <p className="notice dark" style={{ marginTop: 20 }}>Your data has been deleted.</p>}
        {sp.error && <p className="notice warn" style={{ marginTop: 20 }}>{sp.error}</p>}
        <div style={{ flex: 1, minHeight: 60 }} />
        <div className="stack">
          {google && (
            <a className="btn light block lg" href={`/api/auth/google?${q}`}>
              Continue with Google
            </a>
          )}
          {appleConfigured() && (
            <a className="btn light block lg" href={`/api/auth/apple?${q}`}>
              Continue with Apple
            </a>
          )}
          {email && (
            <Link className="btn outline-light block lg" href={`/login?${q}`}>
              Use my email
            </Link>
          )}
          {!email && !google && !appleConfigured() && (
            <p className="notice warn">Sign-in isn&apos;t set up on this server yet (add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
          )}
        </div>
        <p className="center small" style={{ color: "#cfcaf5", marginTop: 22, lineHeight: 1.6 }}>
          {email ? "We email you a 6-digit code. No password." : classGuestSignInEnabled() ? "Sign in with a university or invited guest account." : "Sign in with your UW Google account."}
          <br />
          I&apos;m a professor ·{" "}
          <Link href={profHref} style={{ color: "var(--gold)", textDecoration: "underline" }}>
            Set up a class
          </Link>
        </p>
      </main>
    </div>
  );
}
