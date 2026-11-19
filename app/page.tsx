import Link from "next/link";
import { redirect } from "next/navigation";
import { appleConfigured, currentUser, googleConfigured, safeNext } from "@/lib/auth";
import { IconBulb } from "@/components/icons";

// Welcome / sign-in.
export default async function Welcome({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next);
  const q = `next=${encodeURIComponent(next)}`;
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
          {googleConfigured() && (
            <a className="btn light block lg" href={`/api/auth/google?${q}`}>
              Continue with Google
            </a>
          )}
          {appleConfigured() && (
            <a className="btn light block lg" href={`/api/auth/apple?${q}`}>
              Continue with Apple
            </a>
          )}
          <Link className="btn outline-light block lg" href={`/login?${q}`}>
            Use my email
          </Link>
        </div>
        <p className="center small" style={{ color: "#cfcaf5", marginTop: 22, lineHeight: 1.6 }}>
          We email you a 6-digit code. No password.
          <br />
          I&apos;m a professor ·{" "}
          <Link href={`/login?next=${encodeURIComponent("/teach")}`} style={{ color: "var(--gold)", textDecoration: "underline" }}>
            Set up a class
          </Link>
        </p>
      </main>
    </div>
  );
}
