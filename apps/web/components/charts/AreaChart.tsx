"use client";

import React, { useId, useMemo } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { LinePath, AreaClosed, Bar } from "@visx/shape";
import { scaleLinear, scaleBand } from "@visx/scale";
import { GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import { curveMonotoneX } from "@visx/curve";
import {
  useTooltip,
  TooltipWithBounds,
  defaultStyles as defaultTooltipStyles,
} from "@visx/tooltip";
import { localPoint } from "@visx/event";

export type AreaDatum = { label: string; value: number };

type Props = {
  title: string;
  data: AreaDatum[];
  height?: number;
  /**
   * Optional explicit accent color for the line + gradient. Defaults to
   * the theme `--accent` token, which is dark/light aware.
   */
  color?: string;
  valueFormatter?: (v: number) => string;
};

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

export function AreaChart(props: Props) {
  return (
    <div className="h-full w-full min-w-0">
      <div className="mb-3 text-sm font-semibold text-fg-strong">
        {props.title}
      </div>
      <ParentSize debounceTime={120}>
        {({ width }) =>
          width > 0 ? (
            <AreaChartInner width={width} {...props} />
          ) : (
            <div style={{ height: props.height ?? 220 }} />
          )
        }
      </ParentSize>
    </div>
  );
}

type InnerProps = Props & { width: number };

function AreaChartInner({
  width,
  data,
  height: heightProp,
  color,
  valueFormatter,
}: InnerProps) {
  const fmt = valueFormatter ?? ((v: number) => String(v));
  const accent = color ?? "rgb(var(--accent))";
  const n = data.length;

  // Adaptive label density (mirrors the old chart's behavior).
  const needsRotation = width < 480 ? n > 4 : width < 600 ? n > 7 : n > 14;
  const minPxPerLabel = needsRotation ? 24 : 56;
  const maxLabels = Math.max(2, Math.floor(width / minPxPerLabel));
  const labelStep = n <= maxLabels ? 1 : Math.ceil(n / maxLabels);

  const height = heightProp ?? (needsRotation ? 240 : 200);
  const margin = {
    top: 16,
    right: 12,
    bottom: needsRotation ? 56 : 32,
    left: 48,
  };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const values = useMemo(
    () => data.map((d) => (Number.isFinite(d.value) ? d.value : 0)),
    [data]
  );
  const max = Math.max(1, ...values);
  const allZero = n > 0 && values.every((v) => v <= 0);

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((_, i) => String(i)),
        range: [0, innerW],
        padding: 0,
      }),
    [data, innerW]
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, max],
        range: [innerH, 0],
        nice: true,
      }),
    [max, innerH]
  );

  const xPoint = (i: number) =>
    (xScale(String(i)) ?? 0) + xScale.bandwidth() / 2;
  const yPoint = (v: number) => yScale(v) ?? 0;

  const tooltip = useTooltip<{ datum: AreaDatum; index: number }>();

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    if (n === 0) return;
    const point = localPoint(event);
    if (!point) return;
    const xLocal = point.x - margin.left;
    const step = innerW / Math.max(1, n - 1);
    const idx = Math.max(
      0,
      Math.min(n - 1, n === 1 ? 0 : Math.round(xLocal / step))
    );
    const datum = data[idx];
    tooltip.showTooltip({
      tooltipLeft: xPoint(idx) + margin.left,
      tooltipTop: yPoint(values[idx]) + margin.top,
      tooltipData: { datum, index: idx },
    });
  }

  const reactId = useId();
  const gradientId = `area-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (allZero) {
    return (
      <div
        className="flex items-center justify-center text-xs italic text-fg-subtle"
        style={{ height }}
      >
        No activity in this range
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        className="block overflow-visible"
        role="img"
      >
        <LinearGradient
          id={gradientId}
          from={accent}
          to={accent}
          fromOpacity={0.32}
          toOpacity={0}
        />

        <Group left={margin.left} top={margin.top}>
          {/* Horizontal grid + Y-axis tick labels */}
          <GridRows
            scale={yScale}
            width={innerW}
            numTicks={4}
            stroke="rgb(var(--border-subtle))"
            strokeDasharray="3,4"
          />
          {yScale.ticks(4).map((t) => (
            <text
              key={t}
              x={-10}
              y={yPoint(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="rgb(var(--text-subtle))"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmt(t)}
            </text>
          ))}

          {/* Animated reveal: clip the chart from left to right on mount.
              `prefers-reduced-motion` users get the final state instantly
              via the global rule in globals.css. */}
          <g className="motion-safe:animate-reveal-x">
            <AreaClosed<AreaDatum>
              data={data}
              x={(_, i) => xPoint(i)}
              y={(d) => yPoint(Number.isFinite(d.value) ? d.value : 0)}
              yScale={yScale}
              fill={`url(#${gradientId})`}
              curve={curveMonotoneX}
            />
            <LinePath<AreaDatum>
              data={data}
              x={(_, i) => xPoint(i)}
              y={(d) => yPoint(Number.isFinite(d.value) ? d.value : 0)}
              stroke={accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              curve={curveMonotoneX}
            />
          </g>

          {/* X-axis labels (every Nth) */}
          {data.map((d, i) => {
            if (i % labelStep !== 0) return null;
            const cx = xPoint(i);
            const labelY = innerH + (needsRotation ? 14 : 18);
            return (
              <text
                key={`${d.label}-${i}`}
                x={cx}
                y={labelY}
                textAnchor={needsRotation ? "end" : "middle"}
                fontSize={11}
                fill="rgb(var(--text-muted))"
                transform={
                  needsRotation ? `rotate(-45 ${cx} ${labelY})` : undefined
                }
              >
                {d.label}
              </text>
            );
          })}

          {/* Crosshair + dot when tooltip is active */}
          {tooltip.tooltipOpen && tooltip.tooltipData && (
            <g pointerEvents="none">
              <line
                x1={xPoint(tooltip.tooltipData.index)}
                x2={xPoint(tooltip.tooltipData.index)}
                y1={0}
                y2={innerH}
                stroke="rgb(var(--text-subtle))"
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.5}
              />
              <circle
                cx={xPoint(tooltip.tooltipData.index)}
                cy={yPoint(values[tooltip.tooltipData.index])}
                r={5}
                fill="rgb(var(--surface))"
                stroke={accent}
                strokeWidth={2}
              />
            </g>
          )}

          {/* Hit zone — full plot area, drives the tooltip. */}
          <Bar
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={tooltip.hideTooltip}
          />
        </Group>
      </svg>

      {tooltip.tooltipOpen && tooltip.tooltipData && (
        <TooltipWithBounds
          top={tooltip.tooltipTop}
          left={tooltip.tooltipLeft}
          style={tooltipStyles}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              {tooltip.tooltipData.datum.label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-fg-strong">
              {fmt(tooltip.tooltipData.datum.value)}
            </span>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

