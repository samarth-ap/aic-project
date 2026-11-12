// Confusion-over-time bar chart (inline SVG, no chart library).
import { fmt } from "@/lib/client";

export interface TimelineProps {
  bins: { start_ms: number; rate: number; devices: number }[];
  binMs: number;
  durationMs: number;
  moments?: { id: string; start_ms: number; end_ms: number }[];
  concepts?: { name: string; start_ms: number }[];
  hotRate?: number;
  height?: number;
}

export function Timeline({ bins, binMs, durationMs, moments = [], concepts = [], hotRate = 0.15, height = 160 }: TimelineProps) {
  const W = 800;
  const top = concepts.length ? 28 : 8;
  const bottom = 20;
  const H = height;
  const plotH = H - top - bottom;
  const dur = Math.max(durationMs, binMs);
  const x = (ms: number) => (ms / dur) * W;
  const maxRate = Math.max(0.25, ...bins.map((b) => b.rate));
  const ticks = Math.min(10, Math.max(2, Math.floor(dur / 300_000)));
  // With moments (report view) highlight bars inside them; live view uses a rate threshold.
  const isHot = (b: { start_ms: number; rate: number; devices: number }) =>
    b.devices > 0 &&
    (moments.length ? moments.some((m) => b.start_ms >= m.start_ms && b.start_ms < m.end_ms) : b.rate >= hotRate);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of students signalling confusion over time">
      {moments.map((m) => (
        <rect key={m.id} className="band" x={x(m.start_ms)} y={top} width={Math.max(2, x(m.end_ms) - x(m.start_ms))} height={plotH} />
      ))}
      {concepts.map((c, i) => (
        <g key={i}>
          <line className="concept-line" x1={x(c.start_ms)} x2={x(c.start_ms)} y1={top - 4} y2={top + plotH} />
          <text className="concept" x={x(c.start_ms) + 3} y={top - 8 - (i % 2) * 10 + 10}>
            {c.name.length > 22 ? c.name.slice(0, 21) + "…" : c.name}
          </text>
        </g>
      ))}
      {bins.map((b) => {
        const h = (b.rate / maxRate) * plotH;
        return (
          <rect
            key={b.start_ms}
            className={`bar${isHot(b) ? " hot" : ""}`}
            x={x(b.start_ms) + 1}
            y={top + plotH - h}
            width={Math.max(1, x(binMs) - 2)}
            height={h}
            rx={2}
          >
            <title>{`${fmt(b.start_ms)} — ${b.devices} students (${Math.round(b.rate * 100)}%)`}</title>
          </rect>
        );
      })}
      {Array.from({ length: ticks + 1 }, (_, i) => (
        <text key={i} className="axis" x={Math.min(W - 24, (i / ticks) * W)} y={H - 4}>
          {fmt((i / ticks) * dur)}
        </text>
      ))}
    </svg>
  );
}
