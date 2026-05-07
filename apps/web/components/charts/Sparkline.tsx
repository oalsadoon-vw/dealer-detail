"use client";

import React, { useMemo } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { LinePath, AreaClosed } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import { LinearGradient } from "@visx/gradient";
import { curveMonotoneX } from "@visx/curve";

export type SparkDatum = { value: number };

type Props = {
  data: SparkDatum[];
  height?: number;
  /** Defaults to the theme `--accent` token. */
  color?: string;
  className?: string;
};

/**
 * Compact, axis-less area+line for embedding inside stat cards. Renders
 * pure trend context — no labels, no tooltip, no grid. Uses the same
 * gradient/curve language as `AreaChart` so the two read as a family.
 */
export function Sparkline({ data, height = 36, color, className }: Props) {
  return (
    <div
      className={className}
      style={{ height, width: "100%", minWidth: 0 }}
      aria-hidden="true"
    >
      <ParentSize debounceTime={120}>
        {({ width }) =>
          width > 0 ? (
            <SparklineInner
              width={width}
              height={height}
              data={data}
              color={color}
            />
          ) : null
        }
      </ParentSize>
    </div>
  );
}

function SparklineInner({
  width,
  height,
  data,
  color,
}: {
  width: number;
  height: number;
  data: SparkDatum[];
  color?: string;
}) {
  const accent = color ?? "rgb(var(--accent))";
  const reactId = React.useId();
  const gradientId = `spark-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const values = useMemo(
    () => data.map((d) => (Number.isFinite(d.value) ? d.value : 0)),
    [data]
  );
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);

  const margin = { top: 2, right: 2, bottom: 2, left: 2 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [min, max], range: [innerH, 0] }),
    [min, max, innerH]
  );

  const xPoint = (i: number) => {
    if (data.length <= 1) return innerW / 2;
    return (i / (data.length - 1)) * innerW;
  };

  if (data.length === 0) {
    return null;
  }

  return (
    <svg width={width} height={height} className="block overflow-visible">
      <LinearGradient
        id={gradientId}
        from={accent}
        to={accent}
        fromOpacity={0.28}
        toOpacity={0}
      />
      <Group left={margin.left} top={margin.top}>
        <AreaClosed<SparkDatum>
          data={data}
          x={(_, i) => xPoint(i)}
          y={(d) => yScale(Number.isFinite(d.value) ? d.value : 0) ?? 0}
          yScale={yScale}
          fill={`url(#${gradientId})`}
          curve={curveMonotoneX}
        />
        <LinePath<SparkDatum>
          data={data}
          x={(_, i) => xPoint(i)}
          y={(d) => yScale(Number.isFinite(d.value) ? d.value : 0) ?? 0}
          stroke={accent}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          curve={curveMonotoneX}
        />
      </Group>
    </svg>
  );
}
