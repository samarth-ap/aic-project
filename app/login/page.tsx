import { redirect } from "next/navigation";
import { currentUser, emailLoginAvailable, safeNext } from "@/lib/auth";
import EmailLogin from "./EmailLogin";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  // No email service on this server: send people back to the welcome screen's other sign-in options.
  if (!emailLoginAvailable()) redirect(`/?next=${encodeURIComponent(next)}`);
  return <EmailLogin next={next} />;
}
