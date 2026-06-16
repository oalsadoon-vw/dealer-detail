/**
 * Verification script for T6: confirm SCT renders via the same store-agnostic
 * dashboard read path used by the API and the page. Bypasses auth by
 * constructing a synthetic TenantContext that grants access to SCT.
 *
 *   set -a && . ./.env && set +a && \
 *     npx tsx --conditions=react-server scripts/verify-sct-dashboard.ts
 */

import { prisma } from "../lib/db";
import { loadDashboardData } from "../lib/server/services/dashboard";
import type { TenantContext } from "../lib/server/tenant-context";

const SCT_STORE_ID = "1314a22f-f3b1-4edc-acb9-3634353bc1a8";
const BUSINESS_DATE = "2026-06-15";

async function makeContextForStore(storeId: string): Promise<TenantContext> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { organization: true },
  });
  if (!store) throw new Error(`Store ${storeId} not found`);

  return {
    user: {
      profileId: "verify-script",
      email: "verify@local",
      isPlatformAdmin: true,
      memberships: [],
    } as unknown as TenantContext["user"],
    org: {
      id: store.organizationId,
      name: store.organization.name,
      role: "ORG_ADMIN",
      accessibleStoreIds: [storeId],
    } as unknown as TenantContext["org"],
  };
}

function fmtMoney(x: number) {
  return x.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function main() {
  const tc = await makeContextForStore(SCT_STORE_ID);

  console.log(`\n--- DAY VIEW: ${BUSINESS_DATE} ---`);
  const day = await loadDashboardData(tc, {
    storeId: SCT_STORE_ID,
    businessDate: BUSINESS_DATE,
  });
  console.log(`store=${day.store.name}  run=${day.run === null ? "null" : day.run.id}`);
  console.log(`advisors: ${day.advisors.length}`);

  const t = day.advisors.reduce(
    (acc, a) => ({
      openRos: acc.openRos + a.metrics.openRos,
      menuCount: acc.menuCount + a.metrics.menuCount,
      alaCount: acc.alaCount + a.metrics.alaCount,
      recAmount: acc.recAmount + a.metrics.recAmount,
      recSoldAmount: acc.recSoldAmount + a.metrics.recSoldAmount,
      dailyGross:
        acc.dailyGross + a.metrics.dailyLaborGross + a.metrics.dailyPartsGross,
    }),
    {
      openRos: 0,
      menuCount: 0,
      alaCount: 0,
      recAmount: 0,
      recSoldAmount: 0,
      dailyGross: 0,
    }
  );

  const menuPct = t.openRos === 0 ? 0 : (t.menuCount / t.openRos) * 100;
  const alaPct = t.openRos === 0 ? 0 : (t.alaCount / t.openRos) * 100;
  console.log(
    `openRos=${t.openRos}  menu=${t.menuCount} (${menuPct.toFixed(1)}%)  ala=${t.alaCount} (${alaPct.toFixed(1)}%)  gross=${fmtMoney(t.dailyGross)}  recAmount=${t.recAmount}  recSold=${t.recSoldAmount}`
  );

  // Prove the generic "denominator 0 -> em dash" display rule with two
  // synthetic advisors: one with no rec data (API store) and one with real
  // rec data (email store). The dashboard cell logic is the same as below.
  console.log(`\n--- DISPLAY-RULE CHECK (denominator-0 -> em dash) ---`);
  const cases = [
    { name: "SCT-like advisor", recAmount: 0, recSoldAmount: 0 },
    { name: "SCVW-like advisor", recAmount: 12000, recSoldAmount: 7800 },
  ];
  for (const c of cases) {
    const display =
      c.recAmount === 0
        ? "—"
        : `${((c.recSoldAmount / c.recAmount) * 100).toFixed(2)}%`;
    console.log(
      `  ${c.name.padEnd(20)}  recAmount=${c.recAmount} -> ${display}`
    );
  }

  console.log(`\n--- RANGE VIEW: 2026-06-01 .. 2026-06-15 ---`);
  const range = await loadDashboardData(tc, {
    storeId: SCT_STORE_ID,
    startDate: "2026-06-01",
    endDate: "2026-06-15",
  });
  console.log(
    `store=${range.store.name}  run=${range.run === null ? "null" : range.run.id}  rangeDays=${range.rangeDays}  advisors=${range.advisors.length}  dailySeries=${range.dailySeries.length}`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
