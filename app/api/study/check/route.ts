import { currentUser } from "@/lib/auth";
import { cacheGet, cacheSet, eventsForActor, getClassByCode, getRole, getTranscript, hotspotsForSessions, sessionsForClass, userActorId } from "@/lib/db";
import { aiQuiz, clozeQuiz, topicKey, type Quiz } from "@/lib/analysis/study";
import { textBetween } from "@/lib/analysis/transcript";
import { error, json } from "@/lib/server";

// POST /api/study/check { class_code, topic } -> a 5-question check on one of my topics
export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return error("Sign in first", 401);
  const body = await req.json().catch(() => ({}));
  const c = await getClassByCode(String(body.class_code ?? ""));
  if (!c || !(await getRole(c.id, user.id))) return error("Not found", 404);
  const key = String(body.topic ?? "");
  const sessions = await sessionsForClass(c.id);
  const events = (await eventsForActor(userActorId(user.id), sessions.map((s) => s.id))).filter((e) => topicKey(e.concept) === key);
  if (!events.length) return error("Nothing to check for that topic", 404);
  const name = events[events.length - 1].concept;
  const cacheKey = `quiz:${c.id}:${key}:${events.map((e) => e.id).join(",")}`;
  const cached = await cacheGet<Quiz>(cacheKey);
  if (cached) return json({ topic: name, ...cached });

  const bySession = new Map<number, number[]>();
  for (const e of events) bySession.set(e.session_id, [...(bySession.get(e.session_id) ?? []), e.t_ms]);
  let context = "";
  let offline: Quiz = { mode: "offline", questions: [] };
  for (const [sid, times] of bySession) {
    const t = await getTranscript(sid);
    context += times.map((ms) => textBetween(t, ms - 180_000, ms + 60_000)).join("\n") + "\n";
    const q = clozeQuiz(t, times, sid);
    offline = { mode: "offline", questions: [...offline.questions, ...q.questions].slice(0, 5) };
  }
  const tldrs = (await hotspotsForSessions([...bySession.keys()]))
    .filter((h) => h.status === "published" && h.concept.toLowerCase() === name.toLowerCase())
    .map((h) => h.published);
  const quiz = (await aiQuiz(name, context, tldrs)) ?? offline;
  if (!quiz.questions.length) return error("Not enough of the lecture was transcribed to build a check for this topic.", 422);
  await cacheSet(cacheKey, quiz);
  return json({ topic: name, ...quiz });
}
