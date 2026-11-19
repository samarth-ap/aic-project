import { describe, expect, it } from "vitest";
import { buckets, findHotspots, minStudents, shareLabel, type LostTap } from "../lib/analysis/hotspots";

const s = 1000;
const tap = (actor: string, sec: number): LostTap => ({ actor, t_ms: sec * s });
/** n students tapping around `sec`. */
const spike = (prefix: string, n: number, sec: number) => Array.from({ length: n }, (_, i) => tap(`${prefix}${i}`, sec + (i % 20)));

describe("buckets", () => {
  it("counts each student once per 30-second bucket", () => {
    const b = buckets([tap("a", 1), tap("a", 5), tap("b", 10), tap("a", 31)], 60 * s);
    expect(b).toEqual([
      { start_ms: 0, students: 2 },
      { start_ms: 30 * s, students: 1 },
    ]);
  });
});

describe("findHotspots", () => {
  const dur = 50 * 60 * s;
  it("needs max(3, 10% of joined) students", () => {
    expect(minStudents(10)).toBe(3);
    expect(minStudents(84)).toBe(9);
    // 5 students tap together: a hotspot in a class of 30, not in a class of 84.
    expect(findHotspots(spike("x", 5, 600), dur, 30).hotspots).toHaveLength(1);
    expect(findHotspots(spike("x", 5, 600), dur, 84).hotspots).toHaveLength(0);
  });
  it("finds separate peaks, biggest first, with distinct-student counts", () => {
    const taps = [...spike("a", 11, 7 * 60 + 50), ...spike("b", 26, 21 * 60 + 30), ...spike("c", 12, 36 * 60 + 40), tap("n1", 100), tap("n2", 2000)];
    const { hotspots } = findHotspots(taps, dur, 84);
    expect(hotspots.map((h) => h.students)).toEqual([26, 12, 11]);
    expect(hotspots[0].start_ms).toBeLessThanOrEqual(21 * 60 * s + 30 * s);
    expect(hotspots[0].end_ms).toBeGreaterThan(21 * 60 * s + 30 * s);
  });
  it("merges peaks within 90 seconds into one hotspot", () => {
    const taps = [...spike("a", 6, 600), ...spike("b", 6, 600 + 110)];
    const { hotspots } = findHotspots(taps, dur, 40);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].students).toBe(12);
  });
  it("keeps peaks further apart than 90 seconds separate", () => {
    const taps = [...spike("a", 6, 600), ...spike("b", 6, 600 + 240)];
    expect(findHotspots(taps, dur, 40).hotspots).toHaveLength(2);
  });
  it("ignores a lecture where taps are spread evenly", () => {
    const taps = Array.from({ length: 100 }, (_, i) => tap(`s${i}`, i * 30));
    expect(findHotspots(taps, dur, 100).hotspots).toHaveLength(0);
  });
});

describe("shareLabel", () => {
  it("hides counts in small lectures", () => {
    expect(shareLabel(3, 8)).toBe("a few students");
    expect(shareLabel(26, 84)).toBe("31% of class");
  });
});
