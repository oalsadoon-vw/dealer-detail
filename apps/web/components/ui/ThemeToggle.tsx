"use client";

import React from "react";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { cn } from "./cn";

type Props = {
  className?: string;
  /** Visual variant — "icon" (default, square) or "label" (icon + text). */
  variant?: "icon" | "label";
};

/**
 * Light/dark toggle button. Reads from `useTheme()` and flips
 * `data-theme` on the root element. Renders `prefers-reduced-motion`-
 * friendly icon swaps via opacity (no rotation/spin).
 */
export function ThemeToggle({ className, variant = "icon" }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-fg-muted hover:text-fg-strong hover:bg-surface-2 transition-colors",
        variant === "icon" ? "h-8 w-8 justify-center" : "h-8 px-2 text-xs",
        className
      )}
    >
      <span className="relative h-4 w-4">
        {/* Sun */}
        <svg
          className={cn(
            "absolute inset-0 transition-opacity duration-200",
            isDark ? "opacity-0" : "opacity-100"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        {/* Moon */}
        <svg
          className={cn(
            "absolute inset-0 transition-opacity duration-200",
            isDark ? "opacity-100" : "opacity-0"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
      {variant === "label" && (
        <span>{isDark ? "Dark" : "Light"}</span>
      )}
    </button>
  );
}
