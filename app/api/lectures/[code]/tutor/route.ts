import { after } from "next/server";
import { addChatMessage, eventsForActor, getEvent, getThread, getTranscript, recentChatCount, updateEvent, type ChatKind } from "@/lib/db";
import { apiLecture, error, lectureNow } from "@/lib/server";
import { quickPrompt, splitConcept, tutorReply } from "@/lib/analysis/tutor";
import { parseSummary, refreshSummary } from "@/lib/analysis/live";

const MAX_LEN = 1000;
const PER_MINUTE = Number(process.env.CHAT_PER_MINUTE ?? 8);
const KINDS: ChatKind[] = ["lost", "text", "more", "example", "missed", "again"];

// POST /api/lectures/:code/tutor { event_id, kind, text? } -> streams the tutor's reply (plain text).
// The first reply after a Lost tap starts with a [[concept]] line, which the app shows as "You're in: ...".
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const a = await apiLecture(req, (await params).code);
  if (a instanceof Response) return a;
  const s = a.session;
  const body = await req.json().catch(() => ({}));
  const kind = body.kind as ChatKind;
  if (!KINDS.includes(kind)) return error("bad kind");
  const event = await getEvent(Number(body.event_id));
  if (!event || event.actor !== a.actor || event.session_id !== s.id) return error("Not your thread", 404);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (kind === "text" && !text) return error("Type a question");
  if (text.length > MAX_LEN) return error(`Keep it under ${MAX_LEN} characters`);
  if ((await recentChatCount(a.actor, Date.now() - 60_000)) >= PER_MINUTE) {
    return error("You're sending messages quickly. Wait a few seconds and try again.", 429);
  }

  const now = lectureNow(s);
  const thread = await getThread(event.id);
  // A reopened thread (second tap within 30 s) doesn't need a second TLDR.
  if (kind === "lost" && thread.some((m) => m.role === "assistant")) return error("Already answered", 409);
  const content = kind === "text" ? text : quickPrompt(kind, event.t_ms, now);
  await addChatMessage({ session_id: s.id, event_id: event.id, device_id: a.actor, role: "user", kind, t_ms: now, content });

  const [transcript, mine] = await Promise.all([getTranscript(s.id), eventsForActor(a.actor, [s.id])]);
  if (!s.ended_at) after(() => refreshSummary(s.id).catch(() => {}));
  const reply = tutorReply({
    lecture: { title: s.title, course: a.cls?.name ?? s.course, ended: Boolean(s.ended_at), slides: s.slides_text, gradedNotes: a.cls?.graded_notes ?? "" },
    summary: parseSummary(s),
    transcript,
    nowMs: now,
    tapMs: event.t_ms,
    earlierThreads: mine.filter((e) => e.id !== event.id && e.t_ms < event.t_ms).map((e) => ({ t_ms: e.t_ms, concept: e.concept })),
    history: [...thread, { role: "user" as const, kind, content, t_ms: now }].map((m) => ({ role: m.role, kind: m.kind, content: m.content, t_ms: m.t_ms })),
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
        controller.enqueue(encoder.encode(`${full ? "\n\n" : ""}Sorry, the tutor hit an error. Try again in a moment.`));
      }
      const { concept, body: answer } = splitConcept(full);
      if (concept && !event.concept) await updateEvent(event.id, { concept: concept.charAt(0).toUpperCase() + concept.slice(1) });
      if (answer.trim()) await addChatMessage({ session_id: s.id, event_id: event.id, device_id: a.actor, role: "assistant", kind: "text", t_ms: now, content: answer.trim() });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
