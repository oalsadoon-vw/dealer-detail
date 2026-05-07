"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "./cn";

type Size = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
};

type DrawerProps = {
  /** Controlled open state. Provide both `open` and `onClose`. */
  open: boolean;
  onClose: () => void;
  /** Optional title rendered in the default header. Skip and pass your
   *  own header via `header` if you need full control. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Replace the entire header. */
  header?: React.ReactNode;
  size?: Size;
  /** Side the drawer slides in from. Right by default. */
  side?: "right" | "left";
  /** Render the close button automatically inside the default header. */
  showClose?: boolean;
  children: React.ReactNode;
};

/**
 * Slide-over drawer with the same UX expectations as Linear/Arc:
 * - ESC closes
 * - click on the dimmed backdrop closes
 * - focus moves to the first focusable element on open
 * - focus is restored to the trigger on close
 * - basic Tab/Shift-Tab focus trap inside the panel
 * - respects `prefers-reduced-motion` (transitions clamped globally)
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  header,
  size = "xl",
  side = "right",
  showClose = true,
  children,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Mount + animate-in. We keep the drawer in the tree for ~300ms after
  // close so the slide-out transition can play.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      // Defer to next frame so the initial off-screen transform commits.
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        previouslyFocused.current?.focus?.();
      }, 280);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, mounted]);

  // ESC + Tab trap.
  useEffect(() => {
    if (!visible) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  // Auto-focus the first focusable inside the panel on open.
  useEffect(() => {
    if (!visible) return;
    const root = panelRef.current;
    if (!root) return;
    // Prefer the close button, otherwise the first interactive child.
    const focusable = root.querySelector<HTMLElement>(
      "[data-drawer-close], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    focusable?.focus?.();
  }, [visible]);

  const stopPropagation = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation(),
    []
  );

  if (!mounted) return null;

  const panelPosition =
    side === "right" ? "right-0" : "left-0";
  const offscreen =
    side === "right" ? "translate-x-full" : "-translate-x-full";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        side === "right" ? "justify-end" : "justify-start"
      )}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-280 ease-emphasized",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        onClick={stopPropagation}
        className={cn(
          "relative w-full bg-surface text-fg shadow-xl ring-1 ring-line flex flex-col",
          "transition-transform duration-280 ease-emphasized",
          panelPosition,
          SIZE[size],
          visible ? "translate-x-0" : offscreen
        )}
      >
        {header ?? (
          <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
            <div className="min-w-0">
              {title && (
                <h2 className="text-xl font-semibold tracking-tight text-fg-strong truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-0.5 text-xs font-medium tracking-wide text-fg-subtle">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                data-drawer-close
                aria-label="Close drawer"
                className="rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg-strong transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
