"use client";

import React, { useId, useMemo } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleBand, scaleLinear } from "@visx/scale";
import { GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import {
  useTooltip,
  TooltipWithBounds,
  defaultStyles as defaultTooltipStyles,
} from "@visx/tooltip";
import { localPoint } from "@visx/event";

export type BarDatum = { label: string; value: number };

type Props = {
  title: string;
  data: BarDatum[];
  height?: number;
  /** Optional explicit accent. Defaults to the theme `--accent` token. */
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

export function BarChart(props: Props) {
  return (
    <div className="h-full w-full min-w-0">
      <div className="mb-3 text-sm font-semibold text-fg-strong">
        {props.title}
      </div>
      <ParentSize debounceTime={120}>
        {({ width }) =>
          width > 0 ? (
            <BarChartInner width={width} {...props} />
          ) : (
            <div style={{ height: props.height ?? 220 }} />
          )
        }
      </ParentSize>
    </div>
  );
}

function BarChartInner({
  width,
  data,
  height: heightProp,
  color,
  valueFormatter,
}: Props & { width: number }) {
  const fmt = valueFormatter ?? ((v: number) => String(v));
  const accent = color ?? "rgb(var(--accent))";
  const n = data.length;

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
        padding: 0.25,
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

  const tooltip = useTooltip<{ datum: BarDatum; index: number }>();

  const reactId = useId();
  const gradientId = `bar-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
          fromOpacity={1}
          toOpacity={0.7}
          x1={0}
          y1={0}
          x2={0}
          y2={1}
        />

        <Group left={margin.left} top={margin.top}>
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
              y={(yScale(t) ?? 0) + 4}
              textAnchor="end"
              fontSize={11}
              fill="rgb(var(--text-subtle))"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmt(t)}
            </text>
          ))}

          <g className="motion-safe:animate-reveal-x">
            {data.map((d, i) => {
              const v = values[i];
              const barH = innerH - (yScale(v) ?? innerH);
              const barX = xScale(String(i)) ?? 0;
              const barW = xScale.bandwidth();
              const barY = innerH - barH;
              const isHover = tooltip.tooltipData?.index === i;
              const r = Math.min(4, barW / 2);
              return (
                <Bar
                  key={`${d.label}-${i}`}
                  x={barX}
                  y={barY}
                  width={barW}
                  height={Math.max(barH, v > 0 ? 1 : 0)}
                  rx={r}
                  ry={r}
                  fill={`url(#${gradientId})`}
                  opacity={
                    tooltip.tooltipOpen && !isHover ? 0.55 : v === 0 ? 0.18 : 1
                  }
                  style={{ transition: "opacity 140ms ease-out" }}
                  onMouseEnter={(event) => {
                    const point = localPoint(event);
                    if (!point) return;
                    tooltip.showTooltip({
                      tooltipLeft: barX + barW / 2 + margin.left,
                      tooltipTop: barY + margin.top,
                      tooltipData: { datum: d, index: i },
                    });
                  }}
                  onMouseLeave={tooltip.hideTooltip}
                />
              );
            })}
          </g>

          {data.map((d, i) => {
            if (i % labelStep !== 0) return null;
            const cx = (xScale(String(i)) ?? 0) + xScale.bandwidth() / 2;
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
