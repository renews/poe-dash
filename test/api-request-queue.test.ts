import { expect, test } from "bun:test";
import { ApiRequestQueue } from "../src/services/ApiRequestQueue";

test("serializes API requests", async () => {
  const queue = new ApiRequestQueue({ minIntervalMs: 0 });
  const events: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = queue.run(async () => {
    events.push("second:start");
    return 2;
  });

  await Promise.resolve();
  expect(events).toEqual(["first:start"]);
  releaseFirst?.();
  expect(await Promise.all([first, second])).toEqual([1, 2]);
  expect(events).toEqual(["first:start", "first:end", "second:start"]);
});

test("honors Retry-After when retrying a throttled request", async () => {
  const delays: number[] = [];
  const states: string[] = [];
  const queue = new ApiRequestQueue({
    maxRetries: 2,
    minIntervalMs: 0,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  let attempts = 0;

  const result = await queue.run(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw {
          response: {
            status: 429,
            headers: { "retry-after": "2" },
          },
        };
      }
      return "ok";
    },
    { onState: (state) => states.push(state.status) },
  );

  expect(result).toBe("ok");
  expect(attempts).toBe(2);
  expect(delays).toEqual([2000]);
  expect(states).toContain("retrying");
});

test("cancels a request before it enters the queue", async () => {
  const queue = new ApiRequestQueue({ minIntervalMs: 0 });
  const controller = new AbortController();
  controller.abort();

  await expect(
    queue.run(async () => "never", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
