import axios from "axios";
import { expect, test } from "bun:test";
import { ApiRequestQueue } from "../src/services/ApiRequestQueue";
import { Poe2TradeClient } from "../src/services/Poe2TradeClient";

test("trade client waits before opening Axios and keeps fetch separate from search", async () => {
  let now = 100_000;
  const client = new Poe2TradeClient(
    new ApiRequestQueue({
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    }),
  );
  const originalPost = axios.post;
  const originalGet = axios.get;
  const calls: { time: number; timeout?: number }[] = [];
  axios.post = (async (_url, _data, config) => {
    calls.push({ time: now, timeout: config?.timeout });
    return {
      data: { result: [] },
      headers: {
        "x-rate-limit-policy": "search",
        "x-rate-limit-rules": "ip",
        "x-rate-limit-ip": "10:60:60",
        "x-rate-limit-ip-state": "10:60:0",
      },
    };
  }) as typeof axios.post;
  axios.get = (async (_url, config) => {
    calls.push({ time: now, timeout: config?.timeout });
    return { data: { result: [] }, headers: {} };
  }) as typeof axios.get;
  try {
    await client.getAccountItems("fixture-account");
    await client.fetchItems(["fixture-item"]);
    await client.getAccountItems("fixture-account");
    expect(calls).toEqual([
      { time: 100_000, timeout: 30_000 },
      { time: 100_000, timeout: 30_000 },
      { time: 160_000, timeout: 30_000 },
    ]);
  } finally {
    axios.post = originalPost;
    axios.get = originalGet;
  }
});
