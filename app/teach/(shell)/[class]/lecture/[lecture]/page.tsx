import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/server";
import { staffLecture } from "@/lib/views";
import { minutesLong } from "@/lib/format";
import LectureTabs from "./LectureTabs";

export const dynamic = "force-dynamic";

export default async function ProfLecture({ params, searchParams }: { params: Promise<{ class: string; lecture: string }>; searchParams: Promise<{ tab?: string; t?: string }> }) {
  const { class: cls, lecture } = await params;
  const sp = await searchParams;
  const u = await requireUser(`/teach/${cls}/lecture/${lecture}`);
  const v = await staffLecture(u, lecture);
  if (!v) notFound();
  if (v.cls.code !== cls) redirect(`/teach/${v.cls.code}/lecture/${lecture}`);
  if (v.lecture.status === "live") redirect(`/teach/live/${lecture}`);
  const tab = sp.tab === "recording" || sp.tab === "clarifications" ? sp.tab : "insights";
  const base = `/teach/${cls}/lecture/${lecture}`;
  return (
    <>
      <div className="between" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="crumb">
            <Link href={`/teach/${cls}`}>{v.cls.short}</Link> › Lecture {v.lecture.no} · {minutesLong(v.lecture.duration_ms)} · {v.lecture.joined} student{v.lecture.joined === 1 ? "" : "s"} joined
          </p>
          <h1>{v.lecture.title}</h1>
        </div>
        <nav className="segmented" aria-label="Lecture views">
          <Link className={tab === "insights" ? "on" : ""} href={base}>Insights</Link>
          <Link className={tab === "recording" ? "on" : ""} href={`${base}?tab=recording`}>Recording</Link>
          <Link className={tab === "clarifications" ? "on" : ""} href={`${base}?tab=clarifications`}>Clarifications</Link>
        </nav>
      </div>
      <LectureTabs v={v} tab={tab} start={Number(sp.t ?? 0) || 0} base={base} />
    </>
  );
}
