"use client";
// Confusion-over-time bar chart (inline SVG, no chart library).
// Drawn at the container's real pixel width, so labels stay readable on phones.
import { useEffect, useRef, useState } from "react";
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
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = W < 520;
  // Concept names don't fit on a phone-width chart; the outline below the chart lists them.
  const labels = narrow ? [] : concepts;
  const top = labels.length ? 28 : 8;
  const bottom = 20;
  const H = height;
  const plotH = H - top - bottom;
  const dur = Math.max(durationMs, binMs);
  const x = (ms: number) => (ms / dur) * W;
  const maxRate = Math.max(0.25, ...bins.map((b) => b.rate));
  // Roughly one tick per 5 minutes, but never closer than ~80px apart.
  const ticks = Math.max(2, Math.min(10, Math.floor(dur / 300_000), Math.floor(W / 80)));
  const maxLabel = Math.max(8, Math.floor(W / 40));
  // With moments (report view) highlight bars inside them; live view uses a rate threshold.
  const isHot = (b: { start_ms: number; rate: number; devices: number }) =>
    b.devices > 0 &&
    (moments.length ? moments.some((m) => b.start_ms >= m.start_ms && b.start_ms < m.end_ms) : b.rate >= hotRate);

  return (
    <div ref={ref} className="chart-wrap">
    <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of students signalling confusion over time">
      {moments.map((m) => (
        <rect key={m.id} className="band" x={x(m.start_ms)} y={top} width={Math.max(2, x(m.end_ms) - x(m.start_ms))} height={plotH} />
      ))}
      {labels.map((c, i) => (
        <g key={i}>
          <line className="concept-line" x1={x(c.start_ms)} x2={x(c.start_ms)} y1={top - 4} y2={top + plotH} />
          <text className="concept" x={x(c.start_ms) + 3} y={top - 8 - (i % 2) * 10 + 10}>
            {c.name.length > maxLabel ? c.name.slice(0, maxLabel - 1) + "…" : c.name}
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
        <text
          key={i}
          className="axis"
          x={(i / ticks) * W}
          y={H - 4}
          textAnchor={i === 0 ? "start" : i === ticks ? "end" : "middle"}
        >
          {fmt((i / ticks) * dur)}
        </text>
      ))}
    </svg>
    </div>
  );
}
