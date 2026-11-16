"use client";
import Link from "next/link";
import { fmt, fmtDate } from "@/lib/client";
import type { MyLecture, MyMoment } from "@/lib/classes";

const LEVEL_TEXT: Record<MyLecture["lost_level"], string> = {
  missed: "Missed",
  none: "Didn't get lost",
  "a little": "A little lost",
  some: "Somewhat lost",
  "a lot": "Lost a lot",
};
const LEVEL_FILL: Record<MyLecture["lost_level"], number> = { missed: 0, none: 0, "a little": 0.25, some: 0.6, "a lot": 1 };

/** How lost *this student* was in a lecture. Only shown to them. */
export function LostLevel({ level }: { level: MyLecture["lost_level"] }) {
  return (
    <div className="lost-level" title={LEVEL_TEXT[level]}>
      <span className={`pill ${level === "missed" ? "" : level === "none" ? "ok" : "lost"}`}>{LEVEL_TEXT[level]}</span>
      <div className="lostbar small-bar" aria-hidden="true">
        <span style={{ width: `${LEVEL_FILL[level] * 100}%` }} />
      </div>
    </div>
  );
}

/** One moment this student got lost, with its catch-up card. */
export function StudyItem({ m }: { m: MyMoment }) {
  return (
    <article className="study-item">
      <div className="row small muted" style={{ gap: 8 }}>
        <span className="pill lost">{m.concept}</span>
        <span>
          {m.lecture_title} · {fmtDate(m.lecture_date)} · {fmt(m.start_ms)}
        </span>
      </div>
      <strong>{m.title}</strong>
      <p className="small">{m.explanation.length > 260 ? m.explanation.slice(0, 259) + "…" : m.explanation}</p>
      {m.practice_question && (
        <details className="small">
          <summary>Practice: {m.practice_question}</summary>
          <p style={{ marginTop: 6 }}>{m.practice_answer}</p>
        </details>
      )}
      <Link className="small" href={`/s/${m.lecture_code}/catchup`}>Full card & tutor chat →</Link>
    </article>
  );
}
