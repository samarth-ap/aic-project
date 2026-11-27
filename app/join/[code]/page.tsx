import { redirect } from "next/navigation";
import { addMembership, getClassByCode, getSession, liveSessionsForClasses } from "@/lib/db";
import { requireUser } from "@/lib/server";
import JoinForm from "../JoinForm";

// Opened from the professor's QR code. Joins the class once; if a lecture is live, goes straight into it.
export default async function JoinCode({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const u = await requireUser(`/join/${code}`);
  const c = await getClassByCode(code);
  if (c && await addMembership(c.id, u.id, "student")) {
    const live = await liveSessionsForClasses([c.id]);
    redirect(live[0] ? `/app/live/${live[0].code}` : `/app/class/${c.code}`);
  }
  const s = c ? undefined : await getSession(code);
  if (s?.class_id && await addMembership(s.class_id, u.id, "student")) {
    redirect(s.ended_at ? `/app/lecture/${s.code}` : `/app/live/${s.code}`);
  }
  const initialError = c || s?.class_id
    ? "Use your university email to join this class."
    : "No class or lecture with that code. Check it and try again.";
  return (
    <main className="app no-tabs" style={{ display: "flex", flexDirection: "column" }}>
      <JoinForm initial={code} initialError={initialError} signedInAs={u.email} />
    </main>
  );
}
