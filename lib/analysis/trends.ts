// Quarter view: groups concepts from every analyzed lecture in a course into
// topics, so the professor sees which topics keep losing people.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { hasClaudeCredentials, MODEL, type Report } from "./report";

export interface Trend {
  topic: string;
  total_confusion: number; // sum of student-share across moments
  lectures: { code: string; title: string; concept: string; confusion: number; date: number }[];
}

const Grouping = z.object({
  topics: z.array(
    z.object({
      topic: z.string().describe("Short topic name that spans lectures, e.g. 'Eigenvalues'"),
      concept_refs: z.array(z.string()).describe("The concept refs (like L2:c3) that belong to this topic"),
    }),
  ),
});

export async function courseTrends(reports: { report: Report; started_at: number }[]): Promise<Trend[]> {
  const refs = reports.flatMap(({ report, started_at }, li) =>
    report.concepts.map((c) => ({ ref: `L${li + 1}:${c.id}`, report, started_at, concept: c })),
  );
  if (!refs.length) return [];

  let groups: { topic: string; concept_refs: string[] }[] | null = null;
  if (hasClaudeCredentials() && reports.some((r) => r.report.mode === "ai")) {
    try {
      const client = new Anthropic();
      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(Grouping) },
        messages: [
          {
            role: "user",
            content: `These are concepts taught across a quarter of lectures. Group them into 4-12 course topics. Every ref must appear in exactly one topic.\n\n${refs
              .map((r) => `${r.ref}: ${r.concept.name} — ${r.concept.summary}`)
              .join("\n")}`,
          },
        ],
      });
      if (response.stop_reason !== "refusal" && response.parsed_output) groups = response.parsed_output.topics;
    } catch {
      groups = null;
    }
  }
  // Offline: group by identical (normalized) concept name.
  if (!groups) {
    const byName = new Map<string, string[]>();
    for (const r of refs) {
      const key = r.concept.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), r.ref]);
    }
    groups = [...byName.entries()].map(([, rs]) => ({
      topic: refs.find((r) => r.ref === rs[0])!.concept.name,
      concept_refs: rs,
    }));
  }

  const byRef = new Map(refs.map((r) => [r.ref, r]));
  return groups
    .map((g) => {
      const lectures = g.concept_refs
        .map((ref) => byRef.get(ref))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({
          code: r.report.session.code,
          title: r.report.session.title,
          concept: r.concept.name,
          confusion: r.concept.confusion,
          date: r.started_at,
        }));
      return {
        topic: g.topic,
        total_confusion: lectures.reduce((s, l) => s + l.confusion, 0),
        lectures,
      };
    })
    .filter((t) => t.lectures.length)
    .sort((a, b) => b.total_confusion - a.total_confusion);
}
