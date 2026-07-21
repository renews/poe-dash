import { getListingAgeInDays } from "./listing";

export const AGED_LISTING_PRICE_REDUCTION_AFTER_DAYS = 12;
export const AGED_LISTING_PRICE_REDUCTION_FACTOR = 0.5;

export function getListingSuggestionPriceFactor(
  indexed?: string,
  now = Date.now(),
) {
  const ageInDays = getListingAgeInDays(indexed, now);

  return ageInDays !== undefined &&
    ageInDays > AGED_LISTING_PRICE_REDUCTION_AFTER_DAYS
    ? AGED_LISTING_PRICE_REDUCTION_FACTOR
    : 1;
}

export function hasCurrentListingSuggestionPriceFactor(
  indexed: string | undefined,
  appliedFactor: number | undefined,
  now = Date.now(),
) {
  const normalizedAppliedFactor = appliedFactor ?? 1;
  return (
    normalizedAppliedFactor === getListingSuggestionPriceFactor(indexed, now)
  );
}
