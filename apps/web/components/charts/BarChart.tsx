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
  const n = props.data.length;
  const needsRotation = n > 7;
  const height = props.height ?? (needsRotation ? 260 : 220);
  const width = 640;
  const padding = { top: 32, right: 20, bottom: needsRotation ? 64 : 40, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...props.data.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
  const fmt = props.valueFormatter ?? ((v: number) => String(v));

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }).map((_, i) => (max / (tickCount - 1)) * i);

  const slotW = n > 0 ? innerW / n : innerW;
  const gap = Math.max(1, Math.min(4, slotW * 0.15));
  const barW = Math.max(2, slotW - gap * 2);
  const rx = Math.min(4, barW / 2);

  const labelStep = n <= 14 ? 1 : n <= 31 ? 2 : Math.ceil(n / 15);

  return (
    <div className="h-full w-full">
      <div className="mb-4 text-sm font-semibold text-zinc-700">{props.title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block overflow-visible">
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

        {props.data.map((d, i) => {
          const v = Number.isFinite(d.value) ? d.value : 0;
          const h = Math.max(v > 0 ? 1 : 0, (v / max) * innerH);
          const x = padding.left + i * slotW + gap;
          const y = padding.top + innerH - h;
          const color = props.color || "#3b82f6";
          const showLabel = i % labelStep === 0;
          const labelX = x + barW / 2;
          const labelY = padding.top + innerH + (needsRotation ? 10 : 16);

          return (
            <g key={`${d.label}-${i}`} className="group">
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={rx}
                fill={color}
                opacity={v === 0 ? 0.15 : 0.8}
                className="transition-opacity duration-200 hover:opacity-100"
              />

              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={n > 20 ? 9 : 11}
                fill="#18181b"
                fontWeight="600"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {fmt(v)}
              </text>

              {showLabel && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={needsRotation ? "end" : "middle"}
                  fontSize={n > 20 ? 9 : 11}
                  fill="#52525b"
                  className="font-medium"
                  transform={needsRotation ? `rotate(-45, ${labelX}, ${labelY})` : undefined}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
