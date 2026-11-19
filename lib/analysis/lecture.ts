// After the lecture ends: compute hotspots, build the concept map, group the
// questions students asked the tutor at each hotspot, and draft a TLDR per
// hotspot for the professor to review. Nothing reaches students as coming from
// the professor until the professor publishes it.
import crypto from "node:crypto";
import { z } from "zod";
import { findHotspots, type Bucket } from "./hotspots";
import { fmt, stampedTranscript, textBetween, type Seg } from "./transcript";
import { aiJson, aiProvider } from "./llm";
import { offlineSummary, parseSummary } from "./live";
import {
  countPresence,
  eventsForSession,
  getSessionById,
  getTranscript,
  lostTaps,
  replaceHotspots,
  setEventConcepts,
  setSessionFields,
  typedQuestions,
  type ConfusionEvent,
  type Session,
} from "../db";

export interface Concept {
  id: string;
  name: string;
  parent_id: string | null;
  start_ms: number;
  summary: string;
}
export interface LectureInsights {
  generated_at: number;
  mode: "ai" | "offline";
  warning?: string;
  duration_ms: number;
  joined: number;
  buckets: Bucket[];
  concepts: Concept[];
  stats: { lost_taps: number; students_lost: number; events: number; resolved: number };
}

export const hashActor = (a: string) => crypto.createHash("sha256").update(a).digest("hex").slice(0, 24);

export function parseInsights(s: Session): LectureInsights | null {
  if (!s.insights_json) return null;
  try {
    return JSON.parse(s.insights_json) as LectureInsights;
  } catch {
    return null;
  }
}

/** Resolved = the student marked "Got it", or closed the tutor without a longer follow-up. */
export const isResolved = (e: Pick<ConfusionEvent, "status" | "closed_at_ms" | "followups">) =>
  e.status === "got_it" || (e.closed_at_ms != null && e.followups === 0 && e.status !== "fuzzy");

/** Groups near-identical questions (offline): same words after lowercasing and stripping punctuation. */
export function groupQuestions(qs: string[]): { text: string; count: number }[] {
  const groups = new Map<string, { text: string; count: number }>();
  for (const q of qs) {
    const key = q.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { text: q.trim(), count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

/** The concept whose time range holds `tMs` (concepts in order; the last one runs to the end). */
export function conceptFor(concepts: Concept[], tMs: number): Concept | null {
  const leaves = concepts.filter((c) => c.parent_id !== null || concepts.length === 1);
  const pool = (leaves.length ? leaves : concepts).slice().sort((a, b) => a.start_ms - b.start_ms);
  let hit: Concept | null = pool[0] ?? null;
  for (const c of pool) if (c.start_ms <= tMs) hit = c;
  return hit;
}

const AiOut = z.object({
  root: z.string().describe("The lecture's main topic, 1-4 words, e.g. 'Recursion'"),
  concepts: z
    .array(
      z.object({
        id: z.string().describe("Short id like c1"),
        name: z.string().describe("2-5 word concept name in sentence case, e.g. 'Base cases'"),
        parent_id: z.string().nullable().describe("id of a broader concept from this list it belongs under, or null for top level"),
        start_s: z.number().describe("Seconds from lecture start where it begins"),
        summary: z.string().describe("One plain sentence on what was taught"),
      }),
    )
    .describe("The concepts taught, in the order and hierarchy the professor introduced them (4-12)"),
  hotspots: z.array(
    z.object({
      id: z.string().describe("The hotspot id you were given"),
      concept_id: z.string(),
      quote: z.string().describe("Verbatim quote (<= 40 words) from the transcript where students got lost"),
      questions: z
        .array(z.object({ text: z.string().describe("Paraphrased question, never identifying a student"), count: z.number() }))
        .describe("Students' tutor questions at this hotspot, grouped by meaning, most common first (max 4)"),
      draft_tldr: z
        .string()
        .describe("A clarification the professor can publish to the class: 2-3 plain sentences, <= 60 words, in the professor's voice"),
    }),
  ),
});

export async function processLecture(sessionId: number): Promise<LectureInsights> {
  const s = (await getSessionById(sessionId))!;
  const [taps, transcript, events, questions, present] = await Promise.all([
    lostTaps(s.id),
    getTranscript(s.id),
    eventsForSession(s.id),
    typedQuestions(s.id),
    countPresence(s.id),
  ]);
  const lastEvent = Math.max(0, ...taps.map((t) => t.t_ms), ...transcript.map((t) => t.end_ms));
  const duration = Math.max(s.ended_at ? s.ended_at - s.started_at : lastEvent, lastEvent, 60_000);
  const joined = Math.max(present, new Set(taps.map((t) => t.actor)).size);
  const { buckets, hotspots } = findHotspots(taps, duration, joined);

  const qsFor = (h: { start_ms: number; end_ms: number }) =>
    questions.filter((q) => q.event_t_ms >= h.start_ms - 30_000 && q.event_t_ms <= h.end_ms + 30_000).map((q) => q.text);

  let mode: LectureInsights["mode"] = "offline";
  let warning: string | undefined;
  let concepts: Concept[] = [];
  let perHotspot = new Map<string, { concept: string; quote: string; questions: { text: string; count: number }[]; draft: string }>();

  if (aiProvider() && transcript.length) {
    try {
      const ai = await aiJson({
        schema: AiOut,
        name: "lecture_insights",
        tier: "smart",
        maxTokens: 12000,
        system:
          "You analyse a university lecture after it ends, from its transcript and the moments where students tapped Lost. Write for a busy professor: specific, plain, kind. Never identify individual students.",
        user: `Lecture: "${s.title}" (${s.course})

<transcript>
${stampedTranscript(transcript)}
</transcript>
${s.slides_text ? `\n<slides>\n${s.slides_text.slice(0, 6000)}\n</slides>\n` : ""}
<hotspots>
${hotspots
  .map(
    (h, i) => `- id h${i + 1}: ${fmt(h.start_ms)}-${fmt(h.end_ms)}, ${h.students} of ${joined} students tapped Lost
  questions they typed to the tutor: ${qsFor(h).slice(0, 40).map((q) => JSON.stringify(q.slice(0, 200))).join(", ") || "(none)"}`,
  )
  .join("\n") || "(none)"}
</hotspots>

Split the lecture into concepts (with hierarchy) for a concept map, then for each hotspot name its concept, quote where it went wrong (look 30-90 seconds before the hotspot too: students tap after they get lost), group the questions, and draft a short clarification.`,
      });
      const byId = new Map(ai.concepts.map((c) => [c.id, c]));
      concepts = [
        { id: "root", name: ai.root, parent_id: null, start_ms: 0, summary: "" },
        ...ai.concepts.map((c) => ({
          id: c.id,
          name: c.name,
          parent_id: c.parent_id && byId.has(c.parent_id) && c.parent_id !== c.id ? c.parent_id : "root",
          start_ms: Math.round(c.start_s * 1000),
          summary: c.summary,
        })),
      ];
      perHotspot = new Map(
        ai.hotspots.map((h) => [h.id, { concept: byId.get(h.concept_id)?.name ?? "", quote: h.quote, questions: h.questions, draft: h.draft_tldr }]),
      );
      mode = "ai";
    } catch (e) {
      console.error("lecture processing failed", e);
      warning = `AI analysis failed, showing a basic version: ${(e as Error).message}`;
    }
  } else if (!transcript.length) {
    warning = "No transcript was recorded, so concepts and excerpts are missing.";
  } else {
    warning = "AI is off on this server (set ANTHROPIC_API_KEY or GROQ_API_KEY), so concept names and draft clarifications are basic.";
  }

  if (!concepts.length) concepts = offlineConcepts(s, transcript);

  const rows = hotspots.map((h, i) => {
    const a = perHotspot.get(`h${i + 1}`);
    const window = textBetween(transcript as Seg[], h.start_ms - 60_000, h.end_ms);
    const concept = a?.concept || conceptFor(concepts, h.start_ms)?.name || `Around ${fmt(h.start_ms)}`;
    return {
      start_ms: h.start_ms,
      end_ms: h.end_ms,
      students: h.students,
      concept,
      excerpt: a?.quote || window.split(/\s+/).slice(-40).join(" "),
      questions_json: JSON.stringify(a?.questions ?? groupQuestions(qsFor(h))),
      draft: a?.draft ?? "",
      actors_json: JSON.stringify(h.actors.map(hashActor)),
      rank: i + 1,
    };
  });
  await replaceHotspots(s.id, rows);

  // Label every Lost moment with the concept-map concept it falls in, so maps, moments and study topics line up.
  await setEventConcepts(
    events.map((e) => ({ id: e.id, concept: conceptFor(concepts, Math.max(0, e.t_ms - 15_000))?.name || e.concept })).filter((u) => u.concept),
  );

  const insights: LectureInsights = {
    generated_at: Date.now(),
    mode,
    warning,
    duration_ms: duration,
    joined,
    buckets,
    concepts,
    stats: {
      lost_taps: taps.length,
      students_lost: new Set(taps.map((t) => t.actor)).size,
      events: events.length,
      resolved: events.filter(isResolved).length,
    },
  };
  await setSessionFields(s.id, { insights_json: JSON.stringify(insights), processed_at: Date.now() });
  return insights;
}

function offlineConcepts(s: Session, transcript: Seg[]): Concept[] {
  const live = parseSummary(s) ?? offlineSummary(transcript);
  const root: Concept = { id: "root", name: s.title, parent_id: null, start_ms: 0, summary: "" };
  return [
    root,
    ...live.concepts.map((c, i) => ({
      id: `c${i + 1}`,
      name: c.name.charAt(0).toUpperCase() + c.name.slice(1),
      parent_id: "root",
      start_ms: c.start_ms,
      summary: "",
    })),
  ];
}
