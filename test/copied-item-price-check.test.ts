import { expect, test } from "bun:test";
import { PriceChecker, type Estimate } from "../src/services/PriceEstimator";
import { checkCopiedItemPrice } from "../src/services/copiedItemPriceCheck";
import { parseCopiedItemText } from "../src/services/copiedItemParser";

const RING = `Item Class: Rings
Rarity: Rare
Miracle Grip
Amethyst Ring
--------
Item Level: 74
--------
+8% to Chaos Resistance (implicit)
--------
+90 to maximum Life`;

test("checks pasted and hotkey item text through the same pricing boundary", async () => {
  let received:
    | {
        league: string;
        range: number;
        origin: string | undefined;
        itemLeague: string | undefined;
        implicit: boolean[] | undefined;
        explicit: boolean[] | undefined;
        applyListingContext: boolean | undefined;
        recordResult: boolean | undefined;
        minimumIndependentSellers: number | undefined;
        maxTradeListings: number | undefined;
      }
    | undefined;
  const estimate = {
    price: { amount: 11, currency: "exalted" },
    stdDev: { amount: 1, currency: "exalted" },
    comparables: [],
    search: { explicitCount: 1 },
  } as Estimate;

  const result = await checkCopiedItemPrice({
    itemText: RING,
    league: "Runes of Aldur",
    modifierRangePercent: 15,
    estimateItemPrice: async (item, league, selection, range, options) => {
      received = {
        league,
        range,
        origin: item.origin,
        itemLeague: item.item.league,
        implicit: selection.implicit,
        explicit: selection.explicit,
        applyListingContext: options?.applyListingContext,
        recordResult: options?.recordResult,
        minimumIndependentSellers: options?.minimumIndependentSellers,
        maxTradeListings: options?.maxTradeListings,
      };
      return estimate;
    },
  });

  expect(received).toEqual({
    league: "Runes of Aldur",
    range: 15,
    origin: "clipboard",
    itemLeague: "Runes of Aldur",
    implicit: [true],
    explicit: [true],
    applyListingContext: false,
    recordResult: false,
    minimumIndependentSellers: 1,
    maxTradeListings: 100,
  });
  expect(result).toMatchObject({
    item: { item: { name: "Miracle Grip" } },
    selection: { implicit: [true], explicit: [true] },
    estimate,
  });
});

test("resolves copied modifiers against their implicit or explicit trade section", () => {
  const parsed = PriceChecker.parseItemMods(parseCopiedItemText(RING));

  expect(parsed.implicits[0]?.hash).toBe("implicit.stat_2923486259");
  expect(parsed.explicits[0]?.hash).toBe("explicit.stat_3299347043");
});

test("deselects copied modifiers that cannot be matched to trade data", async () => {
  let explicitSelection: boolean[] | undefined;
  const itemText = `${RING}\n82% increased effect of Socketed [Augment] Items`;

  await checkCopiedItemPrice({
    itemText,
    league: "Runes of Aldur",
    modifierRangePercent: 12,
    estimateItemPrice: async (_item, _league, selection) => {
      explicitSelection = selection.explicit;
      return {
        price: { amount: 11, currency: "exalted" },
        stdDev: { amount: 1, currency: "exalted" },
        comparables: [],
        search: { explicitCount: 1 },
      } as Estimate;
    },
  });

  expect(explicitSelection).toEqual([true, false]);
});

test("keeps copied rune selections aligned and deselects unresolved enchants", async () => {
  let enchantSelection: boolean[] | undefined;
  const itemText = `Item Class: Helmets
Rarity: Rare
Corpse Horn
Trapper Hood
--------
Item Level: 81
--------
82% increased effect of Socketed [Augment] Items (rune)
8% increased Reservation Efficiency of Minion Skills (rune)
--------
+90 to maximum Life`;

  await checkCopiedItemPrice({
    itemText,
    league: "Runes of Aldur",
    modifierRangePercent: 12,
    estimateItemPrice: async (_item, _league, selection) => {
      enchantSelection = (
        selection as typeof selection & { enchant?: boolean[] }
      ).enchant;
      return {
        price: { amount: 11, currency: "exalted" },
        stdDev: { amount: 1, currency: "exalted" },
        comparables: [],
        search: { explicitCount: 1 },
      } as Estimate;
    },
  });

  expect(enchantSelection).toEqual([false, true]);
});
