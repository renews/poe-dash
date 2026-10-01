import { expect, test } from "bun:test";
import {
  parseRateLimitHeaders,
  RateLimitParser,
} from "../electron/app/services/RateLimitParser";

test("parses incomplete rate-limit state safely", () => {
  expect(() =>
    parseRateLimitHeaders({
      "x-rate-limit-rules": "ip",
      "x-rate-limit-policy": "trade",
      "x-rate-limit-ip": "10:60:0,20:300:0",
      "x-rate-limit-ip-state": "1:60:0",
    }),
  ).not.toThrow();

  const [rule] = parseRateLimitHeaders({
    "x-rate-limit-rules": "ip",
    "x-rate-limit-policy": "trade",
    "x-rate-limit-ip": "10:60:0,20:300:0",
    "x-rate-limit-ip-state": "1:60:0",
  });
  expect(rule.limits[0].used).toBe(1);
  expect(rule.limits[1].used).toBeUndefined();
});

test("serializes rate-limit waits so callers cannot burst together", async () => {
  const delays: number[] = [];
  const parser = new RateLimitParser({
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  await Promise.all([parser.waitForLimit(100), parser.waitForLimit(100)]);
  expect(delays).toEqual([100, 100]);
});

function rateLimitHeaders(state: string, limit = "3:5:60") {
  return {
    "x-rate-limit-policy": "trade-search",
    "x-rate-limit-rules": "ip",
    "x-rate-limit-ip": limit,
    "x-rate-limit-ip-state": state,
  };
}

test("waits for the request window instead of an inactive penalty", () => {
  const now = Date.now();
  const parser = new RateLimitParser({ now: () => now });
  const [rule] = parser.parse(rateLimitHeaders("2:5:0"));
  rule.ts = now;

  expect(parser.getWaitTime()).toBe(5_000);
});

test("credits time already spent waiting for the request window", () => {
  let now = Date.now();
  const parser = new RateLimitParser({ now: () => now });
  const [rule] = parser.parse(rateLimitHeaders("2:5:0"));
  rule.ts = now;
  now += 3_000;

  expect(parser.getWaitTime()).toBe(2_000);
  now += 2_000;
  expect(parser.getWaitTime()).toBe(0);
});

test("credits existing elapsed time toward ordinary request spacing", () => {
  let now = Date.now();
  const parser = new RateLimitParser({ now: () => now });
  const [rule] = parser.parse(rateLimitHeaders("1:60:0", "10:60:60"));
  rule.ts = now;
  now += 2_500;

  expect(parser.getWaitTime()).toBe(3_500);
  now += 3_500;
  expect(parser.getWaitTime()).toBe(0);
});

test("honors an active restriction beyond the request window even below the limit", () => {
  let now = Date.now();
  const parser = new RateLimitParser({ now: () => now });
  const [rule] = parser.parse(rateLimitHeaders("1:5:60"));
  rule.ts = now;
  now += 10_000;

  expect(parser.getWaitTime()).toBe(50_000);
  now += 50_000;
  expect(parser.getWaitTime()).toBe(0);
});

test("reserves request spacing for queued callers before a response arrives", async () => {
  let now = Date.now();
  const delays: number[] = [];
  const parser = new RateLimitParser({
    now: () => now,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
      now += milliseconds;
    },
  });
  const [rule] = parser.parse(rateLimitHeaders("1:60:0", "10:60:60"));
  rule.ts = now;
  now += 6_000;

  await Promise.all([parser.waitForLimit(), parser.waitForLimit()]);
  expect(delays).toEqual([6_000]);
});

test("keeps explicit blocking in force and uses the longest applicable wait", () => {
  let now = Date.now();
  const parser = new RateLimitParser({ now: () => now });
  const [rule] = parser.parse(
    rateLimitHeaders("2:5:0,1:60:0", "3:5:60,10:60:60"),
  );
  rule.ts = now;
  parser.blockFor(8_000);
  now += 2_000;

  expect(parser.getWaitTime()).toBe(6_000);
  now += 6_000;
  expect(parser.getWaitTime()).toBe(0);
});
