"use client";

import React from "react";
import { cn } from "./cn";

export type Tab<T extends string = string> = {
  id: T;
  label: string;
  /** Optional badge value (e.g. count) rendered in a pill on the tab. */
  badge?: string | number;
  disabled?: boolean;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Visual variant — underline (Linear-style) or segmented (pill). */
  variant?: "underline" | "segmented";
  className?: string;
};

/**
 * Linear-style tab strip. Two variants:
 * - "underline" (default): top-level page navigation, animated underline.
 * - "segmented": small pill group, used inside cards or filter rails.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = "underline",
  className,
}: Props<T>) {
  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5 ring-1 ring-line",
          className
        )}
        role="tablist"
      >
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap",
                active
                  ? "bg-surface text-fg-strong shadow-sm ring-1 ring-line"
                  : "text-fg-muted hover:text-fg-strong",
                t.disabled && "opacity-40 cursor-not-allowed"
              )}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="rounded-full bg-fg-subtle/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-muted">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn("relative border-b border-line", className)}
      role="tablist"
    >
      <div className="flex flex-wrap items-end gap-1 -mb-px">
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px",
                active
                  ? "text-fg-strong border-accent"
                  : "text-fg-muted hover:text-fg-strong border-transparent",
                t.disabled && "opacity-40 cursor-not-allowed"
              )}
            >
              {t.label}
              {t.badge !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active
                      ? "bg-accent-soft text-accent"
                      : "bg-fg-subtle/15 text-fg-muted"
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
