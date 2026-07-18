import { wait } from "./utils";

interface RateLimitDetail {
  limit: number;
  window: number;
  reset: number;
  used?: number;
}

interface RateLimitRule {
  rule: string;
  limits: RateLimitDetail[];
  state: RateLimitDetail[];
  policy: string;
  ts: number;
}

type RateLimitHeaderValue = string | string[] | number | undefined;
type RateLimitHeaders = Record<string, RateLimitHeaderValue>;

interface RateLimitParserOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

/**
 * Parses a header value containing one or more segments of the form "value:window:reset"
 * into an array of RateLimitDetail objects.
 */
function parseRateLimitSegments(headerValue: string): RateLimitDetail[] {
  return headerValue.split(",").map((segment) => {
    const [limitStr, windowStr, resetStr] = segment.split(":");
    return {
      limit: Number(limitStr),
      window: Number(windowStr),
      reset: Number(resetStr),
    };
  });
}

/**
 * Parses the Axios response headers to return an array of rate limit rules.
 * It assumes headers are in the format:
 *  - x-rate-limit-[rule]: "value:window:reset[,value:window:reset,...]"
 *  - x-rate-limit-[rule]-state: "value:window:reset[,value:window:reset,...]"
 * Optionally, a header "x-rate-limit-rules" can provide a comma-separated list of rule names.
 */
export function parseRateLimitHeaders(
  headers: RateLimitHeaders,
): RateLimitRule[] {
  // Normalize header keys to lowercase for consistency.
  const lowerCaseHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(",") : String(value ?? ""),
    ]),
  );

  const policy = lowerCaseHeaders["x-rate-limit-policy"];

  // Determine the list of rules. If a rules header is provided, use it; otherwise, infer.
  let ruleNames: string[] = [];
  if (lowerCaseHeaders["x-rate-limit-rules"]) {
    ruleNames = lowerCaseHeaders["x-rate-limit-rules"]
      .split(",")
      .map((rule: string) => rule.trim().toLowerCase());
  } else {
    // Infer rule names from header keys matching x-rate-limit-[rule] (ignore -state and policy headers).
    ruleNames = Object.keys(lowerCaseHeaders)
      .filter(
        (key) =>
          key.startsWith("x-rate-limit-") &&
          !key.endsWith("-state") &&
          key !== "x-rate-limit-policy" &&
          key !== "x-rate-limit-rules",
      )
      .map((key) => key.replace("x-rate-limit-", ""));
  }

  // Build the list of rate limit rule objects.
  const rules: RateLimitRule[] = ruleNames.map((rule) => {
    const ruleHeaderKey = `x-rate-limit-${rule}`;
    const stateHeaderKey = `x-rate-limit-${rule}-state`;

    const ruleHeaderValue = lowerCaseHeaders[ruleHeaderKey];
    const stateHeaderValue = lowerCaseHeaders[stateHeaderKey];

    // Parse segments if header values are available.
    const limits = ruleHeaderValue
      ? parseRateLimitSegments(ruleHeaderValue)
      : [];
    const state = stateHeaderValue
      ? parseRateLimitSegments(stateHeaderValue)
      : [];

    for (let i = 0; i < limits.length; i++) {
      limits[i].used = state[i]?.limit;
      if (state[i]?.reset) {
        limits[i].reset = state[i].reset;
      }
    }

    const ts = Date.now();
    return { rule, limits, state, policy, ts };
  });

  return rules;
}

export class RateLimitParser {
  rules: RateLimitRule[] = [];
  private waitTail: Promise<void> = Promise.resolve();
  private blockedUntil = 0;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: RateLimitParserOptions = {}) {
    this.sleep =
      options.sleep ||
      ((milliseconds) => wait(milliseconds).then(() => undefined));
    this.now = options.now || Date.now;
  }

  parse(headers: RateLimitHeaders) {
    const parsed = parseRateLimitHeaders(headers);
    this.clearOldRules();

    for (const rule of parsed) {
      const existing = this.rules.find(
        (r) => r.rule === rule.rule && r.policy === rule.policy,
      );
      if (existing) {
        existing.limits = rule.limits;
        existing.state = rule.state;
        existing.ts = rule.ts;
      } else {
        this.rules.push(rule);
      }
    }

    return parsed;
  }

  clearOldRules() {
    const now = this.now();
    this.rules = this.rules
      .map((rule) => ({
        ...rule,
        limits: rule.limits.filter(
          (limit) => rule.ts + limit.window * 1000 > now,
        ),
      }))
      .filter((rule) => rule.limits.length > 0);
  }

  getWaitTimes() {
    const waitTimes = [];
    this.clearOldRules();

    const limits = this.rules.flatMap((r) => r.limits);
    for (const limit of limits) {
      const used = limit.used || 0;
      if (used >= limit.limit - 1) {
        waitTimes.push(Math.max(limit.reset, 1) * 1000);
      } else if (used > 0 && limit.limit > 0) {
        waitTimes.push((limit.window * 1000) / limit.limit);
      }
    }

    return waitTimes;
  }

  getWaitTime(minTime = 0) {
    return Math.max(
      ...this.getWaitTimes(),
      this.blockedUntil - this.now(),
      minTime,
    );
  }

  blockFor(milliseconds: number) {
    this.blockedUntil = Math.max(
      this.blockedUntil,
      this.now() + Math.max(0, milliseconds),
    );
  }

  waitForLimit(minTime = 0) {
    const scheduledWait = this.waitTail.then(async () => {
      const waitTime = this.getWaitTime(minTime);
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    });
    this.waitTail = scheduledWait.catch(() => undefined);
    return scheduledWait;
  }
}

export const RateLimits = new RateLimitParser();
