import React from "react";
import { cn } from "./cn";

type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted ring-1 ring-line",
  accent: "bg-accent-soft text-accent ring-1 ring-accent/20",
  success: "bg-success-soft text-success ring-1 ring-success/20",
  warning: "bg-warning-soft text-warning ring-1 ring-warning/20",
  danger: "bg-danger-soft text-danger ring-1 ring-danger/20",
  info: "bg-info-soft text-info ring-1 ring-info/20",
  violet:
    "bg-violet-50 text-violet-600 ring-1 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
};

type Size = "sm" | "md";

const SIZE: Record<Size, string> = {
  sm: "px-1.5 py-0.5 text-[10px] rounded-full font-semibold uppercase tracking-wider",
  md: "px-2 py-0.5 text-[11px] rounded-full font-semibold",
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
};

export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        TONE[tone],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}
