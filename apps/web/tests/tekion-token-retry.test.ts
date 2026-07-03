import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  retryWithBackoff,
  TOKEN_RETRY_DELAYS_MS,
} from "../lib/sources/tekion/throttle";
import {
  TekionApiError,
  TekionClient,
  isTransientTokenError,
} from "../lib/sources/tekion/client";

const noSleep = (_ms: number) => Promise.resolve();

describe("retryWithBackoff", () => {
  it("returns on first success without sleeping", async () => {
    const sleepImpl = vi.fn(noSleep);
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      retryWithBackoff(fn, { delaysMs: [5, 15, 45], sleepImpl }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("retries transient failures and succeeds on a later attempt", async () => {
    const sleepImpl = vi.fn(noSleep);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Token request failed: HTTP 400"))
      .mockRejectedValueOnce(new Error("Token request failed: HTTP 400"))
      .mockResolvedValue("token");
    await expect(
      retryWithBackoff(fn, { delaysMs: [5, 15, 45], sleepImpl }),
    ).resolves.toBe("token");
    expect(fn).toHaveBeenCalledTimes(3);
    // Slept with the scheduled delays in order.
    expect(sleepImpl.mock.calls.map((c) => c[0])).toEqual([5, 15]);
  });

  it("exhausts the schedule (delays.length + 1 attempts) then rethrows the last error", async () => {
    const sleepImpl = vi.fn(noSleep);
    const err = new Error("Token request failed: HTTP 400");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, { delaysMs: [5, 15, 45], sleepImpl }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(sleepImpl.mock.calls.map((c) => c[0])).toEqual([5, 15, 45]);
  });

  it("stops immediately when shouldRetry returns false", async () => {
    const sleepImpl = vi.fn(noSleep);
    const err = new Error("permanent");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, {
        delaysMs: [5, 15, 45],
        sleepImpl,
        shouldRetry: () => false,
      }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("invokes onRetry with 1-based attempt and delay", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValue("ok");
    await retryWithBackoff(fn, { delaysMs: [5, 15], sleepImpl: noSleep, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 5);
  });

  it("default schedule is 5s/15s/45s", () => {
    expect([...TOKEN_RETRY_DELAYS_MS]).toEqual([5_000, 15_000, 45_000]);
  });
});

describe("isTransientTokenError", () => {
  it("treats HTTP 4xx/5xx TekionApiError as transient", () => {
    expect(
      isTransientTokenError(
        new TekionApiError("Token request failed: HTTP 400", 400, ""),
      ),
    ).toBe(true);
    expect(
      isTransientTokenError(
        new TekionApiError("Token request failed: HTTP 503", 503, ""),
      ),
    ).toBe(true);
  });

  it("treats network errors (non-TekionApiError) as transient", () => {
    expect(isTransientTokenError(new TypeError("fetch failed"))).toBe(true);
  });

  it("does NOT retry malformed 2xx token responses (status 200 contract errors)", () => {
    expect(
      isTransientTokenError(
        new TekionApiError("Token response status != success", 200, "{}"),
      ),
    ).toBe(false);
  });
});

describe("TekionClient token fetch retry (mocked fetch)", () => {
  // The constructor unconditionally reads env for defaults, so provide dummies.
  beforeAll(() => {
    vi.stubEnv("TEKION_BASE_URL", "https://tekion.example.com");
    vi.stubEnv("TEKION_APP_ID", "app");
    vi.stubEnv("TEKION_SECRET_KEY", "secret");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const baseConfig = {
    baseUrl: "https://tekion.example.com",
    appId: "app",
    secretKey: "secret",
    tokenRetryDelaysMs: [0, 0, 0] as const, // no real waits in tests
  };

  const goodTokenResponse = () =>
    new Response(
      JSON.stringify({
        status: "success",
        data: {
          access_token: "tok-123",
          expire_on: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
      { status: 200 },
    );

  it("recovers from a transient HTTP 400 on the token endpoint", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      // token attempt 1: transient 400 (the observed nightly failure)
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      // token attempt 2: success
      .mockResolvedValueOnce(goodTokenResponse())
      // subsequent data call
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 }),
      );
    const client = new TekionClient({ ...baseConfig, fetchImpl });
    const jobs = await client.getJobs("dealer-1", "ro-1");
    expect(jobs).toEqual([]);
    // 2 token calls + 1 data call
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const tokenCalls = fetchImpl.mock.calls.filter(([url]) =>
      String(url).includes("/tokens"),
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it("gives up after exhausting token retries and surfaces the original error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      // Fresh Response each call — a Response body can only be read once.
      .mockImplementation(async () => new Response("still broken", { status: 400 }));
    const client = new TekionClient({ ...baseConfig, fetchImpl });
    await expect(client.getJobs("dealer-1", "ro-1")).rejects.toThrow(
      /Token request failed: HTTP 400/,
    );
    // 4 token attempts (1 + 3 retries); no data call ever made.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).toContain("/tokens");
    }
  });
});
