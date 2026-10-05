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
  let now = 100_000;
  const queue = new ApiRequestQueue({
    maxRetries: 2,
    minIntervalMs: 0,
    now: () => now,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
      now += milliseconds;
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

test("keeps the minimum interval between retry attempts", async () => {
  let currentTime = 10_000;
  const attemptStartedAt: number[] = [];
  const queue = new ApiRequestQueue({
    maxRetries: 1,
    minIntervalMs: 2_500,
    now: () => currentTime,
    sleep: async (milliseconds) => {
      currentTime += milliseconds;
    },
  });

  const result = await queue.run(async () => {
    attemptStartedAt.push(currentTime);
    if (attemptStartedAt.length === 1) {
      throw { response: { status: 429 } };
    }
    return "ok";
  });

  expect(result).toBe("ok");
  expect(attemptStartedAt).toEqual([10_000, 12_500]);
});

test("cancels a request before it enters the queue", async () => {
  const queue = new ApiRequestQueue({ minIntervalMs: 0 });
  const controller = new AbortController();
  controller.abort();

  await expect(
    queue.run(async () => "never", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

function apiResponse(used: number, limit = "10:5:60", policy = "search") {
  const window = limit.split(":")[1];
  return {
    headers: {
      "x-rate-limit-policy": policy,
      "x-rate-limit-rules": "ip",
      "x-rate-limit-ip": limit,
      "x-rate-limit-ip-state": `${used}:${window}:0`,
    },
  };
}

test("uses API spacing before starting network requests, including waits over 30 seconds", async () => {
  let now = 100_000;
  const starts: number[] = [];
  const queue = new ApiRequestQueue({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  await queue.run(async () => apiResponse(10, "10:60:60"), {
    rateLimitKey: "poe:search",
  });
  await queue.run(
    async () => {
      starts.push(now);
      return apiResponse(1, "10:60:60");
    },
    { rateLimitKey: "poe:search" },
  );
  expect(starts).toEqual([160_000]);
});

test("does not apply search limits to fetch or unrelated services", async () => {
  let now = 100_000;
  const queue = new ApiRequestQueue({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  await queue.run(async () => apiResponse(10, "10:60:60"), {
    rateLimitKey: "poe:search",
  });
  await queue.run(async () => apiResponse(1, "10:5:60", "fetch"), {
    rateLimitKey: "poe:fetch",
  });
  await queue.run(async () => "ninja", { rateLimitKey: "ninja:overview" });
  expect(now).toBe(100_000);
});

test("learns shared API policies across endpoint keys", async () => {
  let now = 100_000;
  const queue = new ApiRequestQueue({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  await queue.run(async () => apiResponse(1), { rateLimitKey: "poe:search" });
  await queue.run(async () => apiResponse(10), {
    rateLimitKey: "poe:exchange",
  });
  await queue.run(async () => "ok", { rateLimitKey: "poe:search" });
  expect(now).toBe(105_000);
});

test("manual requests take priority over pending background work", async () => {
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new ApiRequestQueue();
  const first = queue.run(async () => {
    events.push("active");
    await gate;
  });
  await Promise.resolve();
  const background = queue.run(async () => {
    events.push("background");
  });
  const manual = queue.run(
    async () => {
      events.push("manual");
    },
    { priority: "interactive" },
  );
  release();
  await Promise.all([first, background, manual]);
  expect(events).toEqual(["active", "manual", "background"]);
});

test("cancels queued work immediately while another request is running", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new ApiRequestQueue();
  const running = queue.run(() => gate);
  const controller = new AbortController();
  let called = false;
  const pending = queue.run(
    async () => {
      called = true;
    },
    { signal: controller.signal },
  );
  controller.abort();
  const result = await Promise.race([
    pending.then(
      () => "resolved",
      (error) => error.name,
    ),
    Bun.sleep(20).then(() => "still queued"),
  ]);
  release();
  await running;
  expect(result).toBe("AbortError");
  expect(called).toBe(false);
});

test("a terminal 429 still blocks later requests for the same policy", async () => {
  let now = 100_000;
  const queue = new ApiRequestQueue({
    maxRetries: 0,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  await queue
    .run(
      async () => {
        throw { response: { status: 429, headers: { "retry-after": "60" } } };
      },
      { rateLimitKey: "poe:search" },
    )
    .catch(() => {});
  await queue.run(async () => "ok", { rateLimitKey: "poe:search" });
  expect(now).toBe(160_000);
});

test("new interactive work wakes a scheduler waiting on another policy", async () => {
  const queue = new ApiRequestQueue();
  const controller = new AbortController();
  await queue.run(async () => apiResponse(10, "10:60:60"), {
    rateLimitKey: "poe:search",
  });
  let forwarded = false;
  const background = queue
    .run(
      async () => {
        forwarded = true;
      },
      {
        rateLimitKey: "poe:search",
        signal: controller.signal,
      },
    )
    .catch((error) => error.name);
  const manual = queue.run(async () => "manual", {
    priority: "interactive",
    rateLimitKey: "poe:fetch",
  });
  const result = await Promise.race([
    manual,
    Bun.sleep(100).then(() => "blocked"),
  ]);
  controller.abort();
  expect(await background).toBe("AbortError");
  expect(forwarded).toBe(false);
  expect(result).toBe("manual");
});

test("interactive priority cannot bypass its API cooldown", async () => {
  let now = 100_000;
  const queue = new ApiRequestQueue({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  await queue.run(async () => apiResponse(10, "10:60:60"), {
    rateLimitKey: "poe:search",
  });
  await queue.run(async () => "manual", {
    priority: "interactive",
    rateLimitKey: "poe:search",
  });
  expect(now).toBe(160_000);
});

test("Retry-After is not added a second time after the API state cooldown", async () => {
  let now = 100_000;
  const queue = new ApiRequestQueue({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  let attempts = 0;
  await queue.run(
    async () => {
      attempts++;
      if (attempts === 1)
        throw {
          response: {
            status: 429,
            headers: {
              ...apiResponse(10, "10:60:60").headers,
              "x-rate-limit-ip-state": "10:60:60",
              "retry-after": "60",
            },
          },
        };
      return apiResponse(1, "10:60:60");
    },
    { rateLimitKey: "poe:search" },
  );
  expect(attempts).toBe(2);
  expect(now).toBe(160_000);
});
