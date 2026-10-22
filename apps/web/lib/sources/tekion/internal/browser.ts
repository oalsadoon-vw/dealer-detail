/**
 * Bridge to the persistent, logged-in Tekion browser (Playwright server on
 * :9225 exposing POST /eval { js }). Every internal-API call runs INSIDE the
 * page so Tekion's cookies + localStorage token attach automatically — the
 * same path the GL snapshot (scripts/gl-snapshot.ts) already relies on.
 *
 * Pure plumbing: no Tekion knowledge here beyond "are we logged in".
 */

export class BrowserNotAuthenticated extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BrowserNotAuthenticated";
  }
}

export class BrowserEvalError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BrowserEvalError";
  }
}

export interface BrowserBridgeOptions {
  /** Base URL of the persistent browser server. Default env TEKION_BROWSER or :9225. */
  baseUrl?: string;
  /** Per-eval timeout. Default 240s (job/search for 50 ROs is ~0.4s; headroom for slow nights). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class BrowserBridge {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: BrowserBridgeOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.TEKION_BROWSER ?? "http://127.0.0.1:9225").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 240_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Evaluate JS in the page. The expression MUST resolve to a JSON string
   * (we JSON.parse it) or a plain JSON value. Throws BrowserEvalError on
   * transport / page errors.
   */
  async eval<T = unknown>(js: string): Promise<T> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/eval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ js }),
          signal: ctl.signal,
        });
      } catch (err) {
        throw new BrowserEvalError(`browser unreachable at ${this.baseUrl}: ${(err as Error).message}`);
      }
      let body: { result?: unknown; error?: string };
      try {
        body = (await res.json()) as { result?: unknown; error?: string };
      } catch {
        throw new BrowserEvalError(`browser /eval returned non-JSON (HTTP ${res.status})`);
      }
      if (body.error) throw new BrowserEvalError(`browser eval error: ${body.error}`);
      const r = body.result;
      if (typeof r === "string") {
        try {
          return JSON.parse(r) as T;
        } catch {
          throw new BrowserEvalError(`browser eval returned non-JSON string: ${r.slice(0, 200)}`);
        }
      }
      return r as T;
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Hard gate: throws BrowserNotAuthenticated unless the page is on
   * app.tekioncloud.com with a session token. Uses hostname equality, NOT a
   * regex — the regex version broke through curl→JSON escaping (10/22 GL cron).
   */
  async assertAuthenticated(): Promise<void> {
    let st: { host: string; hasToken: boolean; hasCookie: boolean };
    try {
      st = await this.eval(
        `JSON.stringify({host: location.hostname, hasToken: !!localStorage.getItem('t_token'), hasCookie: document.cookie.indexOf('tcookie=')>=0})`,
      );
    } catch (err) {
      throw new BrowserNotAuthenticated(`cannot inspect browser session: ${(err as Error).message}`);
    }
    if (st.host !== "app.tekioncloud.com" || !st.hasToken || !st.hasCookie) {
      throw new BrowserNotAuthenticated(
        `browser not logged into Tekion (host=${st.host} token=${st.hasToken} cookie=${st.hasCookie}) — re-run restore_9223_session / log in on ${this.baseUrl}`,
      );
    }
  }
}
