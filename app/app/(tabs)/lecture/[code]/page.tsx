import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/server";
import { studentLecture } from "@/lib/views";
import { minutesLong } from "@/lib/format";
import LectureReplay from "./LectureReplay";

export const dynamic = "force-dynamic";

export default async function LecturePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params;
  const t = Number((await searchParams).t ?? 0) || 0;
  const u = await requireUser(`/app/lecture/${code}`);
  const v = await studentLecture(u, code);
  if (!v) notFound();
  if (v.lecture.status === "live") redirect(`/app/live/${v.lecture.code}`);
  return (
    <>
      <Link className="back" href={`/app/class/${v.cls.code}`}>{v.cls.short}</Link>
      <h1 style={{ fontSize: "1.65rem", marginTop: 12 }}>{v.lecture.title}</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Lecture {v.lecture.no} · {minutesLong(v.lecture.duration_ms)} · {v.lecture.joined_label}
      </p>
      <Link className="btn light sm" href={`/app/map/lecture/${v.lecture.code}`} style={{ marginTop: 16, background: "var(--violet-soft)", color: "var(--violet)" }}>
        Open concept map
      </Link>
      {v.lecture.status === "processing" && <p className="notice" style={{ marginTop: 16 }}>Finding where the class got lost. This takes a few minutes after the lecture ends.</p>}
      <LectureReplay v={v} start={t} />
    </>
  );
}
