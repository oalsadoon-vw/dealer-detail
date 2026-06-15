/**
 * Smoke test for the Tekion API client library.
 *
 * Run with:
 *   set -a && . ./.env && set +a && npx tsx scripts/tekion-smoke.ts
 *
 * (When running via plain node/tsx outside the Next.js bundler, also set
 *  NODE_OPTIONS=--conditions=react-server so `import "server-only"` resolves
 *  to its react-server no-op shim. Inside Next.js this is automatic.)
 */

import { readFileSync } from "node:fs";

import {
  TekionClient,
  extractUserDisplayName,
  getAdvisorResolver,
  laborGrossCents,
  resolveAdvisorName,
} from "../lib/sources/tekion";
import type { RepairOrder } from "../lib/sources/tekion";

const SCT_ADVISOR_CACHE_PATH =
  "/home/itadmin/tekion-reports/data/sct-advisor-cache.json";

function loadSctAdvisorSeed(): Record<string, string> | undefined {
  try {
    const raw = readFileSync(SCT_ADVISOR_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const DEALER_ID = "americanmotorscorporation_876_0";

function fmtMoney(cents: number | null | undefined): string {
  if (typeof cents !== "number") return "n/a";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)} (${cents}¢)`;
}

async function main() {
  const client = new TekionClient();

  const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
  console.log(`\n=== Tekion smoke test — dealer ${DEALER_ID} ===`);
  console.log(
    `creationTime GTE ${threeDaysAgoMs} (${new Date(threeDaysAgoMs).toISOString()})\n`,
  );

  const page = await client.searchRepairOrders({
    dealerId: DEALER_ID,
    filters: [
      { field: "creationTime", operator: "GTE", values: [String(threeDaysAgoMs)] },
    ],
    pageSize: 5,
  });

  console.log(`totalCount: ${page.meta.totalCount}`);
  console.log(`returned:   ${page.results.length}`);
  console.log(`nextPageToken present: ${Boolean(page.meta.nextPageToken)}\n`);

  if (page.results.length === 0) {
    console.error("No ROs returned in the last 3 days — cannot smoke-test downstream calls.");
    process.exit(1);
  }

  const ro = page.results[0]!;
  const advisorId = ro.assignee?.advisor?.id ?? null;
  console.log(`first RO (as required by spec):`);
  console.log(`  documentId:          ${ro.documentId}`);
  console.log(`  documentNumber:      ${ro.documentNumber ?? "n/a"}`);
  console.log(`  status:              ${ro.status ?? "n/a"}`);
  console.log(`  assignee.advisor.id: ${advisorId ?? "n/a"}\n`);

  // ---- pluggable advisor name resolver ----
  const resolverKind =
    (process.env.TEKION_ADVISOR_RESOLVER ?? "browser").toLowerCase() === "api"
      ? "api"
      : "browser";
  const seed = loadSctAdvisorSeed();
  const resolver = getAdvisorResolver({
    dealerId: DEALER_ID,
    seed,
  });
  console.log(`advisor resolver (pluggable):`);
  console.log(`  TEKION_ADVISOR_RESOLVER: ${resolverKind}`);
  console.log(
    `  seed entries:            ${seed ? Object.keys(seed).length : "(none)"}`,
  );
  if (advisorId) {
    const name = await resolver.resolve(advisorId);
    console.log(`  first RO advisor.id:     ${advisorId}`);
    console.log(`  resolved name:           ${name ?? "(unresolved)"}`);
  } else {
    console.log(`  first RO has no advisor id — skipping resolver call for first RO`);
  }
  // Sanity-check the known id 59 -> "Edgardo Oliver" (verified 2026-06-15).
  const probe = await resolveAdvisorName("59", {
    dealerId: DEALER_ID,
    seed,
  });
  console.log(`  probe id 59 ->           ${probe ?? "(unresolved)"}\n`);

  // The "first" RO at SCT in the last 3 days is often UNASSIGNED (just created,
  // no jobs yet). Scan the page for an RO that actually has jobs+operations so
  // we can prove the downstream call chain returns real data.
  const drillTarget = await pickRoWithOperations(client, page.results);
  if (!drillTarget) {
    console.error(
      "None of the ROs in this page have any operations. Try widening the time window.",
    );
    process.exit(1);
  }

  const { ro: roDrill, jobId, op } = drillTarget;
  console.log(`drilling into RO ${roDrill.documentNumber} (documentId ${roDrill.documentId})`);
  console.log(`  status:           ${roDrill.status ?? "n/a"}`);
  console.log(`  first jobId:      ${jobId}`);
  console.log(`  first operation:`);
  console.log(`    opcode:            ${op.opcode ?? "n/a"}`);
  console.log(`    opcodeDescription: ${op.opcodeDescription ?? "n/a"}`);
  console.log(`    labor.saleAmount:  ${fmtMoney(op.labor?.saleAmount)}`);
  console.log(`    labor.costAmount:  ${fmtMoney(op.labor?.costAmount)}`);
  console.log(`    computed gross:    ${fmtMoney(laborGrossCents(op))}\n`);

  // Resolve advisor id -> name. Prefer the first RO's advisor (per spec); fall
  // back to the drill RO if the first one had no advisor assigned.
  const advisorIdToResolve =
    advisorId ?? roDrill.assignee?.advisor?.id ?? null;
  if (!advisorIdToResolve) {
    console.error("No advisor id on any candidate RO — cannot validate user resolution.");
    process.exit(1);
  }
  const detail = await client.resolveUserDetailed(DEALER_ID, advisorIdToResolve);
  console.log(`advisor resolution:`);
  console.log(`  id:           ${advisorIdToResolve}`);
  console.log(`  resolvedName: ${detail.name ?? "(unresolved)"}`);
  console.log(`  sourceField:  ${detail.sourceField ?? "(none)"}`);
  if (detail.raw && typeof detail.raw === "object") {
    const root = detail.raw as Record<string, unknown>;
    const dataKeys =
      root.data && typeof root.data === "object"
        ? Object.keys(root.data as Record<string, unknown>)
        : null;
    console.log(`  data keys:    ${dataKeys ? dataKeys.join(", ") : "(no data block)"}`);
  }
  if (detail.raw) {
    const reExtract = extractUserDisplayName(detail.raw);
    console.log(
      `  confirmed:    name="${reExtract.name ?? ""}" from field "${reExtract.sourceField ?? ""}"`,
    );
  }

  console.log("\n=== smoke test complete ===");
}

async function pickRoWithOperations(
  client: TekionClient,
  ros: RepairOrder[],
): Promise<
  | { ro: RepairOrder; jobId: string; op: import("../lib/sources/tekion").Operation }
  | null
> {
  for (const ro of ros) {
    if (!ro.documentId) continue;
    let jobs;
    try {
      jobs = await client.getJobs(DEALER_ID, ro.documentId);
    } catch (err) {
      console.warn(`  getJobs(${ro.documentId}) failed:`, err);
      continue;
    }
    for (const job of jobs) {
      const jid = (job.id ?? job.documentId ?? job.jobId) as string | null | undefined;
      if (!jid) continue;
      let ops;
      try {
        ops = await client.getOperations(DEALER_ID, ro.documentId, jid);
      } catch (err) {
        console.warn(`  getOperations(${ro.documentId}, ${jid}) failed:`, err);
        continue;
      }
      if (ops.length > 0) {
        return { ro, jobId: jid, op: ops[0]! };
      }
    }
  }
  return null;
}

main().catch((err) => {
  console.error("smoke test FAILED:", err);
  if (err && typeof err === "object" && "body" in err) {
    console.error("response body:", (err as { body: unknown }).body);
  }
  process.exit(1);
});
