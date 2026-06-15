import "server-only";

/**
 * Stale-run reaper.
 *
 * If the collector process is killed (SIGKILL, cron deadline, container
 * eviction) the SyncRun row is left at status RUNNING forever — the signal
 * handler in collector.ts catches SIGINT/SIGTERM but cannot catch SIGKILL.
 * reapStaleRuns is called at the start of every collectRepairOrders so each
 * fresh run self-heals any orphaned RUNNING rows from prior killed processes.
 */

import { prisma } from "@/lib/db";

export async function reapStaleRuns(maxAgeMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const stale = await prisma.syncRun.findMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  const finishedAt = new Date();
  await prisma.syncRun.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: {
      status: "FAILED",
      errors: [
        { reason: "stale run reaped — process likely killed before finalize" },
      ] as unknown as never,
      finishedAt,
    },
  });
  return stale.length;
}
