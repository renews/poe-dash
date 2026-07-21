import type { Estimate } from "./PriceEstimator";
import { getListingAgeStatus } from "./listing";
import type { Poe2Item } from "./types";

export type SalesItemFilter =
  | "all"
  | "old"
  | "without-price-check"
  | "with-suggested-price";

function hasSuggestedPrice(
  itemId: string,
  priceEstimates: Record<string, Estimate>,
  priceCheckErrors: Record<string, string>,
) {
  return Boolean(priceEstimates[itemId]) && !priceCheckErrors[itemId];
}

export function filterSalesItems(
  items: Poe2Item[],
  filter: SalesItemFilter,
  priceEstimates: Record<string, Estimate>,
  priceCheckErrors: Record<string, string>,
  now = Date.now(),
) {
  switch (filter) {
    case "old":
      return items.filter((item) => {
        const status = getListingAgeStatus(item.listing?.indexed, now);
        return status === "aging" || status === "stale";
      });
    case "without-price-check":
      return items.filter(
        (item) =>
          !hasSuggestedPrice(item.id, priceEstimates, priceCheckErrors),
      );
    case "with-suggested-price":
      return items.filter((item) =>
        hasSuggestedPrice(item.id, priceEstimates, priceCheckErrors),
      );
    default:
      return items;
  }
}
