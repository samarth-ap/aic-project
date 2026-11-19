// The confusion timeline and its hotspots. Pure functions, no I/O.
//
// Spec rules:
// - Lost taps are counted in 30-second buckets; each student counts once per bucket.
// - A hotspot is a run of buckets where taps are well above the lecture's average,
//   with at least max(3 students, 10% of those joined).
// - Peaks within 90 seconds of each other merge into one hotspot.

export const BUCKET_MS = 30_000;
export const MERGE_GAP_MS = 90_000;

export interface LostTap {
  actor: string;
  t_ms: number;
}
export interface Bucket {
  start_ms: number;
  students: number;
}
export interface HotspotCandidate {
  start_ms: number;
  end_ms: number;
  peak_ms: number;
  peak_students: number;
  /** Distinct students across the whole hotspot. */
  students: number;
  actors: string[];
}

export function buckets(taps: LostTap[], durationMs: number, bucketMs = BUCKET_MS): Bucket[] {
  const n = Math.max(1, Math.ceil(Math.max(durationMs, 1) / bucketMs));
  const sets: Set<string>[] = Array.from({ length: n }, () => new Set());
  for (const t of taps) {
    if (t.t_ms < 0) continue;
    sets[Math.min(n - 1, Math.floor(t.t_ms / bucketMs))].add(t.actor);
  }
  return sets.map((s, i) => ({ start_ms: i * bucketMs, students: s.size }));
}

/** Minimum distinct students for a hotspot: 3, or 10% of those who joined, whichever is larger. */
export const minStudents = (joined: number) => Math.max(3, Math.ceil(joined * 0.1));

export function findHotspots(taps: LostTap[], durationMs: number, joined: number): { buckets: Bucket[]; hotspots: HotspotCandidate[] } {
  const bs = buckets(taps, durationMs);
  const avg = bs.reduce((n, b) => n + b.students, 0) / bs.length;
  // "Well above average": at least double the lecture's mean, and at least 2 students.
  const hotLevel = Math.max(2, avg * 2);
  const hot = bs.map((b) => b.students >= hotLevel);

  // Runs of hot buckets; a run widens to neighbouring buckets that are above average
  // so the time range covers the rise and fall of the peak.
  const runs: { from: number; to: number }[] = [];
  for (let i = 0; i < bs.length; i++) {
    if (!hot[i]) continue;
    let j = i;
    while (j + 1 < bs.length && hot[j + 1]) j++;
    let from = i;
    let to = j;
    while (from > 0 && bs[from - 1].students > avg && bs[from - 1].students > 0) from--;
    while (to + 1 < bs.length && bs[to + 1].students > avg && bs[to + 1].students > 0) to++;
    runs.push({ from, to });
    i = j;
  }
  // Merge runs whose gap is within 90 seconds.
  const merged: { from: number; to: number }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && (r.from - last.to - 1) * BUCKET_MS <= MERGE_GAP_MS) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }

  const hotspots: HotspotCandidate[] = [];
  for (const r of merged) {
    const start = r.from * BUCKET_MS;
    const end = Math.min(Math.max(durationMs, start + BUCKET_MS), (r.to + 1) * BUCKET_MS);
    const actors = [...new Set(taps.filter((t) => t.t_ms >= start && t.t_ms < end).map((t) => t.actor))];
    if (actors.length < minStudents(joined)) continue;
    let peak = r.from;
    for (let k = r.from; k <= r.to; k++) if (bs[k].students > bs[peak].students) peak = k;
    hotspots.push({
      start_ms: start,
      end_ms: end,
      peak_ms: bs[peak].start_ms + BUCKET_MS / 2,
      peak_students: bs[peak].students,
      students: actors.length,
      actors,
    });
  }
  // Biggest first.
  hotspots.sort((a, b) => b.students - a.students || a.start_ms - b.start_ms);
  return { buckets: bs, hotspots };
}

/** For students: exact counts are hidden in small classes (under 10 joined). */
export function shareLabel(students: number, joined: number): string {
  if (joined < 10) return "a few students";
  return `${Math.round((students / Math.max(joined, 1)) * 100)}% of class`;
}
