// A student's personal study plan for one class, from the moments where THEY
// tapped (with their catch-up cards) and what they asked the AI tutor.
// Only ever shown to that student.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { fmt } from "./transcript";
import { aiProvider, groqJson } from "./llm";
import { CHAT_MODEL } from "./tutor";
import { studyListFromMoments, type MyMoment } from "../classes";

const Plan = z.object({
  summary: z.string().describe("2-3 warm, specific sentences: what this student most needs to review and why"),
  items: z
    .array(
      z.object({
        topic: z.string().describe("Short topic name"),
        why: z.string().describe("One sentence: what they got stuck on, from the moments/questions"),
        what_to_do: z.string().describe("A concrete 10-20 minute study action (re-derive X, do 3 problems like Y, rewatch 4:10-6:00)"),
        lecture_code: z.string().nullable().describe("Code of the lecture this came from, or null"),
      }),
    )
    .describe("3-6 items, most important first"),
});
export type StudyPlan = z.infer<typeof Plan> & { mode: "ai" | "offline"; generated_at: number };

export function offlinePlan(moments: MyMoment[]): StudyPlan {
  const list = studyListFromMoments(moments);
  return {
    mode: "offline",
    generated_at: Date.now(),
    summary: list.length
      ? `You got lost at ${list.length} point${list.length > 1 ? "s" : ""} recently. Start with the most recent one and try its practice question.`
      : "Nothing to review yet: you haven't tapped \"I'm lost\" in an analyzed lecture for this class.",
    items: list.map((m) => ({
      topic: m.concept,
      why: `You tapped around ${fmt(m.start_ms)} in "${m.lecture_title}".`,
      what_to_do: m.practice_question ? `Re-read the catch-up card, then try: ${m.practice_question}` : "Re-read the catch-up card for this moment.",
      lecture_code: m.lecture_code,
    })),
  };
}

export async function buildStudyPlan(className: string, moments: MyMoment[], questions: string[]): Promise<StudyPlan> {
  const provider = aiProvider();
  if (!provider || (!moments.length && !questions.length)) return offlinePlan(moments);

  const user = `Class: ${className}

<moments_this_student_got_lost>
${moments
  .slice(0, 25)
  .map(
    (m) =>
      `- [lecture ${m.lecture_code} "${m.lecture_title}", ${new Date(m.lecture_date).toDateString()}, at ${fmt(m.start_ms)}] concept: ${m.concept}. Catch-up: ${m.explanation.slice(0, 400)}`,
  )
  .join("\n") || "(none)"}
</moments_this_student_got_lost>

<questions_they_asked_the_ai_tutor>
${questions.slice(0, 30).map((q) => `- ${q.slice(0, 300)}`).join("\n") || "(none)"}
</questions_they_asked_the_ai_tutor>

Write this student's study plan for the next few days. Group related moments into topics, put prerequisite gaps first, and make every action concrete and small. Talk to the student as "you".`;
  const system =
    "You are a supportive study coach for a university student. You only see moments where this student tapped \"I'm lost\" during lectures and questions they asked an AI tutor. Be specific, encouraging, and practical. No generic study advice.";

  try {
    const plan =
      provider === "groq"
        ? await groqJson({ schema: Plan, name: "study_plan", system, user, maxTokens: 4000, effort: "low" })
        : await (async () => {
            const res = await new Anthropic().beta.messages.parse({
              model: CHAT_MODEL,
              max_tokens: 4000,
              output_config: { effort: "low", format: betaZodOutputFormat(Plan) },
              system,
              messages: [{ role: "user", content: user }],
            });
            if (!res.parsed_output) throw new Error("no plan");
            return res.parsed_output;
          })();
    return { ...plan, mode: "ai", generated_at: Date.now() };
  } catch (e) {
    console.error("study plan failed", e);
    return offlinePlan(moments);
  }
}
