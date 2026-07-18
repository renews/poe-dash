import { expect, test } from "bun:test";
import {
  extractMerchantHistoryRows,
  filterMerchantHistory,
  formatMerchantHistoryItemTooltip,
  normalizeMerchantHistoryRow,
} from "../src/services/merchantHistory";

const rows = [
  {
    time: "2026-07-17T12:30:00.000Z",
    item_id: "item-one",
    price: { amount: 1, currency: "chaos" },
    item: { name: "Detonate Living", typeLine: "Detonate Living" },
  },
  {
    listedAt: "2026-07-16T12:30:00.000Z",
    amount: 5,
    currency: "exalted",
    data: { item: { name: "Fine Ring", typeLine: "Fine Ring" } },
  },
];

test("extracts rows from the official history response", () => {
  expect(extractMerchantHistoryRows({ result: rows })).toEqual(rows);
  expect(extractMerchantHistoryRows({ entries: rows })).toEqual(rows);
  expect(extractMerchantHistoryRows(rows)).toEqual(rows);
});

test("normalizes item and price fields from official history rows", () => {
  expect(normalizeMerchantHistoryRow(rows[0], 0)).toMatchObject({
    id: "item-one##2026-07-17T12:30:00.000Z",
    timestamp: "2026-07-17T12:30:00.000Z",
    itemName: "Detonate Living",
    amount: 1,
    currency: "chaos",
  });
  expect(normalizeMerchantHistoryRow(rows[1], 1)).toMatchObject({
    timestamp: "2026-07-16T12:30:00.000Z",
    itemName: "Fine Ring",
    amount: 5,
    currency: "exalted",
  });
});

test("filters official history by item, buyer, or currency", () => {
  const entries = rows.map(normalizeMerchantHistoryRow);

  expect(filterMerchantHistory(entries, "detonate")).toEqual([entries[0]]);
  expect(filterMerchantHistory(entries, "EXALTED")).toEqual([entries[1]]);
  expect(filterMerchantHistory(entries, "   ")).toEqual(entries);
});

test("formats the full sold item for its hover tooltip", () => {
  const entry = normalizeMerchantHistoryRow({
    time: "2026-07-17T12:30:00.000Z",
    price: { amount: 2, currency: "chaos" },
    item: {
      name: "Storm Ring",
      typeLine: "Two-Stone Ring",
      rarity: "Rare",
      ilvl: 82,
      properties: [{ name: "Resistance", values: [["20%", 0]] }],
      implicitMods: ["+15% to Fire Resistance"],
      explicitMods: ["100 to maximum Life", "+30% to Lightning Resistance"],
      extended: {
        mods: {
          explicit: [{ tier: "P1" }, { tier: "S1" }],
        },
      },
    },
  });

  const tooltip = formatMerchantHistoryItemTooltip(entry);

  expect(tooltip).toContain("Storm Ring");
  expect(tooltip).toContain("Item level: 82");
  expect(tooltip).toContain("Properties\nResistance: 20%");
  expect(tooltip).toContain("Implicit\n+15% to Fire Resistance");
  expect(tooltip).toContain("Prefixes\n100 to maximum Life");
  expect(tooltip).toContain("Suffixes\n+30% to Lightning Resistance");
  expect(tooltip).not.toContain("Explicit:");
  expect(tooltip).toContain("Sold for: 2 chaos");
  expect(tooltip).not.toContain("; ");
});
