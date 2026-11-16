import { addChatMessage, getChat, getTranscript, recentChatCount, type ChatKind } from "@/lib/db";
import { error, json, lectureActor, sessionFrom } from "@/lib/api";
import { tapPrompt, tutorReply } from "@/lib/analysis/tutor";

const MAX_LEN = 1000;
const PER_MINUTE = Number(process.env.CHAT_PER_MINUTE ?? 6);

const lectureTime = (s: { started_at: number; ended_at: number | null }) =>
  (s.ended_at ?? Date.now()) - s.started_at;

// GET /api/sessions/:code/chat?deviceId=...  → this student's private thread
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  const deviceId = new URL(req.url).searchParams.get("deviceId");
  const who = await lectureActor(req, s, deviceId);
  if (who instanceof Response) return who;
  return json({
    messages: (await getChat(s.id, who.actor)).map(({ role, kind, t_ms, content }) => ({ role, kind, t_ms, content })),
  });
}

// POST /api/sessions/:code/chat  { deviceId, text } or { deviceId, tap: "lost" | "example" }
// Streams the tutor's reply as plain text.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const s = await sessionFrom(params);
  if (!s) return error("No lecture with that code", 404);
  const body = await req.json().catch(() => ({}));
  const { deviceId, text, tap } = body as { deviceId?: unknown; text?: unknown; tap?: unknown };
  const who = await lectureActor(req, s, deviceId);
  if (who instanceof Response) return who;
  const actor = who.actor;

  let kind: ChatKind;
  if (tap === "lost" || tap === "example") kind = tap;
  else if (typeof text === "string" && text.trim()) kind = "text";
  else return error("Send text or a tap");
  if (kind === "text" && (text as string).length > MAX_LEN) return error(`Keep it under ${MAX_LEN} characters`);

  if (await recentChatCount(s.id, actor, Date.now() - 60_000) >= PER_MINUTE) {
    return error("You're sending messages quickly. Wait a few seconds and try again.", 429);
  }

  const now = lectureTime(s);
  const content = kind === "text" ? (text as string).trim() : tapPrompt(kind, now);
  await addChatMessage(s.id, actor, "user", kind, now, content);

  const reply = tutorReply({
    session: { title: s.title, course: s.course, ended: Boolean(s.ended_at) },
    nowMs: now,
    transcript: await getTranscript(s.id),
    history: await getChat(s.id, actor),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of reply) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("tutor error", err);
        // Shown to the student but not saved, so it doesn't end up in the tutor's history.
        controller.enqueue(encoder.encode(`${full ? "\n\n" : ""}Sorry, the AI tutor hit an error. Try again in a moment.`));
      }
      if (full.trim()) await addChatMessage(s.id, actor, "assistant", "text", now, full);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
