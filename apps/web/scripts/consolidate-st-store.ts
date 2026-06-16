/**
 * T5 — Consolidate the throwaway "ST" store onto the REAL "SCT" store.
 *
 * Background: T3/T4 ran against a throwaway store row the collector script
 * created (abbreviation "ST", id 3000...099). The dashboard / orgs already know
 * about the REAL Stevens Creek Toyota store (abbreviation "SCT", id 1314a22f...)
 * — but that real row had no tekionDealerId. We must consolidate onto SCT so
 * there is exactly ONE Stevens Creek Toyota in the Store table.
 *
 * What this does (idempotent):
 *   1. Resolve the REAL store by abbreviation 'SCT' and set
 *      tekionDealerId='americanmotorscorporation_876_0' + apiSyncEnabled=true.
 *   2. Locate the throwaway store ('ST'). If gone, no-op with a clear message.
 *   3. Inside a transaction:
 *        a. re-point RawRepairOrder.storeId  ST -> SCT
 *        b. re-point SyncRun.storeId         ST -> SCT
 *        c. merge Advisor rows by (nameNormalized): if SCT already has the same
 *           advisor, re-point that advisor's children (RawRepairOrder.advisor*
 *           is by id-string only — no FK — so we re-point AdvisorDailyMetrics +
 *           AdvisorDailyCommodity advisorId) and DELETE the duplicate ST
 *           advisor row. Otherwise just re-point Advisor.storeId.
 *        d. DELETE all AdvisorDailyMetrics + AdvisorDailyCommodity that were
 *           attached to the throwaway store (we'll rebuild from RawRepairOrder).
 *        e. DELETE the now-empty throwaway store row.
 *   4. Re-run aggregateMetrics({ storeId: SCT }) to rebuild metrics cleanly.
 *   5. Print before/after row-count tables for every affected table so it's
 *      obvious nothing was lost (RawRepairOrder count must stay the same).
 *
 * Run with:
 *   set -a && . ./.env && set +a && \
 *     npx tsx --conditions=react-server scripts/consolidate-st-store.ts
 *   # or: npm run consolidate:st
 */

import { prisma } from "../lib/db";
import { aggregateMetrics } from "../lib/aggregate/aggregator";

const ST_ABBREV = "ST";
const SCT_ABBREV = "SCT";
const SCT_EXPECTED_ID = "1314a22f-f3b1-4edc-acb9-3634353bc1a8";
const ST_EXPECTED_ID = "30000000-0000-0000-0000-000000000099";
const TEKION_DEALER_ID = "americanmotorscorporation_876_0";

interface Counts {
  rawRepairOrder: number;
  syncRun: number;
  advisor: number;
  advisorDailyMetrics: number;
  advisorDailyCommodity: number;
}

async function countsFor(storeId: string): Promise<Counts> {
  const [raw, sync, adv, met, com] = await Promise.all([
    prisma.rawRepairOrder.count({ where: { storeId } }),
    prisma.syncRun.count({ where: { storeId } }),
    prisma.advisor.count({ where: { storeId } }),
    prisma.advisorDailyMetrics.count({ where: { storeId } }),
    prisma.advisorDailyCommodity.count({ where: { storeId } }),
  ]);
  return {
    rawRepairOrder: raw,
    syncRun: sync,
    advisor: adv,
    advisorDailyMetrics: met,
    advisorDailyCommodity: com,
  };
}

function printCounts(label: string, c: Counts): void {
  console.log(`  ${label.padEnd(18)} raw=${c.rawRepairOrder}  syncRun=${c.syncRun}  advisor=${c.advisor}  metrics=${c.advisorDailyMetrics}  commodity=${c.advisorDailyCommodity}`);
}

async function main(): Promise<void> {
  console.log("\n=== T5 consolidate — ST throwaway -> SCT real ===");

  const sct = await prisma.store.findUnique({
    where: { abbreviation: SCT_ABBREV },
  });
  if (!sct) {
    throw new Error(
      `Real Stevens Creek Toyota store (abbreviation '${SCT_ABBREV}') not found. ` +
        "Refusing to run; this is unexpected — please seed/restore it before consolidating.",
    );
  }
  if (sct.id !== SCT_EXPECTED_ID) {
    console.warn(
      `WARN: SCT store id ${sct.id} differs from expected ${SCT_EXPECTED_ID}. ` +
        "Proceeding with the resolved id, but verify this is intentional.",
    );
  }
  console.log(`real SCT store:    id=${sct.id} name="${sct.name}"`);

  // Step 1: make sure SCT has the api config the throwaway used to.
  if (sct.tekionDealerId !== TEKION_DEALER_ID || !sct.apiSyncEnabled) {
    await prisma.store.update({
      where: { id: sct.id },
      data: {
        tekionDealerId: TEKION_DEALER_ID,
        apiSyncEnabled: true,
      },
    });
    console.log(`  updated SCT: tekionDealerId='${TEKION_DEALER_ID}', apiSyncEnabled=true`);
  } else {
    console.log("  SCT already has tekionDealerId + apiSyncEnabled (no change)");
  }

  const st = await prisma.store.findUnique({
    where: { abbreviation: ST_ABBREV },
  });
  if (!st) {
    console.log(`\nThrowaway store (abbreviation '${ST_ABBREV}') is already gone — idempotent no-op for the migration step.`);
    console.log("Re-running aggregator under SCT to ensure metrics are fresh...");
    const r = await aggregateMetrics({ storeId: sct.id });
    console.log("AggregateResult:");
    console.log(JSON.stringify(r, null, 2));
    const sctNow = await countsFor(sct.id);
    console.log("\nSCT counts (post-aggregate):");
    printCounts("SCT", sctNow);
    console.log("\n=== DONE (no-op consolidation) ===");
    return;
  }
  if (st.id === sct.id) {
    throw new Error(
      `Refusing to consolidate: 'ST' and 'SCT' resolve to the same store id (${st.id}). ` +
        "This shouldn't happen — investigate before re-running.",
    );
  }
  if (st.id !== ST_EXPECTED_ID) {
    console.warn(
      `WARN: throwaway ST store id ${st.id} differs from expected ${ST_EXPECTED_ID}.`,
    );
  }
  console.log(`throwaway ST store: id=${st.id} name="${st.name}"`);

  const stBefore = await countsFor(st.id);
  const sctBefore = await countsFor(sct.id);
  console.log("\nBEFORE:");
  printCounts("ST (throwaway)", stBefore);
  printCounts("SCT (real)", sctBefore);

  // Step 2: do the heavy lifting in one transaction so a mid-migration crash
  // can't leave the data half-moved. Increase the interactive-tx timeout —
  // these updateMany calls are fast individually but the Prisma default of 5s
  // is tight for the combined transaction on a slow connection.
  const moveSummary = await prisma.$transaction(
    async (tx) => {
      const summary = {
        rawRepairOrderMoved: 0,
        syncRunMoved: 0,
        advisorMerged: 0,
        advisorRepointed: 0,
        metricsDeleted: 0,
        commodityDeleted: 0,
      };

      // 2a — re-point RawRepairOrder + SyncRun (no advisor FKs on these).
      const moveRaw = await tx.rawRepairOrder.updateMany({
        where: { storeId: st.id },
        data: { storeId: sct.id },
      });
      summary.rawRepairOrderMoved = moveRaw.count;

      const moveSync = await tx.syncRun.updateMany({
        where: { storeId: st.id },
        data: { storeId: sct.id },
      });
      summary.syncRunMoved = moveSync.count;

      // 2b — merge advisors by nameNormalized.
      const stAdvisors = await tx.advisor.findMany({
        where: { storeId: st.id },
        select: { id: true, nameNormalized: true, nameRaw: true, tekionUserId: true },
      });
      const sctAdvisors = await tx.advisor.findMany({
        where: { storeId: sct.id },
        select: { id: true, nameNormalized: true },
      });
      const sctAdvisorByName = new Map(
        sctAdvisors.map((a) => [a.nameNormalized, a.id]),
      );

      for (const a of stAdvisors) {
        const dupId = sctAdvisorByName.get(a.nameNormalized);
        if (dupId && dupId !== a.id) {
          // SCT already has an advisor by that name. Re-point a's metrics +
          // commodity rows onto the existing SCT advisor, then delete a.
          // (RawRepairOrder doesn't carry an advisorId FK — only the raw
          // advisorTekionId string — so no re-point needed there.)
          // Note: AdvisorDailyMetrics + AdvisorDailyCommodity are about to be
          // deleted wholesale in step 2c, so updates here would be redundant —
          // but doing them is safe and keeps the operation order obvious.
          await tx.advisorDailyMetrics.updateMany({
            where: { storeId: st.id, advisorId: a.id },
            data: { advisorId: dupId },
          });
          await tx.advisorDailyCommodity.updateMany({
            where: { storeId: st.id, advisorId: a.id },
            data: { advisorId: dupId },
          });
          await tx.advisor.delete({ where: { id: a.id } });
          summary.advisorMerged += 1;
        } else {
          await tx.advisor.update({
            where: { id: a.id },
            data: { storeId: sct.id },
          });
          summary.advisorRepointed += 1;
          // Track the newly re-pointed advisor so further ST advisors with the
          // same nameNormalized (shouldn't happen — there's a unique index per
          // store — but cheap insurance) collide via merge rather than
          // violating the unique key on SCT.
          sctAdvisorByName.set(a.nameNormalized, a.id);
        }
      }

      // 2c — wipe ST's daily metrics / commodity rows. We re-aggregate after
      // the transaction, so these would otherwise be stale duplicates that
      // collide with the rebuilt SCT rows on the (storeId, advisorId,
      // businessDate) unique key. The aggregator's own delete-then-insert is
      // scoped to the dates it touches — clearing here is the safe baseline.
      const delMetrics = await tx.advisorDailyMetrics.deleteMany({
        where: { storeId: st.id },
      });
      summary.metricsDeleted = delMetrics.count;
      const delCommodity = await tx.advisorDailyCommodity.deleteMany({
        where: { storeId: st.id },
      });
      summary.commodityDeleted = delCommodity.count;

      // 2d — sanity check ST is empty before we delete the row. If ANYTHING
      // is still hanging off it we'd rather abort than blow away data.
      const remaining = await Promise.all([
        tx.rawRepairOrder.count({ where: { storeId: st.id } }),
        tx.syncRun.count({ where: { storeId: st.id } }),
        tx.advisor.count({ where: { storeId: st.id } }),
        tx.advisorDailyMetrics.count({ where: { storeId: st.id } }),
        tx.advisorDailyCommodity.count({ where: { storeId: st.id } }),
      ]);
      const remTotal = remaining.reduce((a, b) => a + b, 0);
      if (remTotal !== 0) {
        throw new Error(
          `Refusing to delete throwaway store ${st.id}: child rows still present ` +
            `(raw=${remaining[0]}, sync=${remaining[1]}, advisor=${remaining[2]}, ` +
            `metrics=${remaining[3]}, commodity=${remaining[4]}). Investigate before re-running.`,
        );
      }

      // 2e — delete the throwaway store. Cascade rules would also kick in for
      // any straggler children, but we've already proven the children are 0.
      await tx.store.delete({ where: { id: st.id } });

      return summary;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  console.log("\nmove summary:");
  console.log(JSON.stringify(moveSummary, null, 2));

  // Step 3: rebuild metrics under SCT from the re-pointed RawRepairOrder rows.
  console.log("\nRe-running aggregateMetrics for SCT to rebuild metrics...");
  const aggResult = await aggregateMetrics({ storeId: sct.id });
  console.log("AggregateResult:");
  console.log(JSON.stringify(aggResult, null, 2));

  const stAfterStore = await prisma.store.findUnique({ where: { id: st.id } });
  const sctAfter = await countsFor(sct.id);

  console.log("\nAFTER:");
  if (stAfterStore) {
    console.log(`  ST still exists (id=${stAfterStore.id}) — UNEXPECTED, please investigate.`);
  } else {
    console.log("  ST (throwaway):    GONE");
  }
  printCounts("SCT (real)", sctAfter);

  console.log("\ninvariants:");
  console.log(
    `  RawRepairOrder count preserved:    ${stBefore.rawRepairOrder + sctBefore.rawRepairOrder} -> ${sctAfter.rawRepairOrder} ${stBefore.rawRepairOrder + sctBefore.rawRepairOrder === sctAfter.rawRepairOrder ? "OK" : "MISMATCH"}`,
  );
  console.log(
    `  SyncRun count preserved:           ${stBefore.syncRun + sctBefore.syncRun} -> ${sctAfter.syncRun} ${stBefore.syncRun + sctBefore.syncRun === sctAfter.syncRun ? "OK" : "MISMATCH"}`,
  );
  const expectedAdvisorMax = stBefore.advisor + sctBefore.advisor;
  console.log(
    `  Advisor count <= sum (post-merge):  before-sum=${expectedAdvisorMax}  after=${sctAfter.advisor}  merged=${moveSummary.advisorMerged}  ${sctAfter.advisor === expectedAdvisorMax - moveSummary.advisorMerged ? "OK" : "CHECK"}`,
  );

  // Final dashboard sanity: there should be exactly ONE Stevens Creek Toyota.
  const sctRows = await prisma.store.findMany({
    where: { name: "Stevens Creek Toyota" },
    select: { id: true, abbreviation: true, tekionDealerId: true, apiSyncEnabled: true },
  });
  console.log(`\nStevens Creek Toyota rows in Store table (${sctRows.length}):`);
  for (const s of sctRows) {
    console.log(
      `  id=${s.id}  abbrev=${s.abbreviation ?? "(null)"}  tekionDealerId=${s.tekionDealerId ?? "(null)"}  apiSyncEnabled=${s.apiSyncEnabled}`,
    );
  }
  if (sctRows.length !== 1) {
    throw new Error(`Expected exactly ONE Stevens Creek Toyota row, found ${sctRows.length}.`);
  }

  console.log("\n=== DONE ===");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("consolidate-st-store FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
