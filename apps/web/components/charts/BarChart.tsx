"use client";

import React from "react";

export type BarDatum = { label: string; value: number };

export function BarChart(props: {
  title: string;
  data: BarDatum[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const height = props.height ?? 220;
  const width = 640;
  // Increased margins for labels
  const padding = { top: 32, right: 20, bottom: 40, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...props.data.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
  const fmt = props.valueFormatter ?? ((v: number) => String(v));

  // Determine ticks (rough)
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }).map((_, i) => (max / (tickCount - 1)) * i);

  const barW = props.data.length ? innerW / props.data.length : innerW;

  return (
    <div className="h-full w-full">
      <div className="mb-4 text-sm font-semibold text-zinc-700">{props.title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block overflow-visible">
        {/* Grid lines & Y-axis labels */}
        {ticks.map((t) => {
          const y = padding.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerW}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="#71717a"
                className="font-medium"
              >
                {fmt(t)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {props.data.map((d, i) => {
          const v = Number.isFinite(d.value) ? d.value : 0;
          const h = (v / max) * innerH;
          const x = padding.left + i * barW + Math.max(2, barW * 0.15);
          const w = Math.max(4, barW * 0.7);
          const y = padding.top + innerH - h;
          const color = props.color || "#3b82f6"; // Default blue-500

          return (
            <g key={d.label} className="group">
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={4}
                fill={color}
                opacity={0.8}
                className="transition-opacity duration-200 hover:opacity-100"
              />

              {/* Tooltip-like value on hover/top */}
              <text
                x={x + w / 2}
                y={y - 8}
                textAnchor="middle"
                fontSize={12}
                fill="#18181b"
                fontWeight="600"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {fmt(v)}
              </text>

              {/* X labels (if fit) */}
              <text
                x={x + w / 2}
                y={padding.top + innerH + 16}
                textAnchor="middle"
                fontSize={11}
                fill="#52525b"
                className="font-medium"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
