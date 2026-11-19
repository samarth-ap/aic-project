// The Study tab: turns a student's Lost moments into a plan for the next exam.
// Private to the student; professors see none of it.
//
// - Every Lost moment becomes a topic (grouped by concept name within a class).
// - A topic is a weak spot if any moment is "Still fuzzy" or the student was lost there more than once.
// - Passing the topic's 5-question check clears it.
// - Topics the student got at the time come back once as a quick check.
import { z } from "zod";
import { aiJson, aiProvider } from "./llm";
import { textBetween, type Seg } from "./transcript";

export interface StudyMoment {
  event_id: number;
  concept: string;
  status: "open" | "got_it" | "fuzzy";
  t_ms: number;
  created_at: number;
  lecture_code: string;
  lecture_no: number;
  lecture_title: string;
  /** Share of the class lost in the hotspot this moment falls in (0 if none). */
  class_share: number;
}
export interface Progress {
  status: string; // cleared | checked
  score: number;
  updated_at: number;
}
export type Standing = "weak" | "okay" | "solid";
export interface Topic {
  key: string;
  name: string;
  moments: StudyMoment[];
  weak: boolean;
  fuzzy: boolean;
  cleared: boolean;
  needs_check: boolean;
  standing: Standing;
  class_share: number;
  first_lecture_no: number;
  last_lecture_no: number;
}
export interface PlanItem {
  topic: Topic;
  minutes: number;
  reason: string;
  kind: "weak" | "check";
}

export const topicKey = (concept: string) => concept.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim() || "untitled";

export function buildTopics(moments: StudyMoment[], progress: Map<string, Progress>): Topic[] {
  const groups = new Map<string, StudyMoment[]>();
  for (const m of moments) {
    const k = topicKey(m.concept || `Lecture ${m.lecture_no}`);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return [...groups.entries()].map(([key, ms]) => {
    ms.sort((a, b) => a.created_at - b.created_at);
    const p = progress.get(key);
    const lastMoment = Math.max(...ms.map((m) => m.created_at));
    const fuzzy = ms.some((m) => m.status === "fuzzy");
    // A cleared topic was a weak spot (its "still fuzzy" moments turn into "got it" once cleared).
    const weak = fuzzy || ms.length > 1 || p?.status === "cleared";
    const passedAfter = p && p.updated_at >= lastMoment;
    const cleared = Boolean(weak && passedAfter && p!.status === "cleared");
    const needs_check = !weak && !(passedAfter && (p!.status === "checked" || p!.status === "cleared"));
    const standing: Standing = weak && !cleared ? "weak" : cleared || (passedAfter && p!.score >= 4) ? "solid" : "okay";
    return {
      key,
      name: ms[ms.length - 1].concept || `Lecture ${ms[0].lecture_no}`,
      moments: ms,
      weak,
      fuzzy,
      cleared,
      needs_check,
      standing,
      class_share: Math.max(...ms.map((m) => m.class_share)),
      first_lecture_no: Math.min(...ms.map((m) => m.lecture_no)),
      last_lecture_no: Math.max(...ms.map((m) => m.lecture_no)),
    };
  });
}

const share = (x: number) => (x >= 0.45 ? "Almost half the class" : x >= 0.3 ? "A third of the class" : x >= 0.2 ? "A fifth of the class" : x >= 0.1 ? "Some of the class" : "");

function reasonFor(t: Topic, buildsOn: Topic | null): string {
  if (!t.weak) return "You got it at the time. A quick check to make sure it stuck.";
  const parts: string[] = [];
  const n = t.moments.length;
  if (n > 1 && t.fuzzy) parts.push(`You were lost here ${n === 2 ? "twice" : `${n} times`} and marked it still fuzzy.`);
  else if (n > 1) parts.push(`You were lost here ${n === 2 ? "twice" : `${n} times`}.`);
  else parts.push(`Still fuzzy from Lecture ${t.last_lecture_no}.`);
  const s = share(t.class_share);
  if (s) parts.push(`${s} was lost too.`);
  if (buildsOn) parts.push(`${buildsOn.name} builds on it.`);
  return parts.join(" ");
}

/** Daily budget: about 20 minutes, more as the exam gets close. */
export const dailyMinutes = (daysToExam: number | null) => (daysToExam == null || daysToExam > 7 ? 20 : daysToExam > 2 ? 30 : 40);

/**
 * Today's plan: weak spots first (still fuzzy, lost more than once, how much of the
 * class was lost, whether later topics build on it), then quick checks, until the
 * daily budget is used.
 */
export function planToday(topics: Topic[], daysToExam: number | null): PlanItem[] {
  const open = topics.filter((t) => (t.weak && !t.cleared) || t.needs_check);
  const later = (t: Topic) => topics.find((o) => o !== t && o.weak && !o.cleared && o.first_lecture_no > t.last_lecture_no) ?? null;
  const score = (t: Topic) =>
    (t.weak ? 10 : 0) + (t.fuzzy ? 3 : 0) + (t.moments.length > 1 ? 2 : 0) + t.class_share * 3 + (later(t) ? 1 : 0) - t.last_lecture_no * 0.01;
  const ordered = open.sort((a, b) => score(b) - score(a));
  const budget = dailyMinutes(daysToExam);
  const out: PlanItem[] = [];
  let used = 0;
  for (const t of ordered) {
    const minutes = !t.weak ? 5 : t.fuzzy && t.moments.length > 1 ? 8 : 7;
    if (out.length >= 2 && used + minutes > budget) continue;
    out.push({ topic: t, minutes, reason: reasonFor(t, t.weak ? later(t) : null), kind: t.weak ? "weak" : "check" });
    used += minutes;
  }
  return out;
}

// ---------- 5-question check ----------

export interface Quiz {
  mode: "ai" | "offline";
  questions: { q: string; options: string[]; answer: number; why: string }[];
}

const QuizSchema = z.object({
  questions: z
    .array(
      z.object({
        q: z.string(),
        options: z.array(z.string()).describe("Exactly 4 options"),
        answer: z.number().describe("Index 0-3 of the correct option"),
        why: z.string().describe("One sentence explaining the right answer"),
      }),
    )
    .describe("Exactly 5 multiple-choice questions"),
});

const STOP = new Set(
  "about above after again against because before being below between both could doing during each further having here itself just more most other ought ourselves over same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while whom will with would your yours going thing things really right okay alright actually basically gonna wanna kind write board together today everyone next start started remember question questions example examples another little thing first second third means".split(" "),
);

/** Offline check: fill-in-the-blank questions from what the professor said around the student's moments. */
export function clozeQuiz(transcript: Seg[], aroundMs: number[], seed = 1): Quiz {
  let r = seed;
  const rand = () => ((r = (r * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const words = (s: string) => s.match(/[A-Za-z][A-Za-z'-]{4,}/g) ?? [];
  // Content words only: no contractions or filler, so the blank tests an idea, not grammar.
  const content = (w: string) => !STOP.has(w.toLowerCase()) && !w.includes("'");
  const pool = [...new Set(transcript.flatMap((s) => words(s.text)).filter(content).map((w) => w.toLowerCase()))];
  const near = [...new Set(aroundMs.flatMap((t) => textBetween(transcript, t - 180_000, t + 60_000).split(/(?<=[.!?])\s+/)))]
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 7);
  const questions: Quiz["questions"] = [];
  for (const sentence of near) {
    if (questions.length >= 5) break;
    const cands = words(sentence).filter(content);
    if (!cands.length) continue;
    const answer = cands.sort((a, b) => b.length - a.length)[0];
    const distract = pool.filter((w) => w !== answer.toLowerCase() && Math.abs(w.length - answer.length) <= 3).sort(() => rand() - 0.5).slice(0, 3);
    if (distract.length < 3) continue;
    const options = [answer.toLowerCase(), ...distract].sort(() => rand() - 0.5);
    questions.push({
      q: `Fill the gap in what your professor said: “${sentence.replace(answer, "_____")}”`,
      options,
      answer: options.indexOf(answer.toLowerCase()),
      why: `Your professor said: “${sentence}”`,
    });
  }
  return { mode: "offline", questions };
}

export async function aiQuiz(topic: string, context: string, tldrs: string[]): Promise<Quiz | null> {
  if (!aiProvider() || !context.trim()) return null;
  try {
    const r = await aiJson({
      schema: QuizSchema,
      name: "topic_check",
      tier: "fast",
      maxTokens: 3000,
      system:
        "You write short multiple-choice checks for a university student reviewing one topic from a lecture they attended. Test understanding, not wording. Keep questions and options short enough for a phone.",
      user: `Topic: ${topic}

<what_the_professor_said>
${context.slice(0, 8000)}
</what_the_professor_said>
${tldrs.length ? `\n<professor_clarifications>\n${tldrs.join("\n")}\n</professor_clarifications>\n` : ""}
Write exactly 5 questions with 4 options each.`,
    });
    const questions = r.questions
      .filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
      .slice(0, 5);
    return questions.length >= 3 ? { mode: "ai", questions } : null;
  } catch (e) {
    console.error("quiz failed", e);
    return null;
  }
}

/** Passing a check: 4 of 5 (or all but one on shorter checks). */
export const passed = (score: number, total: number) => total > 0 && score >= Math.max(1, total - 1);
