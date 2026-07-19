import { expect, test } from "bun:test";
import {
  alertOnMispricedItem,
  createPriceAlertPayload,
} from "../src/services/PriceAlert";
import { classifyPricePosition } from "../src/services/pricePosition";
import { Estimate } from "../src/services/PriceEstimator";
import { Poe2Item } from "../src/services/types";

test("classifies prices inside the market spread as fair", () => {
  expect(classifyPricePosition(80, 100, 10)).toBe("underpriced");
  expect(classifyPricePosition(90, 100, 10)).toBe("fair");
  expect(classifyPricePosition(110, 100, 10)).toBe("fair");
  expect(classifyPricePosition(111, 100, 10)).toBe("overpriced");
  expect(classifyPricePosition(96, 100, 0)).toBe("fair");
  expect(classifyPricePosition(94, 100, 0)).toBe("underpriced");
});

test("builds a useful underpriced desktop alert", () => {
  const payload = createPriceAlertPayload(
    {
      listing: { price: { amount: 80, currency: "exalted" } },
      item: { name: "Doom Loop", typeLine: "Ruby Ring" },
    } as Poe2Item,
    {
      price: { amount: 100, currency: "exalted" },
      confidence: "medium",
    } as Estimate,
    "underpriced",
  );

  expect(payload).toEqual({
    kind: "underpriced",
    title: "Potentially underpriced: Doom Loop",
    body: "Listed: 80 exalted · Suggested: 100 exalted · Medium confidence",
  });
});

test("alerts only for underpriced or overpriced items", async () => {
  const item = {
    listing: { price: { amount: 80, currency: "exalted" } },
    item: { name: "Doom Loop", typeLine: "Ruby Ring" },
  } as Poe2Item;
  const estimate = {
    price: { amount: 100, currency: "exalted" },
    confidence: "high",
  } as Estimate;
  const dispatched: string[] = [];

  await expect(
    alertOnMispricedItem(item, estimate, "Standard", {
      getPosition: async () => "fair",
      dispatch: async (payload) => {
        dispatched.push(payload.kind);
        return true;
      },
    }),
  ).resolves.toBe(false);
  await expect(
    alertOnMispricedItem(item, estimate, "Standard", {
      getPosition: async () => "overpriced",
      dispatch: async (payload) => {
        dispatched.push(payload.kind);
        return true;
      },
    }),
  ).resolves.toBe(true);
  expect(dispatched).toEqual(["overpriced"]);
});
