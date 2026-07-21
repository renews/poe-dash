import { expect, test } from "bun:test";
import {
  AGED_LISTING_PRICE_REDUCTION_FACTOR,
  getListingSuggestionPriceFactor,
  hasCurrentListingSuggestionPriceFactor,
} from "../src/services/listingPricePolicy";

test("halves suggestions after more than 12 complete listing days", () => {
  const now = new Date(2026, 6, 21, 12, 0).getTime();
  const daysAgo = (days: number, hours = 0) =>
    new Date(now - (days * 24 + hours) * 60 * 60 * 1000).toISOString();

  expect(getListingSuggestionPriceFactor(daysAgo(12, 23), now)).toBe(1);
  expect(getListingSuggestionPriceFactor(daysAgo(13), now)).toBe(
    AGED_LISTING_PRICE_REDUCTION_FACTOR,
  );
});

test("keeps suggestions unchanged when listing age is unavailable", () => {
  const now = new Date(2026, 6, 21, 12, 0).getTime();

  expect(getListingSuggestionPriceFactor(undefined, now)).toBe(1);
  expect(getListingSuggestionPriceFactor("not-a-date", now)).toBe(1);
  expect(
    getListingSuggestionPriceFactor(
      new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      now,
    ),
  ).toBe(1);
});

test("treats legacy cached suggestions as full-price suggestions", () => {
  const now = new Date(2026, 6, 21, 12, 0).getTime();
  const oldListing = new Date(
    now - 13 * 24 * 60 * 60 * 1000,
  ).toISOString();

  expect(
    hasCurrentListingSuggestionPriceFactor(oldListing, undefined, now),
  ).toBe(false);
  expect(
    hasCurrentListingSuggestionPriceFactor(
      oldListing,
      AGED_LISTING_PRICE_REDUCTION_FACTOR,
      now,
    ),
  ).toBe(true);
});
