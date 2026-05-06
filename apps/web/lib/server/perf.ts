/**
 * Tiny dev-only perf logger. In production this is a noop.
 *
 * Usage:
 *   const t = perfStart("resolveTenantContext");
 *   ... do work ...
 *   t.end();
 *
 * Or:
 *   const t = perfStart("auth.getUser");
 *   await supabase.auth.getUser();
 *   t.end();
 *
 * Output is one line per measurement, prefixed `[perf]`, so it's easy to
 * grep out of the dev terminal log.
 */
const ENABLED =
  process.env.NODE_ENV === "development" && process.env.DD_PERF !== "0";

export function perfStart(label: string): { end: (note?: string) => void } {
  if (!ENABLED) {
    return { end: () => {} };
  }
  const t0 = performance.now();
  return {
    end(note?: string) {
      const ms = Math.round(performance.now() - t0);
      if (note) {
        console.log(`[perf] ${label}: ${ms}ms (${note})`);
      } else {
        console.log(`[perf] ${label}: ${ms}ms`);
      }
    },
  };
}

/**
 * Wraps an async function so each call logs its own duration.
 * Intentionally not used for hot inner loops — only for top-level boundaries
 * where one log line per request is desired.
 */
export function perfWrap<TArgs extends unknown[], TRet>(
  label: string,
  fn: (...args: TArgs) => Promise<TRet>
): (...args: TArgs) => Promise<TRet> {
  if (!ENABLED) return fn;
  return async (...args: TArgs) => {
    const t = perfStart(label);
    try {
      return await fn(...args);
    } finally {
      t.end();
    }
  };
}
