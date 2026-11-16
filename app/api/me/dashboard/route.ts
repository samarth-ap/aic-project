import { classesForUser, sessionsForActor, sessionsForClass, userActorId } from "@/lib/db";
import { currentUser, isStaffRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { lectureSummaries, myLectures, studyListFromMoments } from "@/lib/classes";

// GET /api/me/dashboard -> everything for the signed-in user's dashboard.
export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const actor = userActorId(user.id);
  const classes = await classesForUser(user.id);

  // Lectures I attended (in any class, or one-off lectures), with my own activity.
  const attended = await sessionsForActor(actor);
  const mine = await myLectures(actor, attended.slice(0, 40));
  const byClass = new Map(attended.map((s) => [s.code, s.class_id]));
  const allMoments = mine.flatMap((l) => l.my_moments);

  const teaching = await Promise.all(
    classes
      .filter((c) => isStaffRole(c.role))
      .map(async (c) => {
        const sessions = await sessionsForClass(c.id);
        const recent = (await lectureSummaries(sessions.slice(0, 5))).map((x) => x.sum);
        return { code: c.code, name: c.name, term: c.term, role: c.role, lecture_count: sessions.length, live: recent.filter((l) => !l.ended_at), recent };
      }),
  );
  const learning = classes
    .filter((c) => c.role === "student")
    .map((c) => {
      const ls = mine.filter((l) => byClass.get(l.code) === c.id);
      return {
        code: c.code,
        name: c.name,
        term: c.term,
        lectures_attended: ls.length,
        lost_taps: ls.reduce((n, l) => n + l.my_lost + l.my_too_fast + l.my_example, 0),
        moments: ls.reduce((n, l) => n + l.my_moments.length, 0),
        live: ls.filter((l) => !l.ended_at).map((l) => ({ code: l.code, title: l.title })),
      };
    });

  return json({
    user: { name: user.name, email: user.email },
    teaching,
    learning,
    recent_lectures: mine.slice(0, 12),
    study_next: studyListFromMoments(allMoments, 5),
    totals: {
      lectures: mine.length,
      lost_taps: mine.reduce((n, l) => n + l.my_lost + l.my_too_fast + l.my_example, 0),
      chats: mine.reduce((n, l) => n + l.my_chats, 0),
      moments: allMoments.length,
    },
  });
}
