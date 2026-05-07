import React from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg border border-accent/0 hover:bg-accent-strong shadow-sm hover:shadow",
  secondary:
    "bg-surface text-fg-strong border border-line hover:bg-surface-2 shadow-sm",
  ghost:
    "bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg-strong border border-transparent",
  destructive:
    "bg-danger text-white hover:bg-danger/90 border border-danger/0 shadow-sm",
  subtle:
    "bg-surface-2 text-fg-strong border border-line-subtle hover:bg-surface-3 hover:border-line",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-[6px]",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Slot before label (icon). */
  leading?: React.ReactNode;
  /** Slot after label. */
  trailing?: React.ReactNode;
  /** Spinner state — disables and shows pulsing label. */
  pending?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  leading,
  trailing,
  pending = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-quick disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        pending && "animate-pulse cursor-wait",
        className
      )}
      disabled={disabled || pending}
      {...rest}
    >
      {leading && <span className="shrink-0 -ml-0.5">{leading}</span>}
      {children}
      {trailing && <span className="shrink-0 -mr-0.5">{trailing}</span>}
    </button>
  );
}

type LinkButtonProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

/**
 * Anchor variant of Button — same visual API for `<Link>` / `<a>` callers.
 * Wrap a Next `<Link>` like `<LinkButton href={Link.href}>` or pass it
 * via `legacyBehavior` and a child anchor.
 */
export function LinkButton({
  variant = "secondary",
  size = "md",
  leading,
  trailing,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-quick",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {leading && <span className="shrink-0 -ml-0.5">{leading}</span>}
      {children}
      {trailing && <span className="shrink-0 -mr-0.5">{trailing}</span>}
    </a>
  );
}
