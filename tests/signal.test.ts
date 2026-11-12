import { describe, expect, it } from "vitest";
import { computeSignal, dedupe, DEFAULT_CONFIG, type RawTap } from "../lib/analysis/signal";

const tap = (device: string, sec: number, kind: RawTap["kind"] = "lost"): RawTap => ({ device_id: device, kind, t_ms: sec * 1000 });
const cfg = { ...DEFAULT_CONFIG, minDevices: 3 };

describe("dedupe", () => {
  it("drops repeat taps from one device inside the cooldown", () => {
    const out = dedupe([tap("a", 10), tap("a", 12), tap("a", 30), tap("b", 11)], 8000);
    expect(out.map((t) => `${t.device_id}@${t.t_ms / 1000}`)).toEqual(["a@10", "b@11", "a@30"]);
  });
});

describe("computeSignal", () => {
  it("finds a spike and shifts it back by the reaction lag", () => {
    const taps = ["a", "b", "c", "d", "e"].map((d, i) => tap(d, 320 + i * 3));
    const s = computeSignal([...taps, tap("z", 100)], 600_000, 20, cfg);
    expect(s.moments).toHaveLength(1);
    const m = s.moments[0];
    expect(m.devices).toBe(5);
    // taps at 320-332s, lag 20s -> 300-312s -> the 300s bin
    expect(m.start_ms).toBe(300_000);
    expect(m.end_ms).toBe(330_000);
  });

  it("does not report moments below the privacy floor", () => {
    const s = computeSignal([tap("a", 200), tap("b", 205)], 600_000, 20, cfg);
    expect(s.moments).toHaveLength(0);
  });

  it("does not count 'got it' as confusion", () => {
    const s = computeSignal(["a", "b", "c", "d"].map((d) => tap(d, 200, "got_it")), 600_000, 20, cfg);
    expect(s.moments).toHaveLength(0);
    expect(s.total_taps).toBe(4);
  });

  it("ranks the biggest moment first and keeps two separate spikes apart", () => {
    const small = ["a", "b", "c"].map((d) => tap(d, 130));
    const big = ["d", "e", "f", "g", "h", "i"].map((d) => tap(d, 430));
    const s = computeSignal([...small, ...big], 600_000, 30, cfg);
    expect(s.moments.map((m) => m.devices)).toEqual([6, 3]);
    expect(s.moments[0].id).toBe("m1");
  });

  it("catches a spike whose taps straddle a bin edge", () => {
    // 5 students, split 3 + 2 across the 270s/300s bins after the lag shift
    const taps = [tap("a", 315), tap("b", 318), tap("c", 319), tap("d", 322), tap("e", 325)];
    const s = computeSignal(taps, 600_000, 48, cfg);
    expect(s.moments).toHaveLength(1);
    expect(s.moments[0].devices).toBe(5);
  });

  it("uses active students as the denominator", () => {
    const s = computeSignal(["a", "b", "c"].map((d) => tap(d, 100)), 300_000, 30, cfg);
    expect(s.moments[0].peak_rate).toBeCloseTo(3 / 30);
  });
});
