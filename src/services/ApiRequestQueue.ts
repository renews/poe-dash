import { RateLimitParser } from "./RateLimitParser";

export type ApiRequestStatus =
  | "queued"
  | "waiting"
  | "running"
  | "retrying"
  | "done"
  | "failed"
  | "cancelled";

export interface ApiRequestState {
  status: ApiRequestStatus;
  attempt: number;
  delayMs?: number;
}

export interface ApiRequestRunOptions {
  signal?: AbortSignal;
  onState?: (state: ApiRequestState) => void;
  priority?: "interactive" | "background";
  rateLimitKey?: string;
}

interface ApiRequestQueueOptions {
  maxRetries?: number;
  minIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

interface PendingRequest {
  request: () => Promise<unknown>;
  options: ApiRequestRunOptions;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
  attempt: number;
  readyAt: number;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ApiRequestQueue {
  private pending: PendingRequest[] = [];
  private draining = false;
  private wake?: () => void;
  private lastStartedAt = 0;
  private readonly maxRetries: number;
  private readonly minIntervalMs: number;
  private readonly sleep?: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly policies = new Map<string, string>();
  private readonly limits = new Map<string, RateLimitParser>();

  constructor(options: ApiRequestQueueOptions = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.sleep = options.sleep;
    this.now = options.now || Date.now;
  }

  run<T>(
    request: () => Promise<T>,
    options: ApiRequestRunOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(createAbortError());
    options.onState?.({ status: "queued", attempt: 0 });
    return new Promise<T>((resolve, reject) => {
      const entry: PendingRequest = {
        request,
        options,
        resolve: (value) => resolve(value as T),
        reject,
        attempt: 0,
        readyAt: 0,
        cleanup: () => options.signal?.removeEventListener("abort", onAbort),
      };
      const onAbort = () => {
        this.pending = this.pending.filter((candidate) => candidate !== entry);
        entry.cleanup();
        options.onState?.({ status: "cancelled", attempt: entry.attempt });
        reject(createAbortError());
        this.wake?.();
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.push(entry);
      this.wake?.();
      if (!this.draining) void this.drain();
    });
  }

  private limiter(key: string) {
    const policy = this.policies.get(key) || key;
    let limiter = this.limits.get(policy);
    if (!limiter) {
      limiter = new RateLimitParser({ now: this.now });
      this.limits.set(policy, limiter);
    }
    return limiter;
  }

  private observe(response: unknown, key?: string) {
    if (
      !key ||
      !response ||
      typeof response !== "object" ||
      !("headers" in response)
    )
      return;
    const headers = response.headers;
    if (!headers || typeof headers !== "object") return;
    const normalized = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name.toLowerCase(),
        String(value),
      ]),
    );
    const policy = normalized["x-rate-limit-policy"];
    if (policy) {
      // Namespace policies by service so unrelated APIs never share a cooldown.
      const policyKey = `${key.split(":")[0]}:policy:${policy}`;
      const previous = this.limiter(key);
      this.policies.set(key, policyKey);
      if (!this.limits.has(policyKey)) this.limits.set(policyKey, previous);
    }
    const limiter = this.limiter(key);
    limiter.parse(normalized);
    const retryAfter = normalized["retry-after"];
    if (retryAfter !== undefined && retryAfter.trim() !== "") {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0)
        limiter.blockFor(seconds * 1000);
    }
  }

  private delay(entry: PendingRequest) {
    return Math.max(
      0,
      entry.readyAt - this.now(),
      this.lastStartedAt + this.minIntervalMs - this.now(),
      entry.options.rateLimitKey
        ? this.limiter(entry.options.rateLimitKey).getWaitTime()
        : 0,
    );
  }

  private async drain() {
    this.draining = true;
    try {
      while (this.pending.length) {
        const eligible = this.pending.filter((entry) => this.delay(entry) <= 0);
        const entry =
          eligible.find((entry) => entry.options.priority === "interactive") ||
          eligible[0];
        if (!entry) {
          const delays = this.pending.map((entry) => {
            const delayMs = this.delay(entry);
            entry.options.onState?.({
              status: entry.readyAt > this.now() ? "retrying" : "waiting",
              attempt: entry.attempt,
              delayMs,
            });
            return delayMs;
          });
          await this.wait(Math.min(...delays));
          continue;
        }
        this.pending.splice(this.pending.indexOf(entry), 1);
        await this.execute(entry);
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(entry: PendingRequest) {
    const { options } = entry;
    this.lastStartedAt = this.now();
    entry.attempt += 1;
    options.onState?.({ status: "running", attempt: entry.attempt });
    try {
      const result = await entry.request();
      this.observe(result, options.rateLimitKey);
      if (!options.signal?.aborted) {
        options.onState?.({ status: "done", attempt: entry.attempt });
        entry.resolve(result);
      }
    } catch (error) {
      this.observe(getRequestErrorResponse(error), options.rateLimitKey);
      if (options.signal?.aborted) return;
      if (entry.attempt > this.maxRetries || !isRetryableRequestError(error)) {
        options.onState?.({ status: "failed", attempt: entry.attempt });
        entry.reject(error);
      } else {
        const delayMs = getRetryDelayMs(error, entry.attempt - 1);
        entry.readyAt = this.now() + delayMs;
        options.onState?.({
          status: "retrying",
          attempt: entry.attempt,
          delayMs,
        });
        this.pending.push(entry);
      }
    } finally {
      if (!this.pending.includes(entry)) entry.cleanup();
    }
  }

  private async wait(milliseconds: number) {
    // New interactive work or cancellation wakes the scheduler immediately.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await new Promise<void>((resolve, reject) => {
      this.wake = resolve;
      if (this.sleep) this.sleep(milliseconds).then(resolve, reject);
      else timer = globalThis.setTimeout(resolve, milliseconds);
    });
    if (timer !== undefined) globalThis.clearTimeout(timer);
    this.wake = undefined;
  }
}

function getRequestErrorResponse(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }

  const response = error.response;
  return response && typeof response === "object" ? response : undefined;
}

function isRetryableRequestError(error: unknown) {
  const response = getRequestErrorResponse(error);
  if (!response || !("status" in response)) {
    return true;
  }

  return (
    typeof response.status === "number" &&
    RETRYABLE_STATUSES.has(response.status)
  );
}

function getRetryDelayMs(error: unknown, attempt: number) {
  const response = getRequestErrorResponse(error);
  if (response && "headers" in response && response.headers) {
    const headers = response.headers;
    if (typeof headers === "object") {
      const retryAfter = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === "retry-after",
      )?.[1];
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
    }
  }

  return 500 * 2 ** attempt;
}

function createAbortError() {
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  return error;
}
