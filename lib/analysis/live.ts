// The running summary of a live lecture: a short summary and the concepts covered
// so far with their start times. Refreshed about once a minute while the
// professor's transcript comes in; the tutor reads it at every Lost tap.
import { z } from "zod";
import { stampedTranscript, type Seg } from "./transcript";
import { aiJson, aiProvider } from "./llm";
import { getSessionById, getTranscript, setSessionFields, type Session } from "../db";

export interface LiveSummary {
  summary: string;
  concepts: { name: string; start_ms: number }[];
  /** "offline" = concepts are guessed from the transcript's first words (no AI); not shown to students as "You're in". */
  source?: "ai" | "offline";
}

const Schema = z.object({
  summary: z.string().describe("3-5 sentences: what the lecture has covered so far"),
  concepts: z
    .array(z.object({ name: z.string().describe("2-5 word concept name, lowercase"), start_s: z.number().describe("Seconds from lecture start") }))
    .describe("Concepts covered so far, in order"),
});

export const REFRESH_MS = 60_000;

export function parseSummary(s: Session): LiveSummary | null {
  if (!s.summary_json) return null;
  try {
    return JSON.parse(s.summary_json) as LiveSummary;
  } catch {
    return null;
  }
}

/** Without AI: one "concept" per ~5 minutes, named by its first words, so the tutor and map still have anchors. */
export function offlineSummary(segs: Seg[]): LiveSummary {
  const concepts: LiveSummary["concepts"] = [];
  let next = 0;
  for (const s of segs) {
    if (s.start_ms < next) continue;
    concepts.push({ name: s.text.split(/\s+/).slice(0, 5).join(" ").replace(/[.,;:!?]+$/, "").toLowerCase(), start_ms: s.start_ms });
    next = s.start_ms + 5 * 60_000;
  }
  return { summary: segs.slice(-3).map((s) => s.text).join(" ").slice(0, 400), concepts, source: "offline" };
}

/** Refreshes the running summary if it's older than a minute. Safe to call often. */
export async function refreshSummary(sessionId: number, force = false): Promise<LiveSummary | null> {
  const s = await getSessionById(sessionId);
  if (!s) return null;
  if (!force && s.summary_at && Date.now() - s.summary_at < REFRESH_MS) return parseSummary(s);
  // Claim the slot first so concurrent requests don't all call the model.
  await setSessionFields(s.id, { summary_at: Date.now() });
  const segs = await getTranscript(s.id);
  if (!segs.length) return parseSummary(s);
  let out: LiveSummary;
  if (aiProvider()) {
    try {
      const prev = parseSummary(s);
      const r = await aiJson({
        schema: Schema,
        name: "live_summary",
        tier: "fast",
        maxTokens: 1500,
        system: "You keep a running summary of a live university lecture from its speech-to-text transcript. Be brief and concrete. Keep earlier concept names stable when they still fit.",
        user: `Lecture: "${s.title}" (${s.course})
${prev ? `Previous concept list: ${prev.concepts.map((c) => c.name).join("; ")}\n` : ""}
<transcript>
${stampedTranscript(segs.slice(-400))}
</transcript>
${s.slides_text ? `\n<slides>\n${s.slides_text.slice(0, 4000)}\n</slides>` : ""}`,
      });
      out = { summary: r.summary, concepts: r.concepts.map((c) => ({ name: c.name, start_ms: Math.round(c.start_s * 1000) })), source: "ai" };
    } catch (e) {
      console.error("live summary failed", e);
      out = offlineSummary(segs);
    }
  } else {
    const prev = parseSummary(s);
    // Keep a concept list someone provided (e.g. the demo seed); only replace earlier guesses.
    out = prev && prev.source !== "offline" ? prev : offlineSummary(segs);
  }
  await setSessionFields(s.id, { summary_json: JSON.stringify(out), summary_at: Date.now() });
  return out;
}
