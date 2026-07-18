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
