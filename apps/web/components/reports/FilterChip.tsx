"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/components/ui/cn";

export type FilterChipProps = {
  label: string;
  /** Compact RO count (rendered as-is; pass "" to omit). */
  count?: string | number;
  /** Compact `$` figure (rendered as-is; pass "" to omit). */
  money?: string;
  /** On = included (filled with the store accent). Off = excluded (outlined). */
  on: boolean;
  /** Non-interactive informational chip (e.g. the "Re-closed" note). */
  informational?: boolean;
  /** Extra dimming for $0 / empty chips. */
  muted?: boolean;
  tooltip?: string;
  /** Store accent (hex) for the filled state. */
  accent: string;
  /** Contrasting foreground (hex) for the filled state. */
  accentFg: string;
  onClick?: (opts: { solo: boolean }) => void;
};

const LONG_PRESS_MS = 500;

/**
 * A composition toggle chip — the atomic unit of the filter strip. One chip
 * per status / pay type, showing `label · count · $`. Click toggles on/off;
 * alt/option-click = "solo" (only this one on); long-press (touch) = solo.
 * Filled = on, outlined = off, dimmed = $0. A leading check glyph marks the
 * on state without relying on color, so the state is legible without color
 * vision. Accessible: native button + aria-pressed, so Enter/Space work.
 */
export function FilterChip({
  label,
  count,
  money,
  on,
  informational = false,
  muted = false,
  tooltip,
  accent,
  accentFg,
  onClick,
}: FilterChipProps) {
  const hasFigure = (count !== undefined && count !== "") || (money !== undefined && money !== "");
  const interactive = !informational && !!onClick;
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    },
    []
  );

  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // Touch / pen long-press = solo, so mobile users can reach the same "only
  // this one" action that desktop gets via alt/option-click.
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive || (e.pointerType !== "touch" && e.pointerType !== "pen")) return;
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onClick({ solo: true });
    }, LONG_PRESS_MS);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    clearPressTimer();
    if (longPressed.current) {
      longPressed.current = false;
      return; // long-press already fired solo; suppress the trailing click
    }
    onClick({ solo: e.altKey || e.metaKey });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    // A held touch fires the native context menu at ~LONG_PRESS_MS, which would
    // win over the long-press solo action. These chips have no useful context
    // menu, so swallow it.
    if (interactive) e.preventDefault();
  };

  return (
    <button
      type="button"
      title={tooltip}
      disabled={informational}
      aria-pressed={interactive ? on : undefined}
      onClick={interactive ? handleClick : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerUp={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onPointerLeave={clearPressTimer}
      onContextMenu={interactive ? handleContextMenu : undefined}
      className={cn(
        "inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-quick",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "touch-manipulation",
        on ? "border border-transparent shadow-sm" : "border border-line hover:border-line-strong",
        muted && "opacity-60",
        informational && "cursor-default",
        !on && "text-fg-muted"
      )}
      style={on ? { background: accent, color: accentFg } : undefined}
    >
      {/* Reserved-width check glyph — the on/off cue that doesn't depend on color. */}
      <svg
        aria-hidden
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0 transition-opacity", on ? "opacity-100" : "opacity-0")}
      >
        <path d="M3 8.5l3.5 3.5L13 5" />
      </svg>
      <span>{label}</span>
      {hasFigure && (
        <span className={cn("tabular-nums", on ? "opacity-90" : "text-fg-subtle")}>
          {count !== undefined && count !== "" ? count : null}
          {money !== undefined && money !== "" && <span className="opacity-80"> · {money}</span>}
        </span>
      )}
    </button>
  );
}