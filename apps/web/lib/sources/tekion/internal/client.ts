/**
 * Tekion INTERNAL (browser) API client for repair orders.
 *
 * Why this exists: the public OpenAPI costs ~12 calls per RO (jobs → ops per
 * job → parts per op → vehicle) against a 1,500-call / 15-min APP-WIDE quota.
 * The internal API returns the whole RO tree in bulk and burns none of it:
 *
 *   POST /api/service-module/u/ro/v1/ro-search   headers for a modifiedTime window, 200/page
 *   POST /api/service-module/u/job/search         ALL jobs+operations+partLineV2s for ≤50 roIds, 1 call
 *   GET  /api/userservice/u/apc/users/{id}        advisor name + personas
 *
 * All calls execute inside the logged-in page (see browser.ts) so the dealer
 * context is purely a header — no UI dealer switching, no shared-state drift.
 * Numeric dealer id (e.g. "1251"), NOT the OpenAPI "americanmotorscorporation_1251_0".
 *
 * Verified live 2026-10-22 (BC/SCT/TOL): rows>200 on ro-search → 400
 * max.es.search.row.count.exceeded; job/search count==hits for 50 roIds up to
 * 500 rows; deleted:true job == voided job (nonVoidedJobCount ties exactly).
 */

import type { BrowserBridge } from "./browser";

export interface InternalRoHeader {
  id: string;
  roNo: string;
  status: string;
  previousStatus?: string | null;
  type?: string | null;
  source?: string | null;
  createdTime?: number | null;
  modifiedTime?: number | null;
  closedTime?: number | null;
  firstClosedTime?: number | null;
  lastInvoicedTime?: number | null;
  checkinTime?: number | null;
  promiseTime?: number | null;
  appointmentDateTime?: number | null;
  primaryAdvisorId?: string | null;
  allAdvisorIds?: string[] | null;
  departmentId?: string | null;
  jobCount?: number | null;
  nonVoidedJobCount?: number | null;
  voidedJobCount?: number | null;
  vehicle?: {
    vin?: string | null;
    year?: string | number | null;
    make?: string | null;
    makeLabel?: string | null;
    model?: string | null;
    displayModel?: string | null;
    mileageIn?: number | null;
    mileageOut?: number | null;
    oem?: string | null;
    brand?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface InternalPartLine {
  partId?: string | null;
  partNumber?: string | null;
  resolvedPartName?: string | null;
  status?: string | null;
  deleted?: boolean | null;
  saleQty?: number | null;
  qty?: number | null;
  totalSaleAmount?: number | null;
  totalCost?: number | null;
  oemAdjustmentCostPerPart?: number | null;
  costPricePerPart?: number | null;
  sellingPricePerPart?: number | null;
  createdTime?: number | null;
  modifiedTime?: number | null;
  [key: string]: unknown;
}

export interface InternalOperation {
  id: string;
  opcode?: string | null;
  opcodeDescription?: string | null;
  operationNumber?: string | null;
  payType?: string | null;
  deleted?: boolean | null;
  laborAmount?: { amount?: number | null } | number | null;
  laborCostAmount?: { amount?: number | null } | number | null;
  billingTimeInSeconds?: number | null;
  laborTimeInSeconds?: number | null;
  category?: string | null;
  opcodeType?: string | null;
  partLineV2s?: InternalPartLine[] | null;
  createdTime?: number | null;
  modifiedTime?: number | null;
  [key: string]: unknown;
}

export interface InternalJob {
  id: string;
  roId: string;
  roNo?: string | null;
  jobNumber?: string | number | null;
  status?: string | null;
  internalStatus?: string | null;
  deleted?: boolean | null;
  payType?: string | null;
  subPayType?: string | null;
  type?: string | null;
  concern?: string | null;
  createdTime?: number | null;
  modifiedTime?: number | null;
  completedTime?: number | null;
  operations?: InternalOperation[] | null;
  [key: string]: unknown;
}

export interface InternalUser {
  id: string;
  name: string | null;
  persona: string | null;
  personas: string[];
  raw?: unknown;
}

export class InternalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    body: string,
  ) {
    super(`Tekion internal API ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = "InternalApiError";
  }
}

export const RO_SEARCH_PAGE_MAX = 200; // hard server cap (RO1332 above this)
export const JOB_SEARCH_RO_BATCH = 50;
export const JOB_SEARCH_ROWS = 500;

/** The in-page header builder. dealerId is NUMERIC ("1251"). */
function headerJs(dealerId: string): string {
  const d = JSON.stringify(dealerId);
  return `
var __tc = JSON.parse(decodeURIComponent(document.cookie.split('tcookie=')[1].split(';')[0]));
var __H = {'tekion-api-token': localStorage.getItem('t_token'), roleid: __tc.roleId||'', tenantname: __tc.tenantname||'americanmotorscorporation',
  dealerid: ${d}, clientId:'web', 'tek-siteId':'-1_'+${d}, correlationId:String(Date.now()), 'Content-Type':'application/json',
  userId: localStorage.getItem('__user_id')||''};
async function __call(method, path, body){
  var r = await fetch(path, {method: method, headers: __H, credentials: 'include', body: body===undefined?undefined:JSON.stringify(body)});
  var t = await r.text();
  if (r.status !== 200) return {__err: r.status, __body: t.slice(0, 400), __path: path};
  try { return JSON.parse(t); } catch(e) { return {__err: r.status, __body: 'non-JSON: ' + t.slice(0, 200), __path: path}; }
}`;
}

function unwrap<T>(res: unknown, path: string): T {
  const r = res as { __err?: number; __body?: string; __path?: string; data?: T; status?: string };
  if (r && typeof r === "object" && typeof r.__err === "number") {
    throw new InternalApiError(r.__err, r.__path ?? path, r.__body ?? "");
  }
  if (!r || typeof r !== "object" || r.data === undefined) {
    throw new InternalApiError(200, path, `missing data envelope: ${JSON.stringify(res).slice(0, 200)}`);
  }
  return r.data;
}

export class TekionInternalClient {
  constructor(private readonly bridge: BrowserBridge) {}

  /**
   * One page of RO headers whose modifiedTime ∈ [startMs, endMs], ASC by
   * modifiedTime so a cursor (last modifiedTime seen) is resumable.
   */
  async searchRoHeaders(
    dealerId: string,
    startMs: number,
    endMs: number,
    start: number,
    rows: number = RO_SEARCH_PAGE_MAX,
  ): Promise<{ total: number; list: InternalRoHeader[] }> {
    if (rows > RO_SEARCH_PAGE_MAX) throw new Error(`rows ${rows} > server cap ${RO_SEARCH_PAGE_MAX}`);
    const body = {
      pageInfo: { start, rows },
      sort: [{ order: "ASC", field: "modifiedTime" }],
      searchText: null,
      filters: [
        { operator: "IN", values: [false], field: "migrated" },
        { operator: "GTE", values: [startMs], field: "modifiedTime" },
        { operator: "LTE", values: [endMs], field: "modifiedTime" },
      ],
      searchFields: ["RO_NO"],
    };
    const path = "/api/service-module/u/ro/v1/ro-search";
    const js = `${headerJs(dealerId)}
(async()=>{ var r = await __call('POST', ${JSON.stringify(path)}, ${JSON.stringify(body)}); return JSON.stringify(r); })()`;
    const d = unwrap<{ total?: number; list?: InternalRoHeader[] }>(await this.bridge.eval(js), path);
    return { total: Number(d.total ?? 0), list: Array.isArray(d.list) ? d.list : [] };
  }

  /** Full page for an arbitrary ro-search body (reconcile / tie-out probes). */
  async rawRoSearch(dealerId: string, body: Record<string, unknown>): Promise<{ total: number; list: InternalRoHeader[] }> {
    const path = "/api/service-module/u/ro/v1/ro-search";
    const js = `${headerJs(dealerId)}
(async()=>{ var r = await __call('POST', ${JSON.stringify(path)}, ${JSON.stringify(body)}); return JSON.stringify(r); })()`;
    const d = unwrap<{ total?: number; list?: InternalRoHeader[] }>(await this.bridge.eval(js), path);
    return { total: Number(d.total ?? 0), list: Array.isArray(d.list) ? d.list : [] };
  }

  /** `total` for an arbitrary ro-search body (reconcile / coverage checks). */
  async countRoSearch(dealerId: string, body: Record<string, unknown>): Promise<number> {
    const path = "/api/service-module/u/ro/v1/ro-search";
    const js = `${headerJs(dealerId)}
(async()=>{ var r = await __call('POST', ${JSON.stringify(path)}, ${JSON.stringify(body)}); return JSON.stringify(r); })()`;
    const d = unwrap<{ total?: number }>(await this.bridge.eval(js), path);
    return Number(d.total ?? 0);
  }

  /** Every job (with operations + partLineV2s) for up to 50 roIds, in ONE call. */
  async jobsForRos(dealerId: string, roIds: string[]): Promise<InternalJob[]> {
    if (roIds.length === 0) return [];
    if (roIds.length > JOB_SEARCH_RO_BATCH) throw new Error(`jobsForRos: ${roIds.length} roIds > batch ${JOB_SEARCH_RO_BATCH}`);
    const path = "/api/service-module/u/job/search";
    const body = { filters: [{ field: "roId", operator: "IN", values: roIds }], pageInfo: { start: 0, rows: JOB_SEARCH_ROWS } };
    const js = `${headerJs(dealerId)}
(async()=>{ var r = await __call('POST', ${JSON.stringify(path)}, ${JSON.stringify(body)}); return JSON.stringify(r); })()`;
    const d = unwrap<{ count?: number; hits?: InternalJob[]; nextPageToken?: string | null }>(await this.bridge.eval(js), path);
    const hits = Array.isArray(d.hits) ? d.hits : [];
    // Safety: 50 ROs × ~5 jobs ≈ 250 ≪ 500. If a batch ever overflows, fail
    // loudly rather than silently truncating an RO's job list.
    if (typeof d.count === "number" && d.count > hits.length) {
      throw new InternalApiError(200, path, `job/search truncated: count=${d.count} hits=${hits.length} for ${roIds.length} roIds`);
    }
    return hits;
  }

  /** Advisor/user lookup: display name + ALL personas (primary + secondary). */
  async getUser(dealerId: string, userId: string): Promise<InternalUser> {
    const path = `/api/userservice/u/apc/users/${encodeURIComponent(userId)}`;
    const js = `${headerJs(dealerId)}
(async()=>{ var r = await __call('GET', ${JSON.stringify(path)}); return JSON.stringify(r); })()`;
    const d = unwrap<Record<string, unknown>>(await this.bridge.eval(js), path);
    return parseInternalUser(userId, d);
  }
}

/** Pure: internal /apc/users payload → {name, persona, personas}. Exported for tests. */
export function parseInternalUser(userId: string, d: Record<string, unknown>): InternalUser {
  const und = (d.userNameDetails ?? {}) as Record<string, unknown>;
  const cn = Array.isArray(und.completeNames) ? (und.completeNames as Array<{ nameType?: string; value?: string }>) : [];
  const disp = cn.find((n) => n?.nameType === "DISPLAY_NAME")?.value;
  const fl = [und.firstName, und.lastName].filter((x) => typeof x === "string" && x.trim()).join(" ");
  const name = (typeof disp === "string" && disp.trim() ? disp : fl).trim() || null;

  const urd = (d.userRoleDetails ?? {}) as Record<string, unknown>;
  const personas: string[] = [];
  const prim = (urd.primaryRole as { persona?: string } | undefined)?.persona;
  if (typeof prim === "string" && prim.trim()) personas.push(prim.trim());
  const sec = Array.isArray(urd.secondaryRoles) ? (urd.secondaryRoles as Array<{ persona?: string }>) : [];
  for (const s of sec) if (typeof s?.persona === "string" && s.persona.trim()) personas.push(s.persona.trim());

  return { id: userId, name: normalizeDisplayName(name), persona: effectivePersona(personas), personas, raw: d };
}

/**
 * Persona rule (T9 §7). The "Others" bucket exists for fixed-ops staff who
 * occasionally write ROs — service managers/directors, cashiers, warranty
 * clerks, techs, dispatchers, parts. Those PRIMARY personas keep precedence.
 * Only a GENERIC / non-service primary (Employee, Sales, Inventory, null)
 * is overridden by a SERVICE_ADVISOR secondary role — that is how stores like
 * BC file real advisors (Jacob Debussey, Humberto Dominguez).
 */
export const PERSONAS_KEEPING_PRECEDENCE = new Set([
  "SERVICE_ADVISOR",
  "SERVICE_MANAGER",
  "SERVICE_DIRECTOR",
  "CONTROLLER",
  "CASHIER",
  "WARRANTY_CLERK",
  "TECHNICIAN",
  "DISPATCHER",
  "SERVICE_DISPATCHER",
  "BDC_MANAGER",
  "BDC_SUPER_ADMIN",
  "PARTS_DIRECTOR",
  "PARTS_MANAGER",
  "PARTS_FRONT_COUNTERPERSON",
  "PARTS_RECEIVER",
  "RO_SALE_COUNTERPERSONN",
]);

export function effectivePersona(personas: string[]): string | null {
  const primary = personas[0] ?? null;
  if (primary && PERSONAS_KEEPING_PRECEDENCE.has(primary)) return primary;
  if (personas.includes("SERVICE_ADVISOR")) return "SERVICE_ADVISOR";
  return primary;
}

/** "JACOB DEBUSSEY" → "Jacob Debussey" (matches the OpenAPI resolver's normalizeName). */
export function normalizeDisplayName(n: string | null): string | null {
  if (!n) return null;
  const t = n.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (t !== t.toUpperCase()) return t; // already mixed case — leave as-is
  return t
    .toLowerCase()
    .split(" ")
    .map((w) => w.split("-").map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p)).join("-"))
    .join(" ");
}
