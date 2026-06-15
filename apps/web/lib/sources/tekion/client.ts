import "server-only";

/**
 * Tekion OpenAPI client (server-only).
 *
 * Auth flow mirrors the Python reference at /home/itadmin/tekion-api/tekion_client.py:
 *   POST <TEKION_BASE_URL>/openapi/public/tokens with form-encoded
 *     app_id + secret_key
 *   ->  { status: "success", data: { access_token, expire_on, ... } }
 *
 * Token is cached in-memory until ~5 min before expiry.
 *
 * Every data call sends: Authorization: Bearer <tok>, app_id, dealer_id,
 * Content-Type: application/json.
 */

import { TokenBucket, tekionLimiter, backoffMs, sleep } from "./throttle";
import type {
  Job,
  Operation,
  Part,
  RepairOrder,
  RepairOrderSearchPage,
  RoVehicle,
  SearchFilter,
  TokenResponse,
} from "./types";

const OPENAPI_PREFIX = "/openapi/v4.0.0";
const TOKEN_PATH = "/openapi/public/tokens";
const USER_PATH_PREFIX = "/userservice/u/apc/users";
const TOKEN_EXPIRY_SAFETY_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000;
const MAX_RETRIES = 4;

export class TekionApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "TekionApiError";
    this.status = status;
    this.body = body;
  }
}

export class TekionRateLimitError extends TekionApiError {
  constructor(body: string) {
    super(`Tekion rate limit (429): ${body.slice(0, 200)}`, 429, body);
    this.name = "TekionRateLimitError";
  }
}

export interface TekionClientConfig {
  baseUrl: string;
  appId: string;
  secretKey: string;
  limiter?: TokenBucket;
  fetchImpl?: typeof fetch;
}

export interface SearchRepairOrdersInput {
  dealerId: string;
  filters: SearchFilter[];
  pageSize?: number;
  paginationToken?: string | null;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

function readConfigFromEnv(): TekionClientConfig {
  const baseUrl = process.env.TEKION_BASE_URL;
  const appId = process.env.TEKION_APP_ID;
  const secretKey = process.env.TEKION_SECRET_KEY;
  const missing: string[] = [];
  if (!baseUrl) missing.push("TEKION_BASE_URL");
  if (!appId) missing.push("TEKION_APP_ID");
  if (!secretKey) missing.push("TEKION_SECRET_KEY");
  if (missing.length > 0) {
    throw new Error(
      `TekionClient: missing required env vars: ${missing.join(", ")}`,
    );
  }
  return { baseUrl: baseUrl!, appId: appId!, secretKey: secretKey! };
}

export class TekionClient {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly limiter: TokenBucket;
  private readonly fetchImpl: typeof fetch;
  private tokenCache: CachedToken | null = null;
  private inFlightToken: Promise<string> | null = null;
  private readonly userNameCache = new Map<string, string | null>();

  constructor(config?: Partial<TekionClientConfig>) {
    const env = readConfigFromEnv();
    this.baseUrl = (config?.baseUrl ?? env.baseUrl).replace(/\/+$/, "");
    this.appId = config?.appId ?? env.appId;
    this.secretKey = config?.secretKey ?? env.secretKey;
    this.limiter = config?.limiter ?? tekionLimiter;
    this.fetchImpl = config?.fetchImpl ?? fetch;
  }

  // ---------- token ----------

  private async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.tokenCache &&
      this.tokenCache.expiresAtMs - now > TOKEN_EXPIRY_SAFETY_MS
    ) {
      return this.tokenCache.accessToken;
    }
    if (this.inFlightToken) return this.inFlightToken;
    this.inFlightToken = this.fetchToken()
      .then((tok) => {
        this.tokenCache = tok;
        return tok.accessToken;
      })
      .finally(() => {
        this.inFlightToken = null;
      });
    return this.inFlightToken;
  }

  private async fetchToken(): Promise<CachedToken> {
    const url = `${this.baseUrl}${TOKEN_PATH}`;
    const body = new URLSearchParams({
      app_id: this.appId,
      secret_key: this.secretKey,
    }).toString();
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new TekionApiError(
        `Token request failed: HTTP ${res.status}`,
        res.status,
        text,
      );
    }
    let parsed: { status?: string; data?: TokenResponse };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TekionApiError(
        `Token response was not valid JSON`,
        res.status,
        text,
      );
    }
    if (parsed.status !== "success" || !parsed.data?.access_token) {
      throw new TekionApiError(
        `Token response status != success`,
        res.status,
        text,
      );
    }
    const tok = parsed.data;
    // Python client uses epoch seconds in `expire_on`. Be defensive: accept
    // either seconds or ms by comparing magnitude to "now".
    let expiresAtMs: number;
    if (typeof tok.expire_on === "number" && tok.expire_on > 0) {
      expiresAtMs = tok.expire_on < 1e12 ? tok.expire_on * 1000 : tok.expire_on;
    } else {
      expiresAtMs = Date.now() + DEFAULT_TOKEN_TTL_MS;
    }
    return { accessToken: tok.access_token, expiresAtMs };
  }

  // ---------- core request ----------

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    dealerId: string,
    jsonBody?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.limiter.acquire();
      const token = await this.getToken(attempt > 0 && lastError instanceof TekionApiError && (lastError.status === 401 || lastError.status === 403));
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        app_id: this.appId,
        dealer_id: dealerId,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const init: RequestInit = { method, headers };
      if (jsonBody !== undefined) init.body = JSON.stringify(jsonBody);

      let res: Response;
      try {
        res = await this.fetchImpl(url, init);
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      }

      const text = await res.text();
      if (res.ok) {
        if (!text) return {} as T;
        return JSON.parse(text) as T;
      }

      if (res.status === 429) {
        const rateErr = new TekionRateLimitError(text);
        lastError = rateErr;
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt + 2));
          continue;
        }
        throw rateErr;
      }

      if ((res.status === 401 || res.status === 403) && attempt < MAX_RETRIES) {
        lastError = new TekionApiError(
          `HTTP ${res.status} on ${method} ${path}`,
          res.status,
          text,
        );
        // force a token refresh on next loop iteration
        this.tokenCache = null;
        await sleep(200);
        continue;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastError = new TekionApiError(
          `HTTP ${res.status} on ${method} ${path}`,
          res.status,
          text,
        );
        await sleep(backoffMs(attempt));
        continue;
      }

      throw new TekionApiError(
        `Tekion ${method} ${path} failed: HTTP ${res.status}`,
        res.status,
        text,
      );
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`Tekion ${method} ${path} failed after ${MAX_RETRIES} retries`);
  }

  // ---------- public methods ----------

  async searchRepairOrders(
    input: SearchRepairOrdersInput,
  ): Promise<RepairOrderSearchPage> {
    const { dealerId, filters, pageSize = 50, paginationToken } = input;
    if (pageSize > 50) {
      throw new Error("Tekion repair-orders search pageSize max is 50");
    }
    const body: Record<string, unknown> = { filters, pageSize };
    if (paginationToken) body.paginationToken = paginationToken;
    const raw = await this.request<{
      data?: { results?: RepairOrder[] };
      meta?: { totalCount?: number; nextPageToken?: string | null };
    }>("POST", `${OPENAPI_PREFIX}/repair-orders:search`, dealerId, body);
    return {
      results: raw.data?.results ?? [],
      meta: {
        totalCount: raw.meta?.totalCount,
        nextPageToken: raw.meta?.nextPageToken ?? null,
      },
    };
  }

  async *iterateRepairOrders(
    input: Omit<SearchRepairOrdersInput, "paginationToken">,
  ): AsyncGenerator<RepairOrder, void, void> {
    let token: string | null | undefined = undefined;
    while (true) {
      const page = await this.searchRepairOrders({
        ...input,
        paginationToken: token ?? null,
      });
      for (const ro of page.results) yield ro;
      token = page.meta.nextPageToken;
      if (!token) return;
    }
  }

  async getJobs(dealerId: string, roId: string): Promise<Job[]> {
    const raw = await this.request<{ data?: { jobs?: Job[] } }>(
      "GET",
      `${OPENAPI_PREFIX}/repair-orders/${encodeURIComponent(roId)}/jobs`,
      dealerId,
    );
    return raw.data?.jobs ?? [];
  }

  async getOperations(
    dealerId: string,
    roId: string,
    jobId: string,
  ): Promise<Operation[]> {
    const raw = await this.request<{ data?: { roOperations?: Operation[] } }>(
      "GET",
      `${OPENAPI_PREFIX}/repair-orders/${encodeURIComponent(roId)}/jobs/${encodeURIComponent(jobId)}/operations`,
      dealerId,
    );
    return raw.data?.roOperations ?? [];
  }

  async getParts(
    dealerId: string,
    roId: string,
    jobId: string,
    operationId: string,
  ): Promise<Part[]> {
    const raw = await this.request<{ data?: { parts?: Part[] } }>(
      "GET",
      `${OPENAPI_PREFIX}/repair-orders/${encodeURIComponent(roId)}/jobs/${encodeURIComponent(jobId)}/operations/${encodeURIComponent(operationId)}/parts`,
      dealerId,
    );
    return raw.data?.parts ?? [];
  }

  async getRoVehicle(dealerId: string, roId: string): Promise<RoVehicle | null> {
    const raw = await this.request<{ data?: RoVehicle | null }>(
      "GET",
      `${OPENAPI_PREFIX}/repair-orders/${encodeURIComponent(roId)}/ro-vehicle`,
      dealerId,
    );
    return raw.data ?? null;
  }

  /**
   * Resolve a Tekion user id to a display name via the userservice endpoint.
   * Results are cached per-client. Returns null if the user cannot be resolved.
   *
   * Returns both the name and which response field it came from on the *first*
   * lookup for that id, so smoke tests can confirm the source field. Subsequent
   * lookups for the same id are served from cache.
   */
  async resolveUser(dealerId: string, userId: string): Promise<string | null> {
    const detail = await this.resolveUserDetailed(dealerId, userId);
    return detail.name;
  }

  async resolveUserDetailed(
    dealerId: string,
    userId: string,
  ): Promise<{ name: string | null; sourceField: string | null; raw?: unknown }> {
    if (!userId) return { name: null, sourceField: null };
    if (this.userNameCache.has(userId)) {
      return { name: this.userNameCache.get(userId) ?? null, sourceField: null };
    }
    let raw: unknown;
    try {
      raw = await this.request<unknown>(
        "GET",
        `${USER_PATH_PREFIX}/${encodeURIComponent(userId)}`,
        dealerId,
      );
    } catch (err) {
      if (err instanceof TekionApiError && err.status === 404) {
        this.userNameCache.set(userId, null);
        return { name: null, sourceField: null };
      }
      throw err;
    }
    const { name, sourceField } = extractUserDisplayName(raw);
    this.userNameCache.set(userId, name);
    return { name, sourceField, raw };
  }
}

/**
 * Pluck a human display name out of the userservice response.
 *
 * Tekion's user objects vary across deployments; the canonical Tekion shape is
 * { data: { firstName, lastName, displayName?, email?, ... } } but some
 * endpoints return the data block ungrouped, and some only have one of first
 * or last name. We try the most specific field first.
 */
export function extractUserDisplayName(raw: unknown): {
  name: string | null;
  sourceField: string | null;
} {
  if (!raw || typeof raw !== "object") return { name: null, sourceField: null };
  const root = raw as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [];
  if (root.data && typeof root.data === "object")
    candidates.push(root.data as Record<string, unknown>);
  candidates.push(root);

  for (const obj of candidates) {
    const display = obj.displayName;
    if (typeof display === "string" && display.trim()) {
      return { name: display.trim(), sourceField: "data.displayName" };
    }
    const first = typeof obj.firstName === "string" ? obj.firstName.trim() : "";
    const last = typeof obj.lastName === "string" ? obj.lastName.trim() : "";
    if (first || last) {
      const full = `${first} ${last}`.trim();
      return { name: full, sourceField: "data.firstName + data.lastName" };
    }
    const fullName = obj.fullName;
    if (typeof fullName === "string" && fullName.trim()) {
      return { name: fullName.trim(), sourceField: "data.fullName" };
    }
    const name = obj.name;
    if (typeof name === "string" && name.trim()) {
      return { name: name.trim(), sourceField: "data.name" };
    }
    const username = obj.userName ?? obj.username;
    if (typeof username === "string" && username.trim()) {
      return { name: username.trim(), sourceField: "data.userName" };
    }
  }
  return { name: null, sourceField: null };
}
