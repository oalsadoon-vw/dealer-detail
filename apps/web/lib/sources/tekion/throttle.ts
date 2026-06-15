/**
 * Token-bucket rate limiter for the Tekion Basic plan (1500 calls / 15 min).
 * We use a SAFE cap of 1400 / 15 min and refill continuously.
 *
 * acquire() resolves immediately if a token is available, otherwise sleeps
 * until enough time has elapsed to mint one. Many waiters serialize FIFO.
 */

const WINDOW_MS = 15 * 60 * 1000;
const SAFE_CAP = 1400;

export interface TokenBucketOptions {
  capacity?: number;
  refillPerMs?: number;
}

export class TokenBucket {
  private capacity: number;
  private refillPerMs: number;
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];

  constructor(opts: TokenBucketOptions = {}) {
    this.capacity = opts.capacity ?? SAFE_CAP;
    this.refillPerMs = opts.refillPerMs ?? SAFE_CAP / WINDOW_MS;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    this.refill();
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.queue.shift()!;
      resolve();
    }
    if (this.queue.length > 0) {
      const tokensNeeded = 1 - this.tokens;
      const waitMs = Math.max(10, Math.ceil(tokensNeeded / this.refillPerMs));
      setTimeout(() => this.drain(), waitMs);
    }
  }
}

/** Singleton shared by all TekionClient instances in this process. */
export const tekionLimiter = new TokenBucket();

/**
 * Exponential backoff with jitter. Returns ms to wait before retry N (0-indexed).
 * Base 1s, capped at 30s.
 */
export function backoffMs(attempt: number): number {
  const base = Math.min(30000, 1000 * 2 ** attempt);
  const jitter = Math.random() * base * 0.3;
  return Math.floor(base + jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
