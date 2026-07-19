import axios from "axios";
import { expect, test } from "bun:test";
import {
  createPoe2ScoutValuation,
  findPoe2ScoutItem,
  getPoe2ScoutLookupTerms,
  Poe2ScoutClient,
} from "../src/services/Poe2ScoutClient";
import { Poe2Item } from "../src/services/types";

test("looks up fixed-identity items but leaves rares to trade comparables", () => {
  const unique = {
    item: {
      frameType: 3,
      rarity: "Unique",
      name: "Darkness Enthroned",
      typeLine: "Darkness Enthroned",
      baseType: "Fine Belt",
    },
  } as Poe2Item;
  const rare = {
    item: {
      frameType: 2,
      rarity: "Rare",
      name: "Dread Ward",
      typeLine: "Vaal Regalia",
      baseType: "Vaal Regalia",
    },
  } as Poe2Item;

  expect(getPoe2ScoutLookupTerms(unique)).toEqual([
    "Darkness Enthroned",
    "Fine Belt",
  ]);
  expect(getPoe2ScoutLookupTerms(rare)).toEqual([]);
});

test("matches Poe2Scout items by exact name before base type", () => {
  const item = {
    item: {
      frameType: 3,
      rarity: "Unique",
      name: "Darkness Enthroned",
      baseType: "Fine Belt",
    },
  } as Poe2Item;
  const match = findPoe2ScoutItem(
    [
      {
        ItemId: 1,
        CategoryApiId: "accessory",
        Text: "Another Belt Fine Belt",
        Name: "Another Belt",
        Type: "Fine Belt",
        CurrentPrice: 2,
      },
      {
        ItemId: 4993,
        CategoryApiId: "accessory",
        Text: "Darkness Enthroned Fine Belt",
        Name: "Darkness Enthroned",
        Type: "Fine Belt",
        CurrentPrice: 1,
      },
    ],
    item,
  );

  expect(match?.ItemId).toBe(4993);
});

test("uses the newest valid Poe2Scout history entry", () => {
  const valuation = createPoe2ScoutValuation(
    {
      ItemId: 4993,
      CategoryApiId: "accessory",
      Text: "Darkness Enthroned Fine Belt",
      Name: "Darkness Enthroned",
      Type: "Fine Belt",
      CurrentPrice: 1,
    },
    {
      PriceHistory: [
        {
          Price: 12,
          Quantity: 8,
          Time: "2026-07-17T10:00:00Z",
        },
        {
          Price: 15,
          Quantity: 11,
          Time: "2026-07-18T10:00:00Z",
        },
        {
          Price: 0,
          Quantity: 99,
          Time: "2026-07-19T10:00:00Z",
        },
      ],
      HasMore: false,
    },
  );

  expect(valuation).toMatchObject({
    itemId: 4993,
    itemName: "Darkness Enthroned",
    price: { amount: 15, currency: "exalted" },
    quantity: 11,
    updatedAt: Date.parse("2026-07-18T10:00:00Z"),
  });
  expect(valuation?.history).toHaveLength(2);
});

test("falls back to the current Poe2Scout snapshot when history is empty", async () => {
  const originalGet = axios.get;
  const client = new Poe2ScoutClient();
  const item = {
    item: {
      frameType: 3,
      rarity: "Unique",
      name: "Darkness Enthroned",
      typeLine: "Darkness Enthroned",
      baseType: "Fine Belt",
    },
  } as Poe2Item;

  axios.get = (async (url: string) => {
    if (url.endsWith("/Items")) {
      return {
        data: [
          {
            ItemId: 4993,
            CategoryApiId: "accessory",
            Text: "Darkness Enthroned Fine Belt",
            Name: "Darkness Enthroned",
            Type: "Fine Belt",
            CurrentPrice: 18,
          },
        ],
      };
    }

    if (url.endsWith("/Leagues")) {
      return {
        data: [
          {
            Value: "Standard",
            BaseCurrencyApiId: "divine",
          },
        ],
      };
    }

    return { data: { PriceHistory: [], HasMore: false } };
  }) as typeof axios.get;

  try {
    const before = Date.now();
    const valuation = await client.getMarketValuation(item, "Standard");

    expect(valuation).toMatchObject({
      itemId: 4993,
      price: { amount: 18, currency: "divine" },
      quantity: 0,
      method: "current-snapshot",
      history: [],
    });
    expect(valuation?.updatedAt).toBeGreaterThanOrEqual(before);
  } finally {
    axios.get = originalGet;
  }
});
