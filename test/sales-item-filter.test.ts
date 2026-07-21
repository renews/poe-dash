import { expect, test } from "bun:test";
import { Estimate } from "../src/services/PriceEstimator";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SalesItemFilterField } from "../src/components/SalesItemFilterField";
import {
  filterSalesItems,
  type SalesItemFilter,
} from "../src/services/salesItemFilter";
import { Poe2Item } from "../src/services/types";

const NOW = Date.parse("2026-07-21T12:00:00.000Z");

function createItem(id: string, indexed?: string) {
  return {
    id,
    listing: {
      indexed,
      stash: { name: "Shop", x: 0, y: 0 },
    },
    item: { id, name: id },
  } as Poe2Item;
}

test("filters old sales using the existing five-day age warning", () => {
  const items = [
    createItem("ten-days", "2026-07-11T12:00:00.000Z"),
    createItem("five-days", "2026-07-16T12:00:00.000Z"),
    createItem("almost-five-days", "2026-07-16T13:00:00.000Z"),
    createItem("unknown", "not-a-date"),
  ];

  expect(filterSalesItems(items, "old", {}, {}, NOW).map(({ id }) => id)).toEqual([
    "ten-days",
    "five-days",
  ]);
  expect(items.map(({ id }) => id)).toEqual([
    "ten-days",
    "five-days",
    "almost-five-days",
    "unknown",
  ]);
});

test("filters sales by whether a suggested price is currently available", () => {
  const items = [
    createItem("suggested"),
    createItem("great-price"),
    createItem("unchecked"),
    createItem("failed-with-cache"),
  ];
  const estimates = {
    suggested: { price: { amount: 3, currency: "chaos" } } as Estimate,
    "great-price": {
      price: { amount: 1, currency: "divine" },
      matchesCurrentPrice: true,
    } as Estimate,
    "failed-with-cache": {
      price: { amount: 8, currency: "chaos" },
    } as Estimate,
  };
  const errors = { "failed-with-cache": "Price check unavailable." };

  const idsFor = (filter: SalesItemFilter) =>
    filterSalesItems(items, filter, estimates, errors, NOW).map(({ id }) => id);

  expect(idsFor("without-price-check")).toEqual([
    "unchecked",
    "failed-with-cache",
  ]);
  expect(idsFor("with-suggested-price")).toEqual([
    "suggested",
    "great-price",
  ]);
  expect(idsFor("all")).toEqual([
    "suggested",
    "great-price",
    "unchecked",
    "failed-with-cache",
  ]);
});

test("renders an accessible sales item filter with every supported view", () => {
  const markup = renderToStaticMarkup(
    createElement(SalesItemFilterField, {
      value: "without-price-check",
      onChange: () => {},
    }),
  );

  expect(markup).toContain('for="sales-item-filter"');
  expect(markup).toContain('id="sales-item-filter"');
  expect(markup).toContain("Item filter");
  expect(markup).toContain('value="all"');
  expect(markup).toContain("All items");
  expect(markup).toContain('value="old"');
  expect(markup).toContain("Old items (5d+)");
  expect(markup).toContain('value="without-price-check" selected=""');
  expect(markup).toContain("Without price check");
  expect(markup).toContain('value="with-suggested-price"');
  expect(markup).toContain("With suggested price");
});

test("applies the selected item filter to the sales workspace", async () => {
  const source = await Bun.file(
    `${import.meta.dir}/../src/components/MainPage.tsx`,
  ).text();

  expect(source).toContain("<SalesItemFilterField");
  expect(source).toContain("filterSalesItems(");
  expect(source).toContain("filteredItems,");
  expect(source).toContain("priceEstimates,");
  expect(source).toContain("priceCheckErrors,");
  expect(source).toContain("items={visibleItems}");
});

test("price all checks only sales that remain after the current filters", async () => {
  const source = await Bun.file(
    `${import.meta.dir}/../src/components/MainPage.tsx`,
  ).text();

  expect(source).toContain("onClick={() => priceCheckItems(visibleItems)}");
  expect(source).not.toContain("onClick={priceCheckAllItems}");
});

test("disables price all when the current filters have no sales", async () => {
  const source = await Bun.file(
    `${import.meta.dir}/../src/components/MainPage.tsx`,
  ).text();

  expect(source).toContain(
    "disabled={isPriceChecking || visibleItems.length === 0}",
  );
});
