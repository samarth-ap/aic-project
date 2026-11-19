import { redirect } from "next/navigation";
import { currentUser, safeNext } from "@/lib/auth";
import EmailLogin from "./EmailLogin";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <EmailLogin next={next} />;
}
