// Transcript helpers: parse captions files (WebVTT / SRT, e.g. exported from
// Panopto, Zoom or YouTube) and pull out the text around a moment.

export interface Seg {
  start_ms: number;
  end_ms: number;
  text: string;
}

const TS = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function toMs(stamp: string): number {
  const m = stamp.match(TS);
  if (!m) throw new Error(`Bad timestamp: ${stamp}`);
  const [, h, min, s, frac] = m;
  return (
    (Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s)) * 1000 + Number(frac.padEnd(3, "0"))
  );
}

/** Parses WebVTT or SRT. Cue numbers, headers, NOTE blocks and tags are dropped. */
export function parseCaptions(raw: string, offsetMs = 0): Seg[] {
  const blocks = raw.replace(/\r/g, "").split(/\n\s*\n/);
  const out: Seg[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx === -1) continue;
    const [a, b] = lines[idx].split("-->");
    const text = lines
      .slice(idx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    out.push({ start_ms: toMs(a) + offsetMs, end_ms: toMs(b) + offsetMs, text });
  }
  // Auto-captions often repeat the previous line; drop exact consecutive dupes.
  return out.filter((s, i) => i === 0 || s.text !== out[i - 1].text);
}

/** All transcript text overlapping [fromMs, toMs]. */
export function textBetween(segs: Seg[], fromMs: number, toMs: number): string {
  return segs
    .filter((s) => s.end_ms >= fromMs && s.start_ms <= toMs)
    .map((s) => s.text)
    .join(" ");
}

export function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Compact transcript for the LLM: merges segments into ~`chunkMs` lines prefixed with [m:ss]. */
export function stampedTranscript(segs: Seg[], chunkMs = 20_000): string {
  const lines: string[] = [];
  let cur: { start: number; parts: string[] } | null = null;
  for (const s of segs) {
    if (!cur || s.start_ms - cur.start >= chunkMs) {
      if (cur) lines.push(`[${fmt(cur.start)}] ${cur.parts.join(" ")}`);
      cur = { start: s.start_ms, parts: [] };
    }
    cur.parts.push(s.text);
  }
  if (cur) lines.push(`[${fmt(cur.start)}] ${cur.parts.join(" ")}`);
  return lines.join("\n");
}
