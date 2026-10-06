import { expect, test } from "bun:test";
import { Cache, CacheService } from "../src/services/Cache";
import {
  PriceChecker,
  isEstimateFresh,
  type Estimate,
} from "../src/services/PriceEstimator";

function withStorage(run: (storage: Storage) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    run(storage);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function estimate(league = "Standard"): Estimate {
  return {
    checkedAt: Date.now() - 2 * 86400000,
    price: { amount: 12, currency: "exalted" },
    stdDev: { amount: 1, currency: "exalted" },
    comparables: [],
    search: { league, explicitCount: 0 },
  };
}

test("restores legacy saved suggestions even when their old one-day expiry has elapsed", () =>
  withStorage((storage) => {
    const saved = estimate();
    Cache.setJson("price_estimates", { item: saved }, -1);
    expect(PriceChecker.getCachedEstimates("Standard")).toEqual({
      item: saved,
    });
    expect(storage.getItem("price_estimates_expiry")).toBeNull();
    expect(isEstimateFresh(saved, 5)).toBe(false);
  }));

test("new suggestions survive later sessions without changing their check time", () =>
  withStorage((storage) => {
    const saved = estimate();
    PriceChecker.cachePriceEstimate("item", saved);
    const reopened = new CacheService(
      storage,
      () => Date.now() + 365 * 86400000,
    );
    expect(reopened.getJson("price_estimates")).toEqual({ item: saved });
    expect(storage.getItem("price_estimates_expiry")).toBeNull();
  }));

test("updating or removing one result preserves older results and league separation", () =>
  withStorage((storage) => {
    const standard = estimate();
    const hardcore = estimate("Hardcore");
    Cache.setJson("price_estimates", { standard, hardcore }, -1);
    PriceChecker.cachePriceEstimate("new", standard);
    PriceChecker.removeCachedEstimate("new");
    expect(PriceChecker.getCachedEstimates("Standard")).toEqual({ standard });
    expect(PriceChecker.getCachedEstimates("Hardcore")).toEqual({ hardcore });
    expect(storage.getItem("price_estimates_expiry")).toBeNull();
  }));
