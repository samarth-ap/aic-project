import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { lectureNumber } from "@/lib/db";
import { lectureAccess, lectureNow } from "@/lib/server";
import { shortName } from "@/lib/views";
import ProfLive from "./ProfLive";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await currentUser();
  if (!u) redirect(`/?next=${encodeURIComponent(`/teach/live/${code}`)}`);
  const a = await lectureAccess(code, u);
  if (!a?.staff || !a.cls) notFound();
  if (a.session.ended_at) redirect(`/teach/${a.cls.code}/lecture/${a.session.code}`);
  return (
    <ProfLive
      code={a.session.code}
      classCode={a.cls.code}
      title={a.session.title}
      sub={`${shortName(a.cls)} · Lecture ${await lectureNumber(a.session)}`}
      nowMs={lectureNow(a.session)}
      slides={a.session.slides_name}
      liveCountOn={Boolean(a.session.live_count_on)}
    />
  );
}
