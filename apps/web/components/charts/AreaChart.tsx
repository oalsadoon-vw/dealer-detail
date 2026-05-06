"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export type AreaDatum = { label: string; value: number };

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.round(entry.contentRect.width));
      }
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Time-series area chart. Renders a smoothed line over a vertical gradient
 * area fill — same visual language as the landing-page sparkline preview,
 * with axis labels, gridlines, and per-point hover tooltips appropriate
 * for the dashboard.
 */
export function AreaChart(props: {
  title: string;
  data: AreaDatum[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const reactId = useId();
  const gradientId = `area-grad-${reactId.replace(/[:]/g, "")}`;
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>();

  const n = props.data.length;
  const fmt = props.valueFormatter ?? ((v: number) => String(v));
  const color = props.color || "#3b82f6";

  // Adapt label rotation + density to rendered pixel width (mirrors BarChart).
  const effectiveWidth = containerWidth || 640;
  const needsRotation =
    effectiveWidth < 480 ? n > 4 : effectiveWidth < 600 ? n > 7 : n > 14;

  const minPxPerLabel = needsRotation ? 24 : 56;
  const maxLabels = Math.max(2, Math.floor(effectiveWidth / minPxPerLabel));
  const labelStep = n <= maxLabels ? 1 : Math.ceil(n / maxLabels);

  const height = props.height ?? (needsRotation ? 260 : 220);
  const width = 640;
  const padding = {
    top: 32,
    right: 20,
    bottom: needsRotation ? 64 : 40,
    left: 60,
  };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = props.data.map((d) =>
    Number.isFinite(d.value) ? d.value : 0
  );
  const max = Math.max(1, ...values);
  const allZero = n > 0 && values.every((v) => v <= 0);

  const tickCount = 5;
  const ticks = Array.from(
    { length: tickCount },
    (_, i) => (max / (tickCount - 1)) * i
  );

  // X coordinates: evenly spaced across innerW. Single-point fallback centers.
  const xStep = n > 1 ? innerW / (n - 1) : innerW;
  const points = props.data.map((d, i) => {
    const v = values[i];
    const x =
      n === 1
        ? padding.left + innerW / 2
        : padding.left + i * xStep;
    const y = padding.top + innerH - (v / max) * innerH;
    return { x, y, v, label: d.label };
  });

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`
    )
    .join(" ");

  // Close the area to the bottom of the plot box.
  const baselineY = padding.top + innerH;
  const areaPath =
    points.length > 0
      ? `${linePath} L${(padding.left + innerW).toFixed(2)},${baselineY} L${padding.left.toFixed(2)},${baselineY} Z`
      : "";

  return (
    <div ref={containerRef} className="h-full w-full min-w-0">
      <div className="mb-4 text-sm font-semibold text-zinc-700">
        {props.title}
      </div>
      {allZero ? (
        <div
          className="flex items-center justify-center text-xs text-zinc-400 italic"
          style={{ height }}
        >
          No activity in this range
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block overflow-visible"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Gridlines + Y-axis tick labels */}
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

          {/* Area fill */}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

          {/* Line on top */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Per-point hover targets, dots, value tooltips, and X labels */}
          {points.map((p, i) => {
            const showLabel = i % labelStep === 0;
            const labelY = padding.top + innerH + (needsRotation ? 10 : 16);
            const hitX = n === 1 ? padding.left : p.x - xStep / 2;
            const hitW = n === 1 ? innerW : xStep;

            return (
              <g key={`${p.label}-${i}`} className="group">
                {/* Invisible hit zone */}
                <rect
                  x={hitX}
                  y={padding.top}
                  width={hitW}
                  height={innerH}
                  fill="transparent"
                />

                {/* Hover dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill="white"
                  stroke={color}
                  strokeWidth={2}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />

                {/* Hover value tooltip */}
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fontSize={n > 20 ? 9 : 11}
                  fill="#18181b"
                  fontWeight={600}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {fmt(p.v)}
                </text>

                {/* X-axis label */}
                {showLabel && (
                  <text
                    x={p.x}
                    y={labelY}
                    textAnchor={needsRotation ? "end" : "middle"}
                    fontSize={n > 20 ? 9 : 11}
                    fill="#52525b"
                    className="font-medium"
                    transform={
                      needsRotation
                        ? `rotate(-45, ${p.x}, ${labelY})`
                        : undefined
                    }
                  >
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
