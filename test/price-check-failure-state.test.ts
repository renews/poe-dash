import { expect, test } from "bun:test";
import {
  clearPriceCheckFailure,
  getPriceCheckErrorMessages,
  loadPriceCheckFailures,
  persistPriceCheckFailures,
  recordPriceCheckFailure,
} from "../src/services/priceCheckFailureState";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("restores price-check failures only for the active account and league", () => {
  const storage = new MemoryStorage();
  const standardFailures = recordPriceCheckFailure(
    {},
    "standard-item",
    "No comparable listings found.",
    1_000,
  );
  const hardcoreFailures = recordPriceCheckFailure(
    {},
    "hardcore-item",
    "Trade API unavailable.",
    2_000,
  );

  persistPriceCheckFailures("account:Standard", standardFailures, storage);
  persistPriceCheckFailures(
    "account:HC Runes of Aldur",
    hardcoreFailures,
    storage,
  );

  expect(loadPriceCheckFailures("account:Standard", storage)).toEqual(
    standardFailures,
  );
  expect(loadPriceCheckFailures("account:HC Runes of Aldur", storage)).toEqual(
    hardcoreFailures,
  );
});

test("clears a persisted failure after a successful retry", () => {
  const failures = recordPriceCheckFailure(
    {},
    "item-1",
    "No comparable listings found.",
    1_000,
  );

  expect(clearPriceCheckFailure(failures, "item-1")).toEqual({});
  expect(failures).toEqual({
    "item-1": {
      message: "No comparable listings found.",
      failedAt: 1_000,
    },
  });
});

test("exposes persisted failure messages to the existing sales UI", () => {
  expect(
    getPriceCheckErrorMessages({
      failed: { message: "Trade API unavailable.", failedAt: 1_000 },
    }),
  ).toEqual({ failed: "Trade API unavailable." });
});
