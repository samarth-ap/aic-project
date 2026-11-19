import { currentUser } from "@/lib/auth";
import { eventsForActor, getClassByCode, getRole, sessionsForClass, setStudyProgress, updateEvent, userActorId } from "@/lib/db";
import { passed, topicKey } from "@/lib/analysis/study";
import { error, json } from "@/lib/server";

// POST /api/study/result { class_code, topic, score, total } -> records a check. Passing clears the weak spot.
export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const body = await req.json().catch(() => ({}));
  const c = await getClassByCode(String(body.class_code ?? ""));
  if (!c || !(await getRole(c.id, user.id))) return error("Not found", 404);
  const key = String(body.topic ?? "");
  const score = Math.max(0, Math.round(Number(body.score) || 0));
  const total = Math.max(1, Math.round(Number(body.total) || 5));
  const ok = passed(score, total);
  const sessions = await sessionsForClass(c.id);
  const mine = (await eventsForActor(userActorId(user.id), sessions.map((s) => s.id))).filter((e) => topicKey(e.concept) === key);
  const wasWeak = mine.some((e) => e.status === "fuzzy") || mine.length > 1;
  await setStudyProgress(user.id, `${c.id}:${key}`, ok && wasWeak ? "cleared" : "checked", score);
  // They get it now: "still fuzzy" moments on this topic become "got it".
  if (ok) for (const e of mine) if (e.status === "fuzzy") await updateEvent(e.id, { status: "got_it" });
  return json({ ok: true, passed: ok });
}
