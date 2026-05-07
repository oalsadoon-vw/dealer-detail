import React from "react";
import { cn } from "./cn";
import { Sparkline, type SparkDatum } from "@/components/charts/Sparkline";

type Tone = "neutral" | "success" | "danger" | "warning" | "accent";

const VALUE_TONE: Record<Tone, string> = {
  neutral: "text-fg-strong",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
};

const DELTA_TONE: Record<Tone, string> = {
  neutral: "text-fg-muted bg-surface-2 ring-1 ring-line",
  success: "text-success bg-success-soft ring-1 ring-success/20",
  danger: "text-danger bg-danger-soft ring-1 ring-danger/20",
  warning: "text-warning bg-warning-soft ring-1 ring-warning/20",
  accent: "text-accent bg-accent-soft ring-1 ring-accent/20",
};

type StatProps = {
  label: string;
  value: string;
  /** Small line under the value (e.g. "12 sold", "vs last period"). */
  subtext?: string;
  /** Color tone for the value text and the delta pill. */
  tone?: Tone;
  /** Optional change indicator rendered as a pill next to the value. */
  delta?: { label: string; tone?: Tone };
  /** Optional trend visualization rendered beneath the value. */
  spark?: { data: SparkDatum[]; color?: string };
  className?: string;
};

/**
 * Linear/Arc-style KPI tile. Consistent typography and spacing across
 * the dashboard, drawer, and admin pages. Optional sparkline gives
 * trend context without crowding the number.
 */
export function Stat({
  label,
  value,
  subtext,
  tone = "neutral",
  delta,
  spark,
  className,
}: StatProps) {
  return (
    <div
      className={cn(
        "group rounded-lg border border-line bg-surface px-4 py-3 transition-shadow hover:shadow-sm",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
          {label}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              DELTA_TONE[delta.tone ?? "neutral"]
            )}
          >
            {delta.label}
          </span>
        )}
      </div>
      <div
        key={value}
        className={cn(
          "num-fade mt-1 text-xl font-semibold tracking-tight tabular-nums",
          VALUE_TONE[tone]
        )}
      >
        {value}
      </div>
      {subtext && (
        <div
          key={subtext}
          className="num-fade mt-0.5 text-[11px] text-fg-subtle"
        >
          {subtext}
        </div>
      )}
      {spark && spark.data.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={spark.data} color={spark.color} />
        </div>
      )}
    </div>
  );
}
