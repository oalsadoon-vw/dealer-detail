"use client";

import React, { useMemo } from "react";

export type PieDatum = { label: string; value: number; color?: string };

// Vibrant color palette
const DEFAULT_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#6366f1", // Indigo
  "#84cc16", // Lime
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} Z`;
}

export function PieChart(props: {
  title: string;
  data: PieDatum[];
  valueFormatter?: (v: number) => string;
}) {
  const fmt = props.valueFormatter ?? ((v: number) => String(v));

  const cleaned = useMemo(() => {
    return props.data
      .map((x) => ({ ...x, value: Number.isFinite(x.value) ? x.value : 0 }))
      .filter((x) => x.value > 0);
  }, [props.data]);

  const total = cleaned.reduce((s, d) => s + d.value, 0) || 1;

  const slices = useMemo(() => {
    let angle = 0;
    return cleaned.map((d, idx) => {
      const frac = d.value / total;
      const start = angle;
      const end = angle + frac * 360;
      angle = end;
      return {
        ...d,
        start,
        end,
        color: d.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
      };
    });
  }, [cleaned, total]);

  return (
    <div className="h-full w-full">
      <div className="mb-4 text-sm font-semibold text-zinc-700">{props.title}</div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <svg viewBox="0 0 220 220" className="w-52 h-52 shrink-0">
          {slices.map((s) => (
            <g key={s.label} className="group cursor-pointer">
              <path
                d={arcPath(110, 110, 90, s.start, s.end)}
                fill={s.color}
                className="transition-opacity hover:opacity-80"
              />
              <title>
                {s.label}: {fmt(s.value)} ({Math.round((s.value / total) * 100)}%)
              </title>
            </g>
          ))}
          {/* Inner donut hole */}
          <circle cx="110" cy="110" r="55" fill="white" />
          <text x="110" y="108" textAnchor="middle" fontSize="12" fill="#71717a">
            Total
          </text>
          <text x="110" y="130" textAnchor="middle" fontSize="14" fontWeight="700" fill="#18181b">
            {fmt(total)}
          </text>
        </svg>

        <div className="flex-1 space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 text-sm group">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full shadow-sm" style={{ background: s.color }} />
                <span className="text-zinc-600 font-medium group-hover:text-zinc-900 transition-colors truncate max-w-[120px]" title={s.label}>
                  {s.label}
                </span>
              </div>
              <div className="font-mono text-zinc-700 font-semibold">{fmt(s.value)}</div>
            </div>
          ))}
          {cleaned.length === 0 && <div className="text-sm text-zinc-400 italic">No data available</div>}
        </div>
      </div>
    </div>
  );
}
