"use client";

import React, { useMemo, useState } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { Pie } from "@visx/shape";
import {
  useTooltip,
  TooltipWithBounds,
  defaultStyles as defaultTooltipStyles,
} from "@visx/tooltip";
import { localPoint } from "@visx/event";

export type PieDatum = { label: string; value: number; color?: string };

type Props = {
  title: string;
  data: PieDatum[];
  valueFormatter?: (v: number) => string;
};

/**
 * Linear/Arc-style donut: a vibrant categorical palette, hover-highlighted
 * wedge with a floating tooltip, and a flexible legend that always keeps
 * labels visible (no zero-width truncation in narrow containers).
 */
const DEFAULT_PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#3b82f6", // blue
  "#84cc16", // lime
];

const tooltipStyles = {
  ...defaultTooltipStyles,
  background: "rgb(var(--surface-3))",
  color: "rgb(var(--text))",
  border: "1px solid rgb(var(--border))",
  borderRadius: 8,
  padding: "8px 10px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
};

export function PieChart({ title, data, valueFormatter }: Props) {
  const fmt = valueFormatter ?? ((v: number) => String(v));

  const cleaned = useMemo(
    () =>
      data
        .map((x, i) => ({
          ...x,
          value: Number.isFinite(x.value) ? x.value : 0,
          color: x.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
        }))
        .filter((x) => x.value > 0),
    [data]
  );

  const total = cleaned.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-full w-full min-w-0">
      <div className="mb-3 text-sm font-semibold text-fg-strong">{title}</div>
      <div className="flex flex-col sm:flex-row items-center gap-6 min-w-0">
        <div className="shrink-0">
          <ParentSize debounceTime={120}>
            {({ width }) => {
              const size = Math.min(220, Math.max(160, width));
              return (
                <DonutSvg
                  size={size}
                  data={cleaned}
                  total={total}
                  fmt={fmt}
                />
              );
            }}
          </ParentSize>
        </div>

        <Legend data={cleaned} total={total} fmt={fmt} />
      </div>
    </div>
  );
}

type CleanedDatum = PieDatum & { color: string };

function DonutSvg({
  size,
  data,
  total,
  fmt,
}: {
  size: number;
  data: CleanedDatum[];
  total: number;
  fmt: (v: number) => string;
}) {
  const tooltip = useTooltip<CleanedDatum>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const half = size / 2;
  const outerR = half - 6;
  const innerR = outerR * 0.62;
  const accessor = (d: CleanedDatum) => d.value;

  function onMouseMove(
    event: React.MouseEvent<SVGPathElement>,
    datum: CleanedDatum
  ) {
    const point = localPoint(event);
    if (!point) return;
    tooltip.showTooltip({
      tooltipLeft: point.x,
      tooltipTop: point.y,
      tooltipData: datum,
    });
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs italic text-fg-subtle"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block motion-safe:animate-pop-in"
      >
        <Group top={half} left={half}>
          <Pie<CleanedDatum>
            data={data}
            pieValue={accessor}
            outerRadius={outerR}
            innerRadius={innerR}
            cornerRadius={2}
            padAngle={0.012}
          >
            {(pie) =>
              pie.arcs.map((arc, i) => {
                const path = pie.path(arc) ?? "";
                const isHover = hoverIndex === i;
                const dimmed = hoverIndex !== null && !isHover;
                return (
                  <path
                    key={`${arc.data.label}-${i}`}
                    d={path}
                    fill={arc.data.color}
                    opacity={dimmed ? 0.45 : 1}
                    style={{
                      transition: "opacity 140ms ease-out",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      setHoverIndex(i);
                      onMouseMove(e, arc.data);
                    }}
                    onMouseMove={(e) => onMouseMove(e, arc.data)}
                    onMouseLeave={() => {
                      setHoverIndex(null);
                      tooltip.hideTooltip();
                    }}
                  />
                );
              })
            }
          </Pie>

          {/* Center label */}
          <text
            textAnchor="middle"
            y={-4}
            fontSize={11}
            fill="rgb(var(--text-subtle))"
            style={{
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Total
          </text>
          <text
            textAnchor="middle"
            y={16}
            fontSize={16}
            fontWeight={700}
            fill="rgb(var(--text-strong))"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmt(total)}
          </text>
        </Group>
      </svg>

      {tooltip.tooltipOpen && tooltip.tooltipData && (
        <TooltipWithBounds
          top={tooltip.tooltipTop}
          left={tooltip.tooltipLeft}
          style={tooltipStyles}
        >
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: tooltip.tooltipData.color }}
              />
              {tooltip.tooltipData.label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-fg-strong">
              {fmt(tooltip.tooltipData.value)}{" "}
              <span className="font-normal text-fg-subtle">
                · {Math.round((tooltip.tooltipData.value / total) * 100)}%
              </span>
            </span>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

function Legend({
  data,
  total,
  fmt,
}: {
  data: CleanedDatum[];
  total: number;
  fmt: (v: number) => string;
}) {
  if (data.length === 0) {
    return <div className="text-sm italic text-fg-subtle">No data</div>;
  }
  return (
    <ul className="w-full flex-1 min-w-0 space-y-1.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
      {data.map((s) => (
        <li
          key={s.label}
          className="flex items-center justify-between gap-3 text-sm group min-w-0"
        >
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: s.color }}
            />
            <span
              className="truncate font-medium text-fg group-hover:text-fg-strong transition-colors"
              title={s.label}
            >
              {s.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
            <span className="font-mono font-semibold text-fg">
              {fmt(s.value)}
            </span>
            <span className="text-[11px] text-fg-subtle">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
