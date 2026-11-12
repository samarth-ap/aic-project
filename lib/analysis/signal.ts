// Turns raw taps into a confusion timeline and a list of "moments" (spikes).
// Pure functions, no I/O, so they are easy to unit-test and tune.

export type Kind = "lost" | "too_fast" | "example" | "got_it";
export interface RawTap {
  device_id: string;
  kind: Kind;
  t_ms: number;
}

export interface SignalConfig {
  /** Students tap a little after they get lost. Shift taps back by this much. */
  lagMs: number;
  /** Timeline resolution. */
  binMs: number;
  /** Ignore repeat taps from the same device within this window (anti-spam). */
  cooldownMs: number;
  /** Privacy + noise floor: a moment needs at least this many distinct students. */
  minDevices: number;
  /** A bin is "hot" if this share of active students tapped in it... */
  minRate: number;
  /** ...and it is at least this many times the session's median bin. */
  baselineMultiple: number;
}

export const DEFAULT_CONFIG: SignalConfig = {
  lagMs: 20_000,
  binMs: 30_000,
  cooldownMs: 8_000,
  minDevices: Number(process.env.MIN_DEVICES ?? 3),
  minRate: 0.08,
  baselineMultiple: 2,
};

const CONFUSION: Kind[] = ["lost", "too_fast", "example"];

export interface Bin {
  start_ms: number;
  devices: number; // distinct students who signalled confusion in this bin
  rate: number; // devices / active students
  kinds: Record<Kind, number>;
}

export interface Moment {
  id: string;
  start_ms: number; // lag-corrected
  end_ms: number;
  peak_ms: number;
  devices: number; // distinct students across the whole moment
  peak_rate: number;
  kinds: Record<Kind, number>;
  /** Device ids in this moment. Server-side only (for catch-up cards); never shown to professors. */
  device_ids: string[];
}

export interface Signal {
  config: SignalConfig;
  duration_ms: number;
  active_devices: number;
  total_taps: number;
  bins: Bin[];
  moments: Moment[];
}

const emptyKinds = (): Record<Kind, number> => ({ lost: 0, too_fast: 0, example: 0, got_it: 0 });

/** Drops taps from a device that come within `cooldownMs` of its previous accepted tap. */
export function dedupe(taps: RawTap[], cooldownMs: number): RawTap[] {
  const last = new Map<string, number>();
  const out: RawTap[] = [];
  for (const t of [...taps].sort((a, b) => a.t_ms - b.t_ms)) {
    const prev = last.get(t.device_id);
    if (prev !== undefined && t.t_ms - prev < cooldownMs) continue;
    last.set(t.device_id, t.t_ms);
    out.push(t);
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeSignal(
  rawTaps: RawTap[],
  durationMs: number,
  joinedDevices: number,
  config: SignalConfig = DEFAULT_CONFIG,
): Signal {
  const taps = dedupe(rawTaps, config.cooldownMs);
  // Everyone who tapped anything (incl. "got it") or joined counts as active.
  const active = Math.max(joinedDevices, new Set(taps.map((t) => t.device_id)).size, 1);
  const nBins = Math.max(1, Math.ceil(durationMs / config.binMs));

  const binDevices: Set<string>[] = Array.from({ length: nBins }, () => new Set());
  const bins: Bin[] = Array.from({ length: nBins }, (_, i) => ({
    start_ms: i * config.binMs,
    devices: 0,
    rate: 0,
    kinds: emptyKinds(),
  }));

  for (const t of taps) {
    const shifted = t.kind === "got_it" ? t.t_ms : Math.max(0, t.t_ms - config.lagMs);
    const i = Math.min(nBins - 1, Math.floor(shifted / config.binMs));
    bins[i].kinds[t.kind]++;
    if (CONFUSION.includes(t.kind)) binDevices[i].add(t.device_id);
  }
  bins.forEach((b, i) => {
    b.devices = binDevices[i].size;
    b.rate = b.devices / active;
  });

  // A spike's taps often straddle a bin edge, so judge each bin by the distinct
  // students in a sliding window of it and its neighbours.
  const windowRate = bins.map((_, i) => {
    const ids = new Set<string>();
    for (let k = Math.max(0, i - 1); k <= Math.min(nBins - 1, i + 1); k++) binDevices[k].forEach((d) => ids.add(d));
    return ids.size / active;
  });
  // Baseline = what a 3-bin window would hold at the lecture's typical (median)
  // per-bin rate. In a lecture where students tap steadily all the way
  // through, only windows well above that count.
  const baseline = median(bins.map((b) => b.rate)) * 3;
  const hot = bins.map(
    (b, i) => b.devices > 0 && windowRate[i] >= config.minRate && windowRate[i] >= baseline * config.baselineMultiple,
  );
  // If every active bin is "hot" relative to itself (e.g. one big spike only), keep them.
  if (!hot.some(Boolean)) bins.forEach((b, i) => (hot[i] = b.devices > 0 && windowRate[i] >= config.minRate));

  // Merge adjacent hot bins (allowing a one-bin gap) into moments.
  const moments: Moment[] = [];
  let i = 0;
  while (i < nBins) {
    if (!hot[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < nBins && (hot[j + 1] || (j + 2 < nBins && hot[j + 2]))) j++;
    const ids = new Set<string>();
    const kinds = emptyKinds();
    let peak = i;
    for (let k = i; k <= j; k++) {
      binDevices[k].forEach((d) => ids.add(d));
      (Object.keys(kinds) as Kind[]).forEach((kk) => (kinds[kk] += bins[k].kinds[kk]));
      if (bins[k].rate > bins[peak].rate) peak = k;
    }
    if (ids.size >= config.minDevices) {
      moments.push({
        id: `m${moments.length + 1}`,
        start_ms: bins[i].start_ms,
        end_ms: Math.min(durationMs, bins[j].start_ms + config.binMs),
        peak_ms: bins[peak].start_ms + config.binMs / 2,
        devices: ids.size,
        peak_rate: bins[peak].rate,
        kinds,
        device_ids: [...ids],
      });
    }
    i = j + 1;
  }

  // Biggest moments first.
  moments.sort((a, b) => b.devices - a.devices || b.peak_rate - a.peak_rate);
  moments.forEach((m, k) => (m.id = `m${k + 1}`));

  return {
    config,
    duration_ms: durationMs,
    active_devices: active,
    total_taps: taps.length,
    bins,
    moments,
  };
}
