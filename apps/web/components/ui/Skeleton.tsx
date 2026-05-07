import React from "react";
import { cn } from "./cn";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  /** Width / height shortcuts. Falls back to inline styles. */
  w?: number | string;
  h?: number | string;
  rounded?: "sm" | "md" | "lg" | "full";
};

const ROUND: Record<NonNullable<Props["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

/**
 * Linear-style placeholder block. Static surface tint by default; gains
 * a subtle shimmer when `class="animate"`d via the consumer (we don't
 * shimmer everywhere by default to keep busy pages calmer).
 */
export function Skeleton({
  w,
  h,
  rounded = "md",
  className,
  style,
  ...rest
}: Props) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("bg-surface-2 animate-pulse", ROUND[rounded], className)}
      style={{
        width: w,
        height: h,
        ...style,
      }}
      {...rest}
    />
  );
}
