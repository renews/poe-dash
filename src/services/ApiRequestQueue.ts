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
}

interface ApiRequestQueueOptions {
  maxRetries?: number;
  minIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ApiRequestQueue {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;
  private readonly maxRetries: number;
  private readonly minIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: ApiRequestQueueOptions = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.sleep =
      options.sleep ||
      ((milliseconds) =>
        new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
    this.now = options.now || Date.now;
  }

  run<T>(
    request: () => Promise<T>,
    options: ApiRequestRunOptions = {},
  ): Promise<T> {
    options.onState?.({ status: "queued", attempt: 0 });
    const execute = () => this.execute(request, options);
    const result = this.tail.then(execute, execute);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async execute<T>(
    request: () => Promise<T>,
    options: ApiRequestRunOptions,
  ) {
    try {
      this.throwIfAborted(options.signal);
      const intervalDelay = Math.max(
        0,
        this.lastStartedAt + this.minIntervalMs - this.now(),
      );
      if (intervalDelay > 0) {
        options.onState?.({
          status: "waiting",
          attempt: 0,
          delayMs: intervalDelay,
        });
        await this.wait(intervalDelay, options.signal);
      }

      for (let attempt = 0; ; attempt += 1) {
        this.throwIfAborted(options.signal);
        this.lastStartedAt = this.now();
        options.onState?.({ status: "running", attempt: attempt + 1 });

        try {
          const result = await request();
          options.onState?.({ status: "done", attempt: attempt + 1 });
          return result;
        } catch (error) {
          if (options.signal?.aborted) {
            throw createAbortError();
          }

          if (attempt >= this.maxRetries || !isRetryableRequestError(error)) {
            options.onState?.({ status: "failed", attempt: attempt + 1 });
            throw error;
          }

          const delayMs = getRetryDelayMs(error, attempt);
          options.onState?.({
            status: "retrying",
            attempt: attempt + 1,
            delayMs,
          });
          await this.wait(delayMs, options.signal);
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        options.onState?.({ status: "cancelled", attempt: 0 });
      }
      throw error;
    }
  }

  private async wait(milliseconds: number, signal?: AbortSignal) {
    this.throwIfAborted(signal);
    if (milliseconds <= 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(createAbortError());
      signal?.addEventListener("abort", onAbort, { once: true });
      this.sleep(milliseconds).then(resolve, reject).finally(() => {
        signal?.removeEventListener("abort", onAbort);
      });
    });
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
      throw createAbortError();
    }
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
