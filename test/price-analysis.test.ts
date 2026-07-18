import { expect, test } from "bun:test";
import { analyzeComparablePrices } from "../src/services/priceAnalysis";

function comparable(
  amount: number,
  seller: string,
  indexed = "2026-07-17T12:00:00.000Z",
) {
  return {
    amount,
    currency: "exalted",
    itemId: `${seller}-${amount}`,
    item: {
      listing: {
        indexed,
        account: { name: seller },
      },
    },
  };
}

test("uses a robust median and excludes extreme listing outliers", () => {
  const analysis = analyzeComparablePrices([
    comparable(10, "one"),
    comparable(11, "two"),
    comparable(12, "three"),
    comparable(13, "four"),
    comparable(1000, "five"),
  ]);

  expect(analysis.median).toBe(11.5);
  expect(analysis.included.map((entry) => entry.amount)).toEqual([
    10, 11, 12, 13,
  ]);
  expect(analysis.excludedByReason.outlier).toBe(1);
});

test("counts each seller once using their lowest comparable listing", () => {
  const analysis = analyzeComparablePrices([
    comparable(20, "same-seller"),
    comparable(10, "same-seller"),
    comparable(12, "another-seller"),
  ]);

  expect(analysis.included.map((entry) => entry.amount)).toEqual([10, 12]);
  expect(analysis.excludedByReason.duplicateSeller).toBe(1);
});

test("prefers recent listings when enough fresh comparables exist", () => {
  const now = Date.parse("2026-07-18T12:00:00.000Z");
  const analysis = analyzeComparablePrices(
    [
      comparable(10, "one"),
      comparable(11, "two"),
      comparable(12, "three"),
      comparable(13, "four"),
      comparable(2, "stale", "2026-06-01T12:00:00.000Z"),
    ],
    { now, maxAgeDays: 7 },
  );

  expect(analysis.included.map((entry) => entry.amount)).toEqual([
    10, 11, 12, 13,
  ]);
  expect(analysis.excludedByReason.stale).toBe(1);
});

test("reports high confidence for a large, tightly grouped sample", () => {
  const analysis = analyzeComparablePrices(
    [10, 10, 10, 11, 11, 11, 12, 12].map((amount, index) =>
      comparable(amount, `seller-${index}`),
    ),
  );

  expect(analysis.confidence).toBe("high");
  expect(analysis.included).toHaveLength(8);
});
