/**
 * Tiny classname joiner used by every primitive in `components/ui/`.
 * Falsy values (false / null / undefined / "") are skipped so callers can
 * write `cn("base", isActive && "active")` without ternaries.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
