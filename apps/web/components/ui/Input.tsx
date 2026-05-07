import React from "react";
import { cn } from "./cn";

const FIELD_BASE =
  "block w-full rounded-md border border-line bg-surface px-3 text-sm text-fg-strong placeholder:text-fg-subtle shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50";

const SIZE = {
  sm: "h-8 text-xs",
  md: "h-9",
  lg: "h-11 text-base",
} as const;

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  size?: keyof typeof SIZE;
};

export function Input({
  className,
  size = "md",
  type = "text",
  ...rest
}: InputProps) {
  return (
    <input
      type={type}
      className={cn(FIELD_BASE, SIZE[size], className)}
      {...rest}
    />
  );
}

export type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> & {
  size?: keyof typeof SIZE;
};

export function Select({
  className,
  size = "md",
  children,
  ...rest
}: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          FIELD_BASE,
          SIZE[size],
          "appearance-none pr-9 cursor-pointer",
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" d="M4 6l4 4 4-4" />
      </svg>
    </div>
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        FIELD_BASE,
        "min-h-[80px] py-2 leading-relaxed",
        className
      )}
      {...rest}
    />
  );
}

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  helper?: string;
  error?: string;
  /** Visual variant for the label tone. */
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Wraps an Input/Select/Textarea with a consistent label + helper + error
 * stack. Uses the design tokens so dark mode just works.
 */
export function FormField({
  label,
  htmlFor,
  helper,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wider text-fg-muted"
      >
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : helper ? (
        <p className="text-xs text-fg-subtle">{helper}</p>
      ) : null}
    </div>
  );
}
