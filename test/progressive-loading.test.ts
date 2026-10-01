import { expect, test } from "bun:test";
import { Poe2Trade } from "../src/services/poe2trade";
import { PriceChecker, type Estimate } from "../src/services/PriceEstimator";
import { checkCopiedItemPrice } from "../src/services/copiedItemPriceCheck";
import type { Poe2Item } from "../src/services/types";
import { PriceCheckAllItems } from "../src/jobs/PriceCheckAllItems";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceCheckPageView } from "../src/components/PriceCheckPage";

const listedItem = (id: string): Poe2Item =>
  ({
    id,
    listing: {
      account: { name: id },
      price: { amount: 10 + Number(id), currency: "exalted" },
      indexed: new Date().toISOString(),
    },
    item: { id, baseType: "Gold Ring", typeLine: "Gold Ring", frameType: 0 },
  }) as Poe2Item;

test("sync publishes cached items and each downloaded batch before the next request", async () => {
  const originalFetch = Poe2Trade.fetchItems;
  const originalRead = Poe2Trade.getCachedAccountItemDetails;
  const originalWrite = Poe2Trade.upsertAccountItemDetails;
  const snapshots: string[][] = [];
  const ids = Array.from({ length: 22 }, (_, i) => String(i));
  let calls = 0;
  Poe2Trade.getCachedAccountItemDetails = (_account, id) =>
    id === "0" ? listedItem(id) : undefined;
  Poe2Trade.upsertAccountItemDetails = () => {};
  Poe2Trade.fetchItems = async (ids) => {
    expect(snapshots.at(-1)?.length).toBe(1 + calls * 10);
    calls++;
    return { result: ids.slice(0, 10).map(listedItem) };
  };
  try {
    const result = await Poe2Trade.fetchAllItems(
      "account",
      ids,
      false,
      "Standard",
      {
        onItems: (items) => snapshots.push(items.map((item) => item.id)),
      },
    );
    expect(snapshots.map((items) => items.length)).toEqual([1, 11, 21, 22]);
    expect(result.map((item) => item.id)).toEqual(ids);
    expect(calls).toBe(3);
  } finally {
    Poe2Trade.fetchItems = originalFetch;
    Poe2Trade.getCachedAccountItemDetails = originalRead;
    Poe2Trade.upsertAccountItemDetails = originalWrite;
  }
});

test("a single item emits an uncached provisional price before fetching remaining comparables", async () => {
  const originalSearch = Poe2Trade.getItemByAttributes;
  const originalFetch = Poe2Trade.fetchItems;
  const originalUpscale = PriceChecker.upscalePrice;
  const originalCache = PriceChecker.cachePriceEstimate;
  const ids = Array.from({ length: 20 }, (_, i) => String(i));
  const previews: Estimate[] = [];
  let calls = 0;
  let cacheWrites = 0;
  Poe2Trade.getItemByAttributes = async () => ({
    id: "search",
    total: 20,
    result: ids,
  });
  Poe2Trade.fetchItems = async (requested) => {
    if (calls === 1) {
      expect(previews).toHaveLength(1);
      expect(previews[0].sourceComparableCount).toBe(10);
      expect(previews[0].provisional).toBe(true);
      expect(cacheWrites).toBe(0);
    }
    calls++;
    return { result: requested.map(listedItem) };
  };
  PriceChecker.upscalePrice = async (price) => price;
  PriceChecker.cachePriceEstimate = () => {
    cacheWrites++;
  };
  try {
    const result = await PriceChecker.estimateItemPrice(
      listedItem("target"),
      "Standard",
      undefined,
      12,
      {
        applyListingContext: false,
        onEstimate: (estimate) => previews.push(estimate),
      },
    );
    expect(previews.map((estimate) => estimate.sourceComparableCount)).toEqual([
      10, 20,
    ]);
    expect(previews[0].sourceComparableCount).toBe(10);
    expect(result.provisional).not.toBe(true);
    expect(result.sourceComparableCount).toBe(20);
    expect(calls).toBe(2);
    expect(cacheWrites).toBe(1);
  } finally {
    Poe2Trade.getItemByAttributes = originalSearch;
    Poe2Trade.fetchItems = originalFetch;
    PriceChecker.upscalePrice = originalUpscale;
    PriceChecker.cachePriceEstimate = originalCache;
  }
});

test("copied item pricing forwards previews and ignores previews after cancellation", async () => {
  const controller = new AbortController();
  const previews: Estimate[] = [];
  const preview = { provisional: true } as Estimate;
  await checkCopiedItemPrice({
    itemText:
      "Item Class: Rings\nRarity: Normal\nGold Ring\n--------\nItem Level: 70",
    league: "Standard",
    modifierRangePercent: 12,
    signal: controller.signal,
    onEstimate: (estimate) => previews.push(estimate),
    estimateItemPrice: async (_item, _league, _selection, _range, options) => {
      options?.onEstimate?.(preview);
      controller.abort();
      options?.onEstimate?.(preview);
      return {} as Estimate;
    },
  });
  expect(previews).toEqual([preview]);
});

test("sync retains earlier snapshots but does not publish a batch after cancellation", async () => {
  const originalFetch = Poe2Trade.fetchItems;
  const originalRead = Poe2Trade.getCachedAccountItemDetails;
  const originalWrite = Poe2Trade.upsertAccountItemDetails;
  const controller = new AbortController();
  const snapshots: Poe2Item[][] = [];
  let calls = 0;
  Poe2Trade.getCachedAccountItemDetails = () => undefined;
  Poe2Trade.upsertAccountItemDetails = () => {};
  Poe2Trade.fetchItems = async (ids) => {
    if (++calls === 2) controller.abort();
    return { result: ids.slice(0, 10).map(listedItem) };
  };
  try {
    await Poe2Trade.fetchAllItems(
      "account",
      Array.from({ length: 20 }, (_, i) => String(i)),
      false,
      "Standard",
      {
        signal: controller.signal,
        onItems: (items) => snapshots.push(items),
      },
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(10);
  } finally {
    Poe2Trade.fetchItems = originalFetch;
    Poe2Trade.getCachedAccountItemDetails = originalRead;
    Poe2Trade.upsertAccountItemDetails = originalWrite;
  }
});

test("bulk checking forwards early prices before an item's final outcome", async () => {
  const originalEstimate = PriceChecker.estimateItemPrice;
  const originalRead = PriceChecker.getCachedEstimates;
  const preview = { provisional: true } as Estimate;
  const final = { provisional: false } as Estimate;
  const events: string[] = [];
  PriceChecker.getCachedEstimates = () => ({});
  PriceChecker.estimateItemPrice = async (
    _item,
    _league,
    _selection,
    _range,
    options,
  ) => {
    options?.onEstimate?.(preview);
    expect(events).toEqual(["preview"]);
    return final;
  };
  try {
    const job = new PriceCheckAllItems([listedItem("1")]);
    job.onEstimate = (item, estimate) => {
      expect(item.id).toBe("1");
      expect(estimate).toBe(preview);
      events.push("preview");
    };
    job.onStep = async ({ data }) => {
      expect(data.estimate).toBe(final);
      events.push("final");
    };
    await job.start();
    expect(events).toEqual(["preview", "final"]);
  } finally {
    PriceChecker.estimateItemPrice = originalEstimate;
    PriceChecker.getCachedEstimates = originalRead;
  }
});

test("the price check screen shows early evidence without claiming the check is complete", () => {
  const markup = renderToStaticMarkup(
    createElement(PriceCheckPageView, {
      itemText: "copied item",
      item: listedItem("1"),
      selectedLeague: "Standard",
      status: "checking",
      shortcutStatus: { registered: false, shortcut: "Ctrl+D" },
      estimate: {
        provisional: true,
        source: "official-trade",
        sourceComparableCount: 10,
        price: { amount: 15, currency: "exalted" },
        stdDev: { amount: 1, currency: "exalted" },
        comparables: [],
        search: { explicitCount: 0 },
      },
      onItemTextChange: () => {},
      onSubmit: () => {},
    }),
  );
  expect(markup).toContain("Provisional price");
  expect(markup).toContain("based on 10 listings");
  expect(markup).toContain("Updating as more arrive");
  expect(markup).not.toContain("Price check complete");
});

test("a provisional price still requires the configured independent seller evidence", async () => {
  const originalSearch = Poe2Trade.getItemByAttributes;
  const originalFetch = Poe2Trade.fetchItems;
  const originalUpscale = PriceChecker.upscalePrice;
  const ids = Array.from({ length: 20 }, (_, i) => String(i));
  const previews: Estimate[] = [];
  let calls = 0;
  Poe2Trade.getItemByAttributes = async () => ({
    id: "search",
    total: 20,
    result: ids,
  });
  Poe2Trade.fetchItems = async (requested) => {
    expect(previews).toHaveLength(0);
    const result = requested.map(listedItem);
    if (calls++ === 0) {
      result.forEach((item) => {
        item.listing.account.name = "same-seller";
      });
    }
    return { result };
  };
  PriceChecker.upscalePrice = async (price) => price;
  try {
    await PriceChecker.estimateItemPrice(
      listedItem("target"),
      "Standard",
      undefined,
      12,
      {
        applyListingContext: false,
        recordResult: false,
        minimumIndependentSellers: 7,
        onEstimate: (estimate) => previews.push(estimate),
      },
    );
    expect(previews).toHaveLength(1);
    expect(previews[0].sourceComparableCount).toBe(20);
  } finally {
    Poe2Trade.getItemByAttributes = originalSearch;
    Poe2Trade.fetchItems = originalFetch;
    PriceChecker.upscalePrice = originalUpscale;
  }
});
