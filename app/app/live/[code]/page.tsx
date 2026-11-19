import { notFound, redirect } from "next/navigation";
import { getPrefs, lectureNumber } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { lectureAccess, lectureNow } from "@/lib/server";
import { shortName } from "@/lib/views";
import LiveLecture from "./LiveLecture";

export const dynamic = "force-dynamic";

// The live lecture screen: one big red Lost button.
export default async function Live({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await currentUser();
  if (!u) redirect(`/?next=${encodeURIComponent(`/app/live/${code}`)}`);
  const a = await lectureAccess(code, u, { enroll: true });
  if (!a) notFound();
  if (a.session.ended_at) redirect(`/app/lecture/${a.session.code}`);
  if (a.staff) redirect(`/teach/live/${a.session.code}`);
  const prefs = await getPrefs(u.id);
  return (
    <LiveLecture
      code={a.session.code}
      title={a.session.title}
      sub={`${a.cls ? shortName(a.cls) : a.session.course} · Lecture ${await lectureNumber(a.session)}`}
      classCode={a.cls?.code ?? null}
      nowMs={lectureNow(a.session)}
      dark={prefs.dark_live}
    />
  );
}
