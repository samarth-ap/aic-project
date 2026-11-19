// Client-safe helpers for the tutor's reply format (no server imports).

/** Splits the leading [[concept]] tag off a tutor reply. Works on partial (streaming) text too. */
export function splitConcept(text: string): { concept: string; body: string } {
  const m = text.match(/^\s*\[\[([^\]\n]{0,80})\]\]\s*/);
  if (m) return { concept: m[1].trim(), body: text.slice(m[0].length) };
  // Still streaming the tag: hide it until it closes.
  if (/^\s*\[\[[^\]\n]{0,80}$/.test(text)) return { concept: "", body: "" };
  return { concept: "", body: text };
}

/** A TLDR: a headline sentence, the rest of the text, and an optional "Example:" line. */
export function tldrParts(body: string): { headline: string; rest: string; example: string } {
  const lines = body.trim().split(/\n+/);
  const exIdx = lines.findIndex((l) => /^example:/i.test(l.trim()));
  const example = exIdx >= 0 ? lines.splice(exIdx).join("\n").replace(/^example:\s*/i, "") : "";
  const text = lines.join("\n").trim();
  const m = text.match(/^(.{8,160}?[.!?])(\s+|$)([\s\S]*)$/);
  return m ? { headline: m[1], rest: m[3].trim(), example } : { headline: "", rest: text, example };
}
