import { expect, test } from "bun:test";
import {
  getComparablePriceCurrency,
  getItemSearchFilters,
  getItemSearchMetadata,
  getExchangeRateCacheKey,
  isEstimateFresh,
  Estimate,
  PriceChecker,
  roundCurrencyAmount,
  selectSelectedModifiers,
} from "../src/services/PriceEstimator";
import {
  getCurrencyRateFromOverview,
  parseMirrorRateFromPage,
} from "../src/services/Poe2TradeClient";
import { Poe2Item } from "../src/services/types";
import { formatPriceAmount } from "../src/services/types";
import { Poe2Trade } from "../src/services/poe2trade";

test("reports when no comparable listings are available", () => {
  expect(() => PriceChecker.priceEstimate([])).toThrow(
    "No comparable listings found",
  );
});

test("handles items without extended explicit modifier metadata", async () => {
  const item = {
    item: { extended: { mods: {} } },
  } as Poe2Item;

  await expect(PriceChecker.getHighTierMods(item, 3)).resolves.toEqual([]);
});

test("skips modifiers that are not in the local stat table", () => {
  const item = {
    item: {
      explicitMods: ["82% increased effect of Socketed [Augment] Items"],
    },
  } as Poe2Item;

  expect(PriceChecker.parseItemMods(item).explicits).toEqual([]);
});

test("keeps structured unknown modifiers for trade matching", () => {
  const item = {
    item: {
      explicitMods: [
        {
          description: "82% increased effect of Socketed [Augment] Items",
          hash: "stat.explicit.stat_2081918629",
          mods: [],
        },
      ],
    },
  } as Poe2Item;

  expect(PriceChecker.parseItemMods(item).explicits).toMatchObject([
    { hash: "explicit.stat_2081918629", value1: 82 },
  ]);
});

test("searches unique items by name and unique rarity", () => {
  const item = {
    item: {
      frameType: 3,
      name: "Darkness Enthroned",
      baseType: "Fine Belt",
    },
  } as Poe2Item;

  expect(getItemSearchMetadata(item)).toEqual({
    baseType: "Fine Belt",
    name: "Darkness Enthroned",
    rarity: "unique",
  });
});

test("includes gem level and quality in gem search metadata", () => {
  const item = {
    item: {
      name: "Healing Runes",
      typeLine: "Healing Runes",
      baseType: "Healing Runes",
      frameType: 4,
      gemLevel: 15,
      quality: 20,
    },
  } as Poe2Item;

  expect(getItemSearchMetadata(item)).toMatchObject({
    baseType: "Healing Runes",
    name: "Healing Runes",
    rarity: undefined,
    gemLevel: 15,
    quality: 20,
  });
});

test("includes item level for non-gems but not gems", () => {
  const rare = {
    item: {
      frameType: 2,
      rarity: "Rare",
      baseType: "Vaal Regalia",
      ilvl: 84,
    },
  } as Poe2Item;
  const gem = {
    item: {
      frameType: 4,
      name: "Healing Runes",
      baseType: "Healing Runes",
      gemLevel: 15,
      quality: 20,
      ilvl: 84,
    },
  } as Poe2Item;

  const rareMetadata = getItemSearchMetadata(rare);
  const gemMetadata = getItemSearchMetadata(gem);

  expect(getItemSearchFilters(rareMetadata)).not.toHaveProperty("ilvl");
  expect(getItemSearchFilters(rareMetadata, true)).toMatchObject({ ilvl: 84 });
  expect(getItemSearchFilters(rareMetadata, false)).not.toHaveProperty("ilvl");
  expect(getItemSearchFilters(gemMetadata)).not.toHaveProperty("ilvl");
  expect(getItemSearchFilters(gemMetadata)).toMatchObject({
    gem_level: 15,
    gem_level_max: 15,
    quality: 20,
    quality_max: 20,
  });
});

test("keeps fractional prices visible", () => {
  expect(formatPriceAmount(0.109)).toBe("0.109");
});

test("separates cached exchange rates by league", () => {
  expect(getExchangeRateCacheKey("exalted", "chaos", "Standard")).not.toBe(
    getExchangeRateCacheKey("exalted", "chaos", "HC Runes of Aldur"),
  );
});

test("keeps one-currency comparisons in their listed currency", () => {
  expect(getComparablePriceCurrency("exalted", ["divine"])).toBe("divine");
  expect(getComparablePriceCurrency("exalted", ["chaos", "divine"])).toBe(
    "exalted",
  );
});

test("converts currency in the requested direction", () => {
  const overview = {
    core: {
      primary: "divine",
      rates: { chaos: 5.56, exalted: 316.2 },
    },
    lines: [
      { id: "divine", primaryValue: 1 },
      { id: "chaos", primaryValue: 0.1798 },
      { id: "exalted", primaryValue: 0.003162 },
    ],
  };

  expect(getCurrencyRateFromOverview(overview, "chaos", "divine")).toBeCloseTo(
    5.56,
    2,
  );
  expect(getCurrencyRateFromOverview(overview, "divine", "chaos")).toBeCloseTo(
    0.1798,
    3,
  );
});

test("refreshes currency rates from the live overview", async () => {
  const originalGetOverview = Poe2Trade.client.getCurrencyExchangeOverview;
  const originalCacheExchangeRates = PriceChecker.cacheExchangeRates;
  const cachedRates: Record<string, number> = {};
  let overviewRequests = 0;

  Poe2Trade.client.getCurrencyExchangeOverview = async () => {
    overviewRequests++;
    return {
      core: { primary: "divine" },
      lines: [
        { id: "divine", primaryValue: 1 },
        { id: "chaos", primaryValue: 0.2 },
        { id: "exalted", primaryValue: 0.004 },
        { id: "mirror", primaryValue: 100 },
      ],
    };
  };
  PriceChecker.cacheExchangeRates = async (iWant, iHave, rate) => {
    cachedRates[`${iWant}:${iHave}`] = rate;
  };

  try {
    await PriceChecker.refreshExchangeRates("HC Runes of Aldur");

    expect(overviewRequests).toBe(1);
    expect(cachedRates["exalted:chaos"]).toBe(50);
    expect(cachedRates["chaos:divine"]).toBe(5);
    expect(cachedRates["divine:mirror"]).toBe(100);
  } finally {
    Poe2Trade.client.getCurrencyExchangeOverview = originalGetOverview;
    PriceChecker.cacheExchangeRates = originalCacheExchangeRates;
  }
});

test("parses the live Mirror rate from the currency page", () => {
  expect(
    parseMirrorRateFromPage(
      '<span>5,187.6</span> <span class="unit">Divine</span>',
    ),
  ).toBe(5187.6);
  expect(parseMirrorRateFromPage("<html>No rate</html>")).toBeUndefined();
});

test("excludes deselected modifiers while keeping all selected by default", () => {
  const modifiers = ["implicit", "explicit", "another explicit"];

  expect(selectSelectedModifiers(modifiers)).toEqual(modifiers);
  expect(selectSelectedModifiers(modifiers, [true, false, true])).toEqual([
    "implicit",
    "another explicit",
  ]);
});

test("rounds promoted currency at the half-unit boundary", () => {
  expect(roundCurrencyAmount(2.49)).toBe(2);
  expect(roundCurrencyAmount(2.5)).toBe(3);
  expect(roundCurrencyAmount(2.51)).toBe(3);
});

test("promotes suggested prices while retaining the lower denomination", async () => {
  const originalExchangeRate = PriceChecker.exchangeRate;
  PriceChecker.exchangeRate = async (iWant, iHave) => {
    if (iWant === "exalted" && iHave === "chaos") return 75;
    if (iWant === "chaos" && iHave === "divine") return 6;
    if (iWant === "divine" && iHave === "mirror") return 12;
    return 1;
  };

  try {
    await expect(
      PriceChecker.upscalePrice({ amount: 144, currency: "exalted" }),
    ).resolves.toMatchObject({
      amount: 2,
      currency: "chaos",
      lowerPrice: { amount: 144, currency: "exalted" },
    });
    await expect(
      PriceChecker.upscalePrice({ amount: 190, currency: "exalted" }),
    ).resolves.toMatchObject({ amount: 3, currency: "chaos" });
    await expect(
      PriceChecker.upscalePrice({ amount: 3, currency: "chaos" }),
    ).resolves.toMatchObject({
      amount: 1,
      currency: "divine",
      lowerPrice: { amount: 3, currency: "chaos" },
    });
    await expect(
      PriceChecker.upscalePrice({ amount: 6, currency: "divine" }),
    ).resolves.toMatchObject({
      amount: 1,
      currency: "mirror",
      lowerPrice: { amount: 6, currency: "divine" },
    });
  } finally {
    PriceChecker.exchangeRate = originalExchangeRate;
  }
});

test("keeps a converted chaos price when the higher-tier rate is unavailable", async () => {
  const originalExchangeRate = PriceChecker.exchangeRate;
  PriceChecker.exchangeRate = async (iWant, iHave) => {
    if (iWant === "exalted" && iHave === "chaos") return 57;
    throw new Error("higher-tier rate unavailable");
  };

  try {
    await expect(
      PriceChecker.upscalePrice({ amount: 142, currency: "exalted" }),
    ).resolves.toMatchObject({
      amount: 2,
      currency: "chaos",
      lowerPrice: { amount: 142, currency: "exalted" },
    });
  } finally {
    PriceChecker.exchangeRate = originalExchangeRate;
  }
});

test("only reuses a cached estimate during the configured cooldown", () => {
  const checkedAt = 1_000_000;

  expect(
    isEstimateFresh({ checkedAt } as Estimate, 5, checkedAt + 4 * 60_000),
  ).toBe(true);
  expect(
    isEstimateFresh({ checkedAt } as Estimate, 5, checkedAt + 5 * 60_000),
  ).toBe(false);
  expect(isEstimateFresh({ checkedAt } as Estimate, 0, checkedAt)).toBe(false);
  expect(isEstimateFresh({} as Estimate, 5, checkedAt)).toBe(false);
});

test("matches a rounded suggested price across currencies", async () => {
  const originalExchangeRate = PriceChecker.exchangeRate;
  PriceChecker.exchangeRate = async (iWant, iHave) => {
    if (iWant === "chaos" && iHave === "exalted") return 1 / 75;
    return 1;
  };

  try {
    await expect(
      PriceChecker.matchesCurrentPrice(
        {
          listing: { price: { amount: 150, currency: "exalted" } },
        } as Poe2Item,
        { amount: 2, currency: "chaos" },
      ),
    ).resolves.toBe(true);
  } finally {
    PriceChecker.exchangeRate = originalExchangeRate;
  }
});

test("detects when a modifier selection no longer matches its estimate", () => {
  const item = {
    item: {
      explicitMods: [
        {
          description: "82% increased effect of Socketed [Augment] Items",
          hash: "explicit.stat_123",
          mods: [],
        },
      ],
      implicitMods: [],
    },
  } as Poe2Item;
  const estimate = {
    search: { explicitHashes: ["explicit.stat_123"], implicitHashes: [] },
  } as Estimate;

  expect(
    PriceChecker.matchesModifierSelection(item, estimate, {
      explicit: [true],
      implicit: [],
    }),
  ).toBe(true);
  expect(
    PriceChecker.matchesModifierSelection(item, estimate, {
      explicit: [false],
      implicit: [],
    }),
  ).toBe(false);
});

test("matches cached estimates with the selected item-level filter", () => {
  const item = {
    item: {
      ilvl: 84,
      explicitMods: [],
      implicitMods: [],
    },
  } as Poe2Item;
  const estimate = {
    search: {
      explicitHashes: [],
      implicitHashes: [],
      itemLevel: 84,
    },
  } as Estimate;

  expect(
    PriceChecker.matchesModifierSelection(item, estimate, {
      explicit: [],
      implicit: [],
      itemLevel: true,
    }),
  ).toBe(true);
  expect(
    PriceChecker.matchesModifierSelection(item, estimate, {
      explicit: [],
      implicit: [],
      itemLevel: false,
    }),
  ).toBe(false);

  expect(
    PriceChecker.matchesModifierSelection(
      item,
      {
        search: { explicitHashes: [], implicitHashes: [] },
      } as Estimate,
      { explicit: [], implicit: [] },
    ),
  ).toBe(true);
});

test("normalizes comparables with mixed listed currencies", async () => {
  const originalFetchItems = Poe2Trade.fetchItems;
  const originalFetchRates = PriceChecker.fetchManyExchangeRates;
  const originalToEquivalentPrices = PriceChecker.toEquivalentPrices;
  let requestedCurrency = "";

  Poe2Trade.fetchItems = async () =>
    ({
      result: [
        {
          id: "chaos-item",
          listing: { price: { amount: 10, currency: "chaos" } },
        },
        {
          id: "divine-item",
          listing: { price: { amount: 1, currency: "divine" } },
        },
      ],
    }) as { result: Poe2Item[] };
  PriceChecker.fetchManyExchangeRates = async (iWant) => {
    requestedCurrency = iWant;
  };
  PriceChecker.toEquivalentPrices = (iWant, prices) =>
    prices.map((price) => ({ amount: price.amount, currency: iWant }));

  try {
    const prices = await PriceChecker.getPricesForItemIds(
      ["chaos-item", "divine-item"],
      "exalted",
    );

    expect(requestedCurrency).toBe("exalted");
    expect(prices.map((price) => price.currency)).toEqual([
      "exalted",
      "exalted",
    ]);
  } finally {
    Poe2Trade.fetchItems = originalFetchItems;
    PriceChecker.fetchManyExchangeRates = originalFetchRates;
    PriceChecker.toEquivalentPrices = originalToEquivalentPrices;
  }
});
