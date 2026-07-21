import axios from "axios";
import { expect, test } from "bun:test";
import {
  createPoe2ScoutCurrentValuation,
  createPoe2ScoutValuation,
  findPoe2ScoutItem,
  getPoe2ScoutLookupTerms,
  POE2_SCOUT_MAX_OBSERVATION_AGE_MS,
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

test("does not match a different unique that shares the same base type", () => {
  const item = {
    item: {
      frameType: 3,
      rarity: "Unique",
      name: "Darkness Enthroned",
      typeLine: "Darkness Enthroned",
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
    ],
    item,
  );

  expect(match).toBeUndefined();
});

test("uses the copied item category to disambiguate exact Scout identities", () => {
  const item = {
    item: {
      frameType: 3,
      rarity: "Unique",
      name: "Shared Identity",
      typeLine: "Shared Identity",
      baseType: "Fine Belt",
    },
  } as Poe2Item;
  const match = findPoe2ScoutItem(
    [
      {
        ItemId: 10,
        CategoryApiId: "weapon",
        Text: "Shared Identity",
        Name: "Shared Identity",
        Type: "Quarterstaff",
        CurrentPrice: 20,
      },
      {
        ItemId: 20,
        CategoryApiId: "accessory",
        Text: "Shared Identity",
        Name: "Shared Identity",
        Type: "Fine Belt",
        CurrentPrice: 30,
      },
    ],
    item,
  );

  expect(match?.ItemId).toBe(20);
});

test("rejects ambiguous exact Scout identities within the same category", () => {
  const item = {
    item: {
      frameType: 3,
      rarity: "Unique",
      name: "Shared Identity",
      typeLine: "Shared Identity",
      baseType: "Fine Belt",
    },
  } as Poe2Item;
  const candidates = [10, 20].map((ItemId) => ({
    ItemId,
    CategoryApiId: "accessory",
    Text: "Shared Identity",
    Name: "Shared Identity",
    Type: "Fine Belt",
    CurrentPrice: 30,
  }));

  expect(findPoe2ScoutItem(candidates, item)).toBeUndefined();
});

test("maps copied rune currency to the compatible Scout category", () => {
  const item = {
    item: {
      frameType: 5,
      rarity: "Currency",
      name: "",
      typeLine: "Desert Rune",
      baseType: "Desert Rune",
      properties: [
        { name: "Stackable Currency", values: [], displayMode: 0 },
      ],
    },
  } as Poe2Item;
  const match = findPoe2ScoutItem(
    [
      {
        ItemId: 30,
        CategoryApiId: "weapon",
        Text: "Desert Rune",
        CurrentPrice: 40,
      },
      {
        ItemId: 40,
        CategoryApiId: "runes",
        Text: "Desert Rune",
        CurrentPrice: 50,
      },
    ],
    item,
  );

  expect(match?.ItemId).toBe(40);
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
    Date.parse("2026-07-18T12:00:00Z"),
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

test("uses the latest positive-quantity Scout history observation", () => {
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
          Time: "2026-07-21T10:00:00Z",
        },
        {
          Price: 99,
          Quantity: 0,
          Time: "2026-07-21T11:00:00Z",
        },
      ],
      HasMore: false,
    },
    Date.parse("2026-07-21T12:00:00Z"),
  );

  expect(valuation).toMatchObject({
    price: { amount: 12, currency: "exalted" },
    quantity: 8,
    updatedAt: Date.parse("2026-07-21T10:00:00Z"),
  });
  expect(valuation?.history).toHaveLength(1);
});

test("rejects Scout history older than the one-day freshness window", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  const staleTime = new Date(
    now - POE2_SCOUT_MAX_OBSERVATION_AGE_MS - 1,
  ).toISOString();
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
      PriceHistory: [{ Price: 12, Quantity: 8, Time: staleTime }],
      HasMore: false,
    },
    now,
  );

  expect(POE2_SCOUT_MAX_OBSERVATION_AGE_MS).toBe(86_400_000);
  expect(valuation).toBeUndefined();
});

test("does not return a cached Scout valuation after its observation expires", async () => {
  const originalGet = axios.get;
  const originalNow = Date.now;
  let now = Date.parse("2026-07-21T12:00:00Z");
  const observationTime = new Date(
    now - POE2_SCOUT_MAX_OBSERVATION_AGE_MS + 30 * 60 * 1000,
  ).toISOString();
  let historyRequests = 0;
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

  Date.now = () => now;
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

    if (url.includes("/History?")) {
      historyRequests += 1;
      return {
        data: {
          PriceHistory: [
            { Price: 18, Quantity: 3, Time: observationTime },
          ],
          HasMore: false,
        },
      };
    }

    return {
      data: [{ Value: "Standard", BaseCurrencyApiId: "divine" }],
    };
  }) as typeof axios.get;

  try {
    expect(await client.getMarketValuation(item, "Standard")).toBeDefined();

    now += 31 * 60 * 1000;

    expect(await client.getMarketValuation(item, "Standard")).toBeUndefined();
    expect(historyRequests).toBe(2);
  } finally {
    axios.get = originalGet;
    Date.now = originalNow;
  }
});

test("requires an actual timestamp for a positive-quantity current snapshot", () => {
  const valuation = createPoe2ScoutCurrentValuation(
    {
      ItemId: 4993,
      CategoryApiId: "accessory",
      Text: "Darkness Enthroned Fine Belt",
      Name: "Darkness Enthroned",
      Type: "Fine Belt",
      CurrentPrice: 18,
    },
    "divine",
    undefined,
    3,
    Date.parse("2026-07-22T12:00:00Z"),
  );

  expect(valuation).toBeUndefined();
});

test("rejects a zero-quantity current Scout snapshot when history is empty", async () => {
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
    const valuation = await client.getMarketValuation(item, "Standard");

    expect(valuation).toBeUndefined();
  } finally {
    axios.get = originalGet;
  }
});
