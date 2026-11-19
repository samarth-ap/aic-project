// The AI tutor a student opens by tapping Lost.
//
// First answer is a TLDR (about 60 words, names the concept), not an essay. It
// gets longer only when the student asks. Context at the moment of the tap:
// the last 3-5 minutes of transcript weighted to the last 60-90 seconds, the
// running summary and concept list, the lecture title and attached slides, and
// the student's earlier Lost threads in this lecture.
import { fmt, stampedTranscript, textBetween, type Seg } from "./transcript";
import { aiProvider, aiStream, GroqError } from "./llm";
import type { ChatKind } from "../db";
import type { LiveSummary } from "./live";
import { splitConcept } from "../tutor-text";

export { splitConcept };

export interface TutorInput {
  lecture: { title: string; course: string; ended: boolean; slides: string; gradedNotes: string };
  summary: LiveSummary | null;
  transcript: Seg[];
  /** Current lecture time (ms from the start of the recording). */
  nowMs: number;
  /** When this thread's Lost tap happened. */
  tapMs: number;
  earlierThreads: { t_ms: number; concept: string }[];
  history: { role: "user" | "assistant"; kind: ChatKind; content: string; t_ms: number }[];
}

const RECENT_MS = 5 * 60_000;
const JUST_SAID_MS = 90_000;

const SYSTEM = `You are the tutor inside "Lost and Found". A university student tapped the Lost button during a live lecture because they lost the thread. You can see a live transcript of the lecture (speech-to-text, so expect mis-heard words), a running summary, and any slides or notes the professor attached.

Your job: get them back on track fast so they don't miss more of the lecture.

FIRST ANSWER after a Lost tap (a TLDR, not an essay):
- Line 1 is exactly: [[<concept the professor was on, 2-5 words, lowercase>]]
- Then at most about 60 words in total: one short headline sentence that states the key idea, then one or two plain sentences. If a tiny example fits, put it on its own line starting with "Example: ".
- No preamble, no restating their question, no "great question", no closing offer.
- Focus on what was said in the last 60-90 seconds; students tap 10-60 seconds after they get lost.
- If the last 90 seconds are unclear (crosstalk, silence, admin talk, garbled), skip the TLDR and ask one short question instead: "Which part lost you: X or Y?" (still start with the [[concept]] line).

FOLLOW-UPS:
- "Explain more" or a typed question: a fuller answer, still as short as the question allows. Go long only when they ask for it or the question needs it.
- "Give an example": one concrete worked example tied to what the professor said.
- "What did I miss?": exactly two short lines on what the professor said since the student tapped. Nothing else.
- Stay on the lecture's content. If you can't ground an answer in the transcript or slides, say so and answer from general knowledge, starting that part with "General background:".

GUARDRAILS:
- Never contradict the professor silently. If the transcript looks wrong or mis-heard, say the recording may have been unclear and give the likely intended meaning.
- Never give answers to graded work the professor has flagged (listed below if any); give a hint or a similar example instead.
- Plain text for a phone screen: short paragraphs, simple inline math like x^2 or n - 1, no markdown headings, no tables, no bold.`;

const LIVE_NOTE = "The lecture is LIVE. Keep every reply short so the student can keep listening.";
const AFTER_NOTE = "The lecture has ENDED. Follow-ups can go deeper (worked steps, a practice question) but keep each reply under about 200 words.";

/** What a quick reply turns into as the student's message. */
export function quickPrompt(kind: Exclude<ChatKind, "text">, tapMs: number, nowMs: number): string {
  switch (kind) {
    case "lost":
      return `[Tapped Lost at ${fmt(tapMs)}]`;
    case "more":
      return "Explain more.";
    case "example":
      return "Give me an example.";
    case "again":
      return "Explain this again, a different way.";
    case "missed":
      return `What did I miss? (${Math.max(0, Math.round((nowMs - tapMs) / 1000))} seconds since I tapped)`;
  }
}

/** The concept the professor was on at `tMs`, from the running summary. */
export function conceptAt(summary: LiveSummary | null, tMs: number): string {
  if (!summary?.concepts.length) return "";
  const before = summary.concepts.filter((c) => c.start_ms <= tMs);
  return (before[before.length - 1] ?? summary.concepts[0]).name;
}

/** Groq's free tier has a small tokens-per-minute budget: after class it only sees transcript near the tap and questions. */
const GROQ_WINDOW_BEFORE_MS = Number(process.env.GROQ_TUTOR_WINDOW_MIN ?? 12) * 60_000;
export function trimForGroq(heard: Seg[], anchors: number[]): { segs: Seg[]; trimmed: boolean } {
  const keep = heard.filter((s) => anchors.some((t) => s.end_ms >= t - GROQ_WINDOW_BEFORE_MS && s.start_ms <= t + 2 * 60_000));
  return { segs: keep, trimmed: keep.length < heard.length };
}

export function contextBlock(input: TutorInput, provider: "anthropic" | "groq" | null): string {
  const { lecture, summary, nowMs, tapMs, transcript } = input;
  const heard = transcript.filter((s) => s.start_ms <= nowMs);
  let transcriptPart: string;
  if (!lecture.ended) {
    const earlier = heard.filter((s) => s.end_ms >= nowMs - RECENT_MS && s.end_ms < nowMs - JUST_SAID_MS);
    const just = heard.filter((s) => s.end_ms >= nowMs - JUST_SAID_MS);
    transcriptPart = `<recent_transcript note="3-5 minutes before now">
${earlier.length ? stampedTranscript(earlier) : "(nothing)"}
</recent_transcript>
<just_said note="last 90 seconds: weight this most">
${just.length ? stampedTranscript(just) : "(nothing heard in the last 90 seconds)"}
</just_said>`;
  } else {
    let segs = heard;
    let note = "";
    if (provider === "groq") {
      const t = trimForGroq(heard, [tapMs, ...input.history.filter((m) => m.role === "user").map((m) => m.t_ms)]);
      segs = t.segs;
      if (t.trimmed) note = "(Only the parts near the student's Lost moment are included.)\n";
    }
    transcriptPart = `<transcript note="whole lecture">\n${note}${segs.length ? stampedTranscript(segs) : "(no transcript)"}\n</transcript>`;
  }
  const since = !lecture.ended ? textBetween(transcript, tapMs, nowMs) : "";
  return `Class: ${lecture.course || "(unnamed)"} · Lecture: "${lecture.title}"
Now: ${fmt(nowMs)} into the lecture. This student tapped Lost at ${fmt(tapMs)}.
${lecture.ended ? AFTER_NOTE : LIVE_NOTE}

<running_summary>
${summary ? `${summary.summary}\nConcepts so far: ${summary.concepts.map((c) => `${c.name} (from ${fmt(c.start_ms)})`).join("; ")}` : "(not available yet)"}
</running_summary>

${transcriptPart}
${since ? `\n<said_since_the_tap>\n${since}\n</said_since_the_tap>\n` : ""}
<slides_and_notes>
${lecture.slides ? lecture.slides.slice(0, 8000) : "(none attached)"}
</slides_and_notes>

<graded_work_flagged_by_professor>
${lecture.gradedNotes || "(none)"}
</graded_work_flagged_by_professor>

<this_students_earlier_lost_moments_in_this_lecture>
${input.earlierThreads.map((t) => `- ${fmt(t.t_ms)}${t.concept ? `: ${t.concept}` : ""}`).join("\n") || "(none)"}
</this_students_earlier_lost_moments_in_this_lecture>`;
}

/** Streams the tutor's reply. Without an AI provider, yields a fallback built from the transcript. */
export async function* tutorReply(input: TutorInput): AsyncGenerator<string> {
  const provider = aiProvider();
  if (!provider) {
    yield offlineReply(input);
    return;
  }
  try {
    yield* aiStream({
      system: [SYSTEM, contextBlock(input, provider)],
      messages: input.history.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: input.lecture.ended ? 2000 : 700,
    });
  } catch (err) {
    if (err instanceof GroqError && err.status === 429) {
      yield "Lots of students are asking right now, so the tutor is busy. Try again in a few seconds.";
      return;
    }
    throw err;
  }
}

export function offlineReply(input: TutorInput): string {
  const last = [...input.history].reverse().find((m) => m.role === "user");
  // Offline concept names are guesses from the transcript's first words: don't label the moment with them.
  const concept = input.summary?.source === "offline" ? "" : conceptAt(input.summary, input.tapMs);
  const tag = concept ? `[[${concept}]]\n` : "";
  const words = (s: string, n: number) => s.trim().split(/\s+/).filter(Boolean).slice(-n).join(" ");
  if (last?.kind === "missed") {
    const since = textBetween(input.transcript, input.tapMs, input.nowMs);
    return since.trim() ? `Since you tapped, your professor said:\n“…${words(since, 40)}”` : "Nothing new has been transcribed since you tapped.";
  }
  if (last?.kind === "lost") {
    const recent = textBetween(input.transcript, input.tapMs - JUST_SAID_MS, input.tapMs);
    if (!recent.trim()) return `${tag}I can't hear the lecture yet: the transcript is empty. Keep listening, and your Lost moment is saved for after class.`;
    return `${tag}The AI tutor is off on this server, so here is what your professor just said:\n“…${words(recent, 55)}”`;
  }
  return "The AI tutor is off on this server, so I can't answer that yet. Your question is saved with this moment for after class.";
}
