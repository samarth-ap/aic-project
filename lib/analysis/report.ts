// Builds the post-lecture report: signal (spikes) + transcript + questions,
// then asks Claude to name the concepts, find root causes, and write the
// professor brief and student catch-up cards. Without an API key it falls back
// to a simple offline report so the app still works end to end.
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { computeSignal, DEFAULT_CONFIG, type RawTap, type Signal } from "./signal";
import { fmt, stampedTranscript, textBetween, type Seg } from "./transcript";

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

// ---------- What Claude returns ----------

const AiReport = z.object({
  headline: z.string().describe("One sentence for the professor: the single most important takeaway."),
  concepts: z
    .array(
      z.object({
        id: z.string().describe("Short slug, e.g. c1"),
        name: z.string().describe("2-6 word concept name, e.g. 'Change of basis'"),
        start_s: z.number().describe("Seconds from lecture start where this concept begins"),
        end_s: z.number(),
        summary: z.string().describe("One sentence on what was taught"),
        prerequisite_ids: z.array(z.string()).describe("Earlier concept ids this one depends on"),
      }),
    )
    .describe("The lecture split into its concepts, in order"),
  moments: z.array(
    z.object({
      moment_id: z.string().describe("The id of the confusion moment you were given"),
      concept_id: z.string().describe("Concept the confusion is about (after accounting for tap lag)"),
      why_confusing: z.string().describe("What in the delivery most likely lost students, citing the transcript"),
      transcript_quote: z.string().describe("Short verbatim quote (<= 30 words) from where it went wrong"),
      root_cause_concept_id: z
        .string()
        .nullable()
        .describe("An EARLIER concept whose weak understanding likely caused this, or null"),
      root_cause_reason: z.string().nullable(),
      suggested_fix: z.string().describe("Concrete fix for next time: alternate explanation, analogy or example"),
      catch_up: z.object({
        title: z.string(),
        explanation: z.string().describe("Plain-language re-explanation for a student, 80-150 words"),
        practice_question: z.string(),
        practice_answer: z.string(),
      }),
    }),
  ),
  question_clusters: z.array(
    z.object({
      theme: z.string(),
      count: z.number(),
      representative_question: z.string(),
      concept_id: z.string().nullable(),
    }),
  ),
  recap_slide: z.object({
    title: z.string(),
    bullets: z.array(z.string()).describe("3-5 bullets to open next lecture with"),
  }),
  clarification_post: z
    .string()
    .describe("Ready-to-paste Canvas/Ed announcement clarifying the top confusion, friendly tone, <= 150 words"),
});
type AiReport = z.infer<typeof AiReport>;

// ---------- What the app stores ----------

export interface Report {
  generated_at: number;
  mode: "ai" | "offline";
  warning?: string;
  session: { code: string; title: string; course: string; duration_ms: number };
  stats: { active_devices: number; total_taps: number; questions: number };
  timeline: { start_ms: number; rate: number; devices: number }[];
  headline: string;
  concepts: { id: string; name: string; start_ms: number; end_ms: number; summary: string; prerequisite_ids: string[]; confusion: number }[];
  moments: {
    id: string;
    start_ms: number;
    end_ms: number;
    devices: number;
    share: number; // devices / active
    kinds: Record<string, number>;
    concept_id: string | null;
    concept_name: string;
    why_confusing: string;
    transcript_quote: string;
    root_cause: { concept_id: string; concept_name: string; reason: string } | null;
    suggested_fix: string;
    catch_up: { title: string; explanation: string; practice_question: string; practice_answer: string };
  }[];
  question_clusters: { theme: string; count: number; representative_question: string; concept_id: string | null }[];
  recap_slide: { title: string; bullets: string[] };
  clarification_post: string;
  /** Hashed device ids per moment, for catch-up lookup. Stripped before sending to professors. */
  private: { moment_devices: Record<string, string[]> };
}

export const hashDevice = (id: string) => crypto.createHash("sha256").update(id).digest("hex").slice(0, 24);

export interface ReportInput {
  session: { code: string; title: string; course: string; started_at: number; ended_at: number | null };
  taps: RawTap[];
  questions: { t_ms: number; text: string }[];
  transcript: Seg[];
  joinedDevices: number;
}

export function hasClaudeCredentials() {
  if (process.env.USE_LLM === "0") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

export async function buildReport(input: ReportInput): Promise<Report> {
  const lastEvent = Math.max(
    0,
    ...input.taps.map((t) => t.t_ms),
    ...input.transcript.map((s) => s.end_ms),
    ...input.questions.map((q) => q.t_ms),
  );
  const duration = input.session.ended_at
    ? Math.max(input.session.ended_at - input.session.started_at, lastEvent)
    : lastEvent;
  const signal = computeSignal(input.taps, Math.max(duration, 60_000), input.joinedDevices, DEFAULT_CONFIG);

  let ai: AiReport | null = null;
  let warning: string | undefined;
  if (!input.transcript.length) {
    warning = "No transcript yet — add one (live captions or a .vtt/.srt upload) to get concept-level analysis.";
  } else if (hasClaudeCredentials()) {
    try {
      ai = await analyzeWithClaude(input, signal);
    } catch (err) {
      warning = `AI analysis failed, showing offline report: ${(err as Error).message}`;
    }
  } else {
    warning = "Offline mode: set ANTHROPIC_API_KEY to get AI concept mapping, root causes and catch-up cards.";
  }

  return assemble(input, signal, ai ?? offlineReport(input, signal), ai ? "ai" : "offline", warning);
}

// ---------- Claude ----------

const SYSTEM = `You analyze anonymous "I'm lost" signals that students sent during a university lecture, lined up with the lecture transcript.

How the signal works:
- Students tap one of: "lost", "too fast", "need an example", or "got it".
- Tap times are already shifted ~20s earlier to account for reaction lag, but confusion often starts earlier than the tap: look at the 1-2 minutes BEFORE each moment, not just inside it.
- Confusion late in a lecture is often caused by an earlier concept that didn't land. When a moment depends on an earlier concept that also showed taps or was rushed, name it as the root cause. Only name a root cause when the transcript supports it; otherwise use null.

Write for a busy professor: specific, kind, actionable, no generic teaching advice. Never speculate about individual students. Catch-up cards are read by students on their phones right after lecture: warm, concrete, and grounded in what the professor actually said.`;

async function analyzeWithClaude(input: ReportInput, signal: Signal): Promise<AiReport> {
  const client = new Anthropic();
  const moments = signal.moments
    .map(
      (m) =>
        `- ${m.id}: ${fmt(m.start_ms)}–${fmt(m.end_ms)}, ${m.devices} of ${signal.active_devices} students (${Math.round(
          (m.devices / signal.active_devices) * 100,
        )}%); taps: lost=${m.kinds.lost}, too_fast=${m.kinds.too_fast}, need_example=${m.kinds.example}`,
    )
    .join("\n");
  const questions = input.questions.map((q) => `- [${fmt(q.t_ms)}] ${q.text}`).join("\n");

  const user = `Lecture: "${input.session.title}"${input.session.course ? ` (${input.session.course})` : ""}

<transcript>
${stampedTranscript(input.transcript)}
</transcript>

<confusion_moments>
${moments || "(no moment passed the threshold)"}
</confusion_moments>

<anonymous_questions>
${questions || "(none)"}
</anonymous_questions>

Split the lecture into concepts, then analyze every confusion moment (one entry per moment id), cluster the questions, and write the recap slide and clarification post.`;

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: (process.env.CLAUDE_EFFORT as "low" | "medium" | "high") ?? "medium",
      format: betaZodOutputFormat(AiReport),
    },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to analyze this lecture.");
  if (response.stop_reason === "max_tokens") throw new Error("Response was cut off (max_tokens).");
  if (!response.parsed_output) throw new Error("Could not parse Claude's response.");
  return response.parsed_output;
}

// ---------- Offline fallback ----------

function offlineReport(input: ReportInput, signal: Signal): AiReport {
  const concepts: AiReport["concepts"] = signal.moments.map((m, i) => ({
    id: `c${i + 1}`,
    name: `Around ${fmt(m.start_ms)}`,
    start_s: Math.max(0, (m.start_ms - 60_000) / 1000),
    end_s: m.end_ms / 1000,
    summary: textBetween(input.transcript, m.start_ms - 60_000, m.end_ms).slice(0, 160) || "(no transcript)",
    prerequisite_ids: [],
  }));
  return {
    headline: signal.moments.length
      ? `${signal.moments.length} confusion moment(s); the biggest was at ${fmt(signal.moments[0].start_ms)}.`
      : "No confusion moment passed the threshold this lecture.",
    concepts,
    moments: signal.moments.map((m, i) => {
      const window = textBetween(input.transcript, m.start_ms - 60_000, m.end_ms);
      return {
        moment_id: m.id,
        concept_id: `c${i + 1}`,
        why_confusing: "Offline mode: AI explanation unavailable. Review the transcript excerpt.",
        transcript_quote: window.split(" ").slice(-30).join(" "),
        root_cause_concept_id: null,
        root_cause_reason: null,
        suggested_fix: "Revisit this segment at the start of next lecture with a worked example.",
        catch_up: {
          title: `What was said around ${fmt(m.start_ms)}`,
          explanation: window.slice(0, 700) || "(no transcript for this moment)",
          practice_question: "Try to explain this part in your own words in two sentences.",
          practice_answer: "Compare with the lecture notes or ask in office hours.",
        },
      };
    }),
    question_clusters: input.questions.map((q) => ({
      theme: "Question",
      count: 1,
      representative_question: q.text,
      concept_id: null,
    })),
    recap_slide: {
      title: "Quick recap before we start",
      bullets: signal.moments.slice(0, 3).map((m) => `Revisit what we covered at ${fmt(m.start_ms)}`),
    },
    clarification_post: "",
  };
}

// ---------- Merge signal + AI into the stored report ----------

function assemble(input: ReportInput, signal: Signal, ai: AiReport, mode: Report["mode"], warning?: string): Report {
  const conceptName = new Map(ai.concepts.map((c) => [c.id, c.name]));
  const byMoment = new Map(ai.moments.map((m) => [m.moment_id, m]));
  const active = signal.active_devices;

  const moments: Report["moments"] = signal.moments.map((m) => {
    const a = byMoment.get(m.id);
    const conceptId = a?.concept_id ?? null;
    return {
      id: m.id,
      start_ms: m.start_ms,
      end_ms: m.end_ms,
      devices: m.devices,
      share: m.devices / active,
      kinds: m.kinds,
      concept_id: conceptId,
      concept_name: (conceptId && conceptName.get(conceptId)) || `Around ${fmt(m.start_ms)}`,
      why_confusing: a?.why_confusing ?? "",
      transcript_quote: a?.transcript_quote ?? "",
      root_cause:
        a?.root_cause_concept_id && conceptName.has(a.root_cause_concept_id) && a.root_cause_concept_id !== conceptId
          ? {
              concept_id: a.root_cause_concept_id,
              concept_name: conceptName.get(a.root_cause_concept_id)!,
              reason: a.root_cause_reason ?? "",
            }
          : null,
      suggested_fix: a?.suggested_fix ?? "",
      catch_up: a?.catch_up ?? { title: "", explanation: "", practice_question: "", practice_answer: "" },
    };
  });

  // Confusion score per concept = share of students in moments mapped to it.
  const conceptScore = new Map<string, number>();
  for (const m of moments) if (m.concept_id) conceptScore.set(m.concept_id, (conceptScore.get(m.concept_id) ?? 0) + m.share);

  return {
    generated_at: Date.now(),
    mode,
    warning,
    session: {
      code: input.session.code,
      title: input.session.title,
      course: input.session.course,
      duration_ms: signal.duration_ms,
    },
    stats: { active_devices: active, total_taps: signal.total_taps, questions: input.questions.length },
    timeline: signal.bins.map((b) => ({ start_ms: b.start_ms, rate: b.rate, devices: b.devices })),
    headline: ai.headline,
    concepts: ai.concepts.map((c) => ({
      id: c.id,
      name: c.name,
      start_ms: c.start_s * 1000,
      end_ms: c.end_s * 1000,
      summary: c.summary,
      prerequisite_ids: c.prerequisite_ids,
      confusion: conceptScore.get(c.id) ?? 0,
    })),
    moments,
    question_clusters: ai.question_clusters,
    recap_slide: ai.recap_slide,
    clarification_post: ai.clarification_post,
    private: {
      moment_devices: Object.fromEntries(signal.moments.map((m) => [m.id, m.device_ids.map(hashDevice)])),
    },
  };
}

/** The professor-facing view: drops per-device data. */
export function publicReport(r: Report): Omit<Report, "private"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { private: _p, ...rest } = r;
  return rest;
}
