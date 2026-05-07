import React from "react";
import { cn } from "./cn";

type Variant = "default" | "subtle" | "elevated" | "accent";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  /** Adds default padding (p-5). Set false when you need full-bleed children
   *  (e.g. tables that touch the card edges). */
  padded?: boolean;
  /** Render as a different element while keeping the styling. */
  as?: keyof JSX.IntrinsicElements;
};

const VARIANTS: Record<Variant, string> = {
  default: "bg-surface border border-line shadow-sm",
  subtle: "bg-surface-2 border border-line-subtle",
  elevated: "bg-surface border border-line shadow-md",
  accent:
    "bg-accent-soft text-accent-fg border border-accent/20",
};

/**
 * Base card surface. Holds Stat, chart, table, or freeform content.
 * Provide `padded={false}` for tables that need to sit flush with the
 * card's rounded edge.
 */
export function Card({
  variant = "default",
  padded = true,
  as,
  className,
  children,
  ...rest
}: CardProps) {
  const Element = (as ?? "div") as React.ElementType;
  return (
    <Element
      className={cn(
        "rounded-lg",
        VARIANTS[variant],
        padded && "p-5",
        className
      )}
      {...rest}
    >
      {children}
    </Element>
  );
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 mb-4",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-sm font-semibold text-fg-strong tracking-tight",
        className
      )}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-fg-muted mt-0.5", className)} {...rest}>
      {children}
    </p>
  );
}
