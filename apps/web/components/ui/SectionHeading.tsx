import React from "react";
import { cn } from "./cn";

type Props = {
  title: string;
  description?: string;
  /** Slot rendered to the right (typically a Button or LinkButton). */
  action?: React.ReactNode;
  /** Smaller variant — used inside cards / sections nested under a page heading. */
  size?: "page" | "section";
  className?: string;
};

/**
 * Consistent heading block: title + optional description + optional
 * right-aligned action. Two sizes:
 * - "page": large, used at the top of a route
 * - "section": medium, used to introduce a sub-area within a page
 */
export function SectionHeading({
  title,
  description,
  action,
  size = "section",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 min-w-0",
        className
      )}
    >
      <div className="min-w-0">
        <h2
          className={cn(
            "tracking-tight text-fg-strong",
            size === "page"
              ? "text-2xl font-semibold"
              : "text-base font-semibold"
          )}
        >
          {title}
        </h2>
        {description && (
          <p
            className={cn(
              "mt-1 text-fg-muted",
              size === "page" ? "text-sm" : "text-xs"
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
