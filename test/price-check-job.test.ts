import { expect, test } from "bun:test";
import { getPriceCheckProgressLabel } from "../src/jobs/PriceCheckAllItems";
import { Job } from "../src/jobs/Job";
import { Poe2Item } from "../src/services/types";

const item = (overrides: Partial<Poe2Item["item"]> = {}) =>
  ({
    item: {
      name: "",
      typeLine: "Fiery Buckler",
      baseType: "Fiery Buckler",
      ...overrides,
    },
  }) as Poe2Item;

test("shows the current item while a tab price check is running", () => {
  expect(getPriceCheckProgressLabel(2, 4, item())).toBe(
    "Checking item 2 of 4: Fiery Buckler",
  );
  expect(
    getPriceCheckProgressLabel(
      1,
      1,
      item({ name: "Darkness Enthroned", typeLine: "Fine Belt" }),
    ),
  ).toBe("Checking item 1 of 1: Darkness Enthroned");
});

test("fails a job instead of leaving it running when its task throws", async () => {
  class FailingJob extends Job<number> {
    constructor() {
      super("failing-job", "Failing Job", "Testing failure handling");
    }

    async *_task() {
      yield* [] as number[];
      throw new Error("request failed");
    }
  }

  const job = new FailingJob();
  await expect(job.start()).rejects.toThrow("request failed");
  expect(job.status).toBe("failed");
  expect(job.error).toBe("request failed");
});

test("runs the cancellation handler immediately", () => {
  class CancellableJob extends Job<number> {
    async *_task() {
      yield* [] as number[];
    }
  }

  const job = new CancellableJob(
    "cancellable-job",
    "Cancellable Job",
    "Testing cancellation handling",
  );
  let cancelled = false;
  job.onCancel = async () => {
    cancelled = true;
  };

  job.cancel();

  expect(cancelled).toBe(true);
  expect(job.status).toBe("cancelled");
  expect(job.cancelling).toBe(true);
});
