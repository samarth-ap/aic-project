// Class-level views: lecture summaries for staff, and a student's own history.
//
// Privacy rule: staff get class-wide numbers and the roster (names), never
// per-student activity. A student only ever sees their own activity.
import { hashDevice, type Report } from "./analysis/report";
import { getReport, myChatCounts, myTapCounts, type Session } from "./db";

export interface LectureSummary {
  code: string;
  title: string;
  started_at: number;
  ended_at: number | null;
  analyzed: boolean;
  students: number;
  lost_students: number | null;
  lost_taps: number | null;
  moments: number;
  peak_share: number;
  /** Most-confusing concepts, by share of students lost. */
  top_concepts: { name: string; confusion: number }[];
}

export async function lectureSummaries(sessions: Session[]): Promise<{ s: Session; r: Report | null; sum: LectureSummary }[]> {
  return Promise.all(
    sessions.map(async (s) => {
      const r = await getReport<Report>(s.id);
      const sum: LectureSummary = {
        code: s.code,
        title: s.title,
        started_at: s.started_at,
        ended_at: s.ended_at,
        analyzed: Boolean(r),
        students: r?.stats.active_devices ?? 0,
        lost_students: r?.stats.lost_students ?? null,
        lost_taps: r?.stats.lost_taps ?? null,
        moments: r?.moments.length ?? 0,
        peak_share: r ? Math.max(0, ...r.moments.map((m) => m.share)) : 0,
        top_concepts: r
          ? [...r.concepts]
              .filter((c) => c.confusion > 0)
              .sort((a, b) => b.confusion - a.confusion)
              .slice(0, 3)
              .map((c) => ({ name: c.name, confusion: c.confusion }))
          : [],
      };
      return { s, r, sum };
    }),
  );
}

export interface MyMoment {
  lecture_code: string;
  lecture_title: string;
  lecture_date: number;
  start_ms: number;
  concept: string;
  share: number;
  title: string;
  explanation: string;
  practice_question: string;
  practice_answer: string;
}

export interface MyLecture {
  code: string;
  title: string;
  started_at: number;
  ended_at: number | null;
  analyzed: boolean;
  my_lost: number;
  my_too_fast: number;
  my_example: number;
  my_got_it: number;
  my_chats: number;
  /** The moments in this lecture where I tapped, with my catch-up card. */
  my_moments: MyMoment[];
  /** How lost I was, from my taps and the confusion moments I was part of. */
  lost_level: "missed" | "none" | "a little" | "some" | "a lot";
  attended: boolean;
}

/** `attended`: ids of lectures this actor joined; others show as "missed". Omit when all were attended. */
export async function myLectures(actor: string, sessions: Session[], attended?: Set<number>): Promise<MyLecture[]> {
  const ids = sessions.map((s) => s.id);
  const [taps, chats] = await Promise.all([myTapCounts(actor, ids), myChatCounts(actor, ids)]);
  const me = hashDevice(actor);
  return Promise.all(
    sessions.map(async (s) => {
      const r = await getReport<Report>(s.id);
      const t = taps.get(s.id) ?? {};
      const mine = r ? r.moments.filter((m) => r.private.moment_devices[m.id]?.includes(me)) : [];
      const lost = (t.lost ?? 0) + (t.too_fast ?? 0) + (t.example ?? 0);
      const wasThere = !attended || attended.has(s.id) || lost > 0 || (chats.get(s.id) ?? 0) > 0;
      const level: MyLecture["lost_level"] = !wasThere
        ? "missed"
        : lost === 0
          ? "none"
          : mine.length >= 3 || lost >= 6 ? "a lot" : mine.length >= 1 || lost >= 3 ? "some" : "a little";
      return {
        code: s.code,
        title: s.title,
        started_at: s.started_at,
        ended_at: s.ended_at,
        analyzed: Boolean(r),
        my_lost: t.lost ?? 0,
        my_too_fast: t.too_fast ?? 0,
        my_example: t.example ?? 0,
        my_got_it: t.got_it ?? 0,
        my_chats: chats.get(s.id) ?? 0,
        my_moments: mine.map((m) => ({
          lecture_code: s.code,
          lecture_title: s.title,
          lecture_date: s.started_at,
          start_ms: m.start_ms,
          concept: m.concept_name,
          share: m.share,
          ...m.catch_up,
        })),
        lost_level: level,
        attended: wasThere,
      };
    }),
  );
}

/** Offline "what to study": my moments, most recent lectures first, one per concept. */
export function studyListFromMoments(moments: MyMoment[], limit = 6): MyMoment[] {
  const seen = new Set<string>();
  return [...moments]
    .sort((a, b) => b.lecture_date - a.lecture_date || b.share - a.share)
    .filter((m) => {
      const k = m.concept.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
