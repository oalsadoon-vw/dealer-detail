import "server-only";

/**
 * Pluggable advisor-name resolver.
 *
 * Tekion ROs carry the service advisor as a NESTED id only
 * (`assignee.advisor.id`, e.g. "59"); the name lives in a separate user lookup.
 * Two strategies sit behind the AdvisorResolver interface:
 *
 *   - ApiAdvisorResolver:     production path via GET /openapi/v4.0.0/users/{id}.
 *                             Returns null on 403 (pilot app install not yet
 *                             scoped) so callers continue gracefully.
 *   - BrowserAdvisorResolver: interim path via the persistent authenticated
 *                             Tekion browser session on http://localhost:9223,
 *                             which proxies to the internal userservice
 *                             endpoint /api/userservice/u/apc/users/{id}.
 *
 * The collector calls resolveAdvisorName(advisorId); the env flag
 * TEKION_ADVISOR_RESOLVER selects the strategy (default "browser").
 */

import { TekionApiError, TekionClient } from "./client";

const PLACEHOLDER_NAMES = new Set([
  "any service advisor",
  "unassigned",
]);

export interface ResolvedAdvisor {
  name: string | null;
  persona: string | null;
}

export interface AdvisorResolver {
  resolve(advisorId: string): Promise<ResolvedAdvisor>;
}

function titleCase(input: string): string {
  return input.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return null;
  return titleCase(trimmed);
}

// ---------- API resolver ----------

export interface ApiAdvisorResolverConfig {
  dealerId: string;
  client?: TekionClient;
  seed?: Record<string, string>;
}

export class ApiAdvisorResolver implements AdvisorResolver {
  private readonly dealerId: string;
  private readonly client: TekionClient;
  private readonly seed: Map<string, string>;
  private warned403 = false;
  private readonly cache = new Map<string, ResolvedAdvisor>();

  constructor(cfg: ApiAdvisorResolverConfig) {
    if (!cfg.dealerId) {
      throw new Error("ApiAdvisorResolver: dealerId is required");
    }
    this.dealerId = cfg.dealerId;
    this.client = cfg.client ?? new TekionClient();
    this.seed = new Map(Object.entries(cfg.seed ?? {}));
  }

  async resolve(advisorId: string): Promise<ResolvedAdvisor> {
    if (!advisorId) return { name: null, persona: null };
    const cached = this.cache.get(advisorId);
    if (cached) return cached;
    const seeded = this.seed.get(advisorId);
    if (seeded) {
      // Seed only carries a name; persona is resolved lazily from the API on a
      // future call if needed. Seed hits short-circuit to avoid an API call.
      const r: ResolvedAdvisor = { name: normalizeName(seeded), persona: null };
      this.cache.set(advisorId, r);
      return r;
    }
    try {
      const detail = await this.client.resolveUserDetailed(
        this.dealerId,
        advisorId,
      );
      const r: ResolvedAdvisor = {
        name: normalizeName(detail.name),
        persona: detail.persona ?? null,
      };
      this.cache.set(advisorId, r);
      return r;
    } catch (err) {
      if (err instanceof TekionApiError && err.status === 403) {
        if (!this.warned403) {
          this.warned403 = true;
          console.warn(
            "[tekion advisors] /users/{id} returned 403 — app API scope not granted for user lookups. Names will be null until Tekion re-grants scope.",
          );
        }
        const r: ResolvedAdvisor = { name: null, persona: null };
        this.cache.set(advisorId, r);
        return r;
      }
      throw err;
    }
  }
}

// ---------- Browser resolver ----------

export interface BrowserAdvisorResolverConfig {
  browserUrl?: string;
  tekionShortDealerId?: string;
  seed?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface BrowserEvalResponse {
  result?: unknown;
  error?: unknown;
}

export class BrowserAdvisorResolver implements AdvisorResolver {
  private readonly browserUrl: string;
  private readonly tekionShortDealerId: string;
  private readonly seed: Map<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, string | null>();
  private warnedUnavailable = false;

  constructor(cfg: BrowserAdvisorResolverConfig = {}) {
    this.browserUrl = (cfg.browserUrl ?? "http://localhost:9223").replace(
      /\/+$/,
      "",
    );
    this.tekionShortDealerId = cfg.tekionShortDealerId ?? "876";
    this.seed = new Map(Object.entries(cfg.seed ?? {}));
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  /**
   * Build the IIFE that runs inside the authenticated Tekion browser session.
   * Mirrors `user_name(uid)` in sct_menu_sales_api.py — same headers, same
   * endpoint, same response shape (data.userNameDetails.firstName/lastName).
   */
  private buildEvalJs(advisorId: string): string {
    const idLit = JSON.stringify(advisorId);
    const dealerLit = JSON.stringify(this.tekionShortDealerId);
    return `(async () => {
  const H = {
    "Accept":"application/json","Content-Type":"application/json",
    "applicationId":"ARC_NA","clientId":"web","dealerId":${dealerLit},"locale":"en_US",
    "original-tenantid":"americanmotorscorporation",
    "original-userid":localStorage.getItem('__user_id'),
    "productIds":"ARC","program":"DEFAULT",
    "roleId":localStorage.getItem('currentActiveRoleId'),"subApplicationId":"US",
    "tek-siteId":localStorage.getItem('currentActiveSiteId'),
    "tekion-api-token":localStorage.getItem('t_token'),
    "tenantname":"americanmotorscorporation",
    "userId":localStorage.getItem('__user_id')
  };
  const r = await fetch('https://app.tekioncloud.com/api/userservice/u/apc/users/' + ${idLit},
    {credentials:'include', headers:H});
  if (r.status !== 200) return null;
  const j = await r.json();
  const d = (j.data && j.data.userNameDetails) || {};
  return ((d.firstName||'')+' '+(d.lastName||'')).trim() || null;
})()`;
  }

  async resolve(advisorId: string): Promise<ResolvedAdvisor> {
    // The browser/internal userservice path returns only a name, not persona.
    const name = await this.resolveName(advisorId);
    return { name, persona: null };
  }

  private async resolveName(advisorId: string): Promise<string | null> {
    if (!advisorId) return null;
    if (this.cache.has(advisorId)) return this.cache.get(advisorId) ?? null;
    const seeded = this.seed.get(advisorId);
    if (seeded) {
      const n = normalizeName(seeded);
      this.cache.set(advisorId, n);
      return n;
    }
    const js = this.buildEvalJs(advisorId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.browserUrl}/eval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ js }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        console.warn(
          `[tekion advisors] browser session at ${this.browserUrl} unavailable: ${(err as Error).message}`,
        );
      }
      this.cache.set(advisorId, null);
      return null;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        console.warn(
          `[tekion advisors] browser /eval returned HTTP ${res.status}`,
        );
      }
      this.cache.set(advisorId, null);
      return null;
    }
    let body: BrowserEvalResponse;
    try {
      body = (await res.json()) as BrowserEvalResponse;
    } catch {
      this.cache.set(advisorId, null);
      return null;
    }
    if (body.error) {
      console.warn(
        `[tekion advisors] browser /eval error: ${String(body.error).slice(0, 200)}`,
      );
      this.cache.set(advisorId, null);
      return null;
    }
    const raw = typeof body.result === "string" ? body.result : null;
    const name = normalizeName(raw);
    this.cache.set(advisorId, name);
    return name;
  }
}

// ---------- factory ----------

export type AdvisorResolverKind = "api" | "browser";

export interface GetAdvisorResolverOptions {
  kind?: AdvisorResolverKind;
  dealerId?: string;
  tekionShortDealerId?: string;
  browserUrl?: string;
  seed?: Record<string, string>;
  client?: TekionClient;
}

function detectKind(opts?: GetAdvisorResolverOptions): AdvisorResolverKind {
  if (opts?.kind) return opts.kind;
  // Default to the public OpenAPI resolver (Joe upgraded API scope 2026-06-18 so
  // GET /openapi/v4.0.0/users/{id} resolves names server-to-server). The browser
  // resolver remains available via TEKION_ADVISOR_RESOLVER=browser as a fallback.
  const env = (process.env.TEKION_ADVISOR_RESOLVER ?? "api").toLowerCase();
  return env === "browser" ? "browser" : "api";
}

let cachedResolver: AdvisorResolver | null = null;
let cachedKey: string | null = null;

function buildCacheKey(opts?: GetAdvisorResolverOptions): string {
  return JSON.stringify({
    k: detectKind(opts),
    d: opts?.dealerId ?? process.env.TEKION_DEALER_ID ?? "",
    s: opts?.tekionShortDealerId ?? process.env.TEKION_SHORT_DEALER_ID ?? "876",
    b:
      opts?.browserUrl ??
      process.env.TEKION_BROWSER_URL ??
      "http://localhost:9223",
    seed: opts?.seed ?? null,
  });
}

export function getAdvisorResolver(
  opts?: GetAdvisorResolverOptions,
): AdvisorResolver {
  const key = buildCacheKey(opts);
  if (cachedResolver && cachedKey === key) return cachedResolver;
  const kind = detectKind(opts);
  if (kind === "api") {
    const dealerId = opts?.dealerId ?? process.env.TEKION_DEALER_ID ?? "";
    cachedResolver = new ApiAdvisorResolver({
      dealerId,
      client: opts?.client,
      seed: opts?.seed,
    });
  } else {
    cachedResolver = new BrowserAdvisorResolver({
      browserUrl: opts?.browserUrl ?? process.env.TEKION_BROWSER_URL,
      tekionShortDealerId:
        opts?.tekionShortDealerId ?? process.env.TEKION_SHORT_DEALER_ID,
      seed: opts?.seed,
    });
  }
  cachedKey = key;
  return cachedResolver;
}

/**
 * Back-compat helper that returns just the advisor display name. Prefer
 * `getAdvisorResolver(opts).resolve(id)` for the full { name, persona }.
 */
export async function resolveAdvisorName(
  advisorId: string,
  opts?: GetAdvisorResolverOptions,
): Promise<string | null> {
  const { name } = await getAdvisorResolver(opts).resolve(advisorId);
  return name;
}

/**
 * Resolve both the advisor display name and persona in one call.
 */
export async function resolveAdvisor(
  advisorId: string,
  opts?: GetAdvisorResolverOptions,
): Promise<ResolvedAdvisor> {
  return getAdvisorResolver(opts).resolve(advisorId);
}
