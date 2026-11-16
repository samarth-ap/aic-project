// The AI tutor: a private chat a student opens by tapping "I'm lost".
// Claude sees the lecture transcript so far (from live captions), the time of
// the tap, and the student's thread, and explains what the professor just said.
import Anthropic from "@anthropic-ai/sdk";
import { fmt, stampedTranscript, textBetween, type Seg } from "./transcript";
import { hasAiCredentials } from "./report";
import { aiProvider, GroqError, groqStream } from "./llm";
import type { ChatKind, ChatMessage } from "../db";

// Fast model for live replies; the after-class report keeps using Opus.
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "claude-sonnet-5-5";
const CHAT_EFFORT = (process.env.CHAT_EFFORT as "low" | "medium" | "high") ?? "low";

/** Students tap a little after they get lost; look this far back for "what just happened". */
const RECENT_MS = 3 * 60_000;

const SYSTEM = `You are the AI tutor inside "Lost & Found", a classroom app. A university student opened this private chat, usually by tapping "I'm lost" during a live lecture. You can see the lecture transcript (from live captions, so expect transcription errors) up to the current moment.

How to help:
- Ground everything in what the professor actually said. Quote short phrases from the transcript ("they said: '...'") so the student can reconnect with the lecture.
- Students tap 10-60 seconds AFTER they get lost. When they tap, focus on the 1-2 minutes before the tap, and on any earlier idea that part depends on.
- If something the student asks wasn't covered in the transcript, say so plainly ("your professor hasn't covered that yet"), then give a short general explanation and label it as general background.
- If the transcript is empty or too short, say you can't hear the lecture yet (the professor needs live captions on) and offer a general explanation if they tell you the topic.
- Captions garble math and names. Infer the intended meaning from context; don't repeat garbled words back.
- If they ask you to do graded homework or exam questions, guide them with hints and a similar worked example instead of the final answer.

Length and format (they are reading on a phone):
- During the lecture (status: LIVE): at most ~80 words. Give the one idea they need right now, then end by nudging them to keep listening, e.g. "Keep listening — ask me more after class." Do not write long derivations live.
- After the lecture (status: ENDED): you can go deeper: step-by-step explanations, a worked example, a practice question. Still keep each reply under ~250 words.
- Plain text. Short paragraphs. Use simple inline math like x^2, A v = λ v. No markdown headings or tables. A short "- " list is fine.`;

export interface TutorInput {
  session: { title: string; course: string; ended: boolean };
  /** Current lecture time (ms since start). */
  nowMs: number;
  transcript: Seg[];
  history: ChatMessage[];
}

/** What a tap turns into, as the student's chat message. */
export function tapPrompt(kind: Exclude<ChatKind, "text">, tMs: number): string {
  return kind === "example"
    ? `[Tapped "Example please" at ${fmt(tMs)}] Can you give me a concrete example of what was just explained?`
    : `[Tapped "I'm lost" at ${fmt(tMs)}] I'm lost. What just happened?`;
}

/**
 * Groq's free tier has a small tokens-per-minute budget, so for Groq the tutor
 * only sees the parts of the transcript near when this student asked or tapped
 * (12 min before each, 2 min after), not the whole lecture.
 */
const GROQ_WINDOW_BEFORE_MS = Number(process.env.GROQ_TUTOR_WINDOW_MIN ?? 12) * 60_000;
export function trimForGroq(heard: Seg[], input: TutorInput): { segs: Seg[]; trimmed: boolean } {
  const anchors = [input.nowMs, ...input.history.filter((m) => m.role === "user").map((m) => m.t_ms)];
  const keep = heard.filter((s) => anchors.some((t) => s.end_ms >= t - GROQ_WINDOW_BEFORE_MS && s.start_ms <= t + 2 * 60_000));
  return { segs: keep, trimmed: keep.length < heard.length };
}

function contextBlock(input: TutorInput, provider: "anthropic" | "groq"): string {
  const { session, nowMs, transcript } = input;
  let heard = transcript.filter((s) => s.start_ms <= nowMs);
  let note = "";
  if (provider === "groq") {
    const t = trimForGroq(heard, input);
    heard = t.segs;
    if (t.trimmed) note = "(Only the parts of the lecture near the student's questions are included; other parts are omitted.)\n";
  }
  return `Lecture: "${session.title}"${session.course ? ` (${session.course})` : ""}
Status: ${session.ended ? "ENDED" : "LIVE"} · current lecture time ${fmt(nowMs)}

<transcript>
${note}${heard.length ? stampedTranscript(heard) : "(no transcript yet: live captions are off or haven't started)"}
</transcript>`;
}

/**
 * Streams the tutor's reply as plain text chunks.
 * Without an API key, yields a non-AI fallback built from the transcript.
 */
export async function* tutorReply(input: TutorInput): AsyncGenerator<string> {
  if (!hasAiCredentials()) {
    yield offlineReply(input);
    return;
  }
  if (aiProvider() === "groq") {
    yield* groqTutorReply(input);
    return;
  }
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = input.history.map((m) => ({ role: m.role, content: m.content }));

  const stream = client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 4000,
    output_config: { effort: CHAT_EFFORT },
    // The instructions never change; the transcript changes as the lecture goes
    // on but is stable after class, when longer conversations happen.
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: contextBlock(input, "anthropic") },
    ],
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") yield "\n\nSorry, I can't help with that one. Try asking your professor or TA.";
  if (final.stop_reason === "max_tokens") yield "…";
}

async function* groqTutorReply(input: TutorInput): AsyncGenerator<string> {
  try {
    yield* groqStream({
      system: `${SYSTEM}\n\n${contextBlock(input, "groq")}`,
      messages: input.history.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 4000,
      effort: CHAT_EFFORT,
    });
  } catch (err) {
    // Free-tier rate limit: tell the student instead of showing a generic error.
    if (err instanceof GroqError && err.status === 429) {
      yield "Lots of students are asking right now, so the AI tutor is busy. Try again in a few seconds.";
      return;
    }
    throw err;
  }
}

function offlineReply(input: TutorInput): string {
  const last = [...input.history].reverse().find((m) => m.role === "user");
  const recent = textBetween(input.transcript, input.nowMs - RECENT_MS, input.nowMs).trim();
  const head = "AI tutor is off (no AI key on the server), so I can't explain yet.";
  if (last?.kind !== "text" && recent) {
    return `${head} Here's what was said in the last few minutes:\n\n“${recent.split(" ").slice(-90).join(" ")}”`;
  }
  return recent || last?.kind === "text"
    ? `${head} Your question is saved, and your catch-up card after class will cover this part of the lecture.`
    : `${head} There's no transcript yet either: the professor needs live captions on.`;
}
