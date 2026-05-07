import React from "react";
import { cn } from "./cn";

type Props = {
  title: string;
  description?: string;
  /** Optional small icon rendered above the title. */
  icon?: React.ReactNode;
  /** Optional CTA rendered below the description. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Empty / zero-state surface used wherever a list, table, or chart has
 * nothing to show. Visual quiet: faint icon, single-line title, optional
 * description, optional action button. Sits inside cards or table bodies.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12 gap-2",
        className
      )}
    >
      {icon && (
        <div className="text-fg-subtle/70 [&>svg]:h-8 [&>svg]:w-8 mb-1">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-fg-strong">{title}</h3>
      {description && (
        <p className="max-w-sm text-xs text-fg-muted leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
