export type PriceConfidence = "low" | "medium" | "high";
export type ComparableExclusionReason =
  | "invalid"
  | "duplicateSeller"
  | "stale"
  | "outlier";

export interface AnalyzableComparable {
  amount: number;
  itemId?: string;
  item?: {
    listing?: {
      indexed?: string;
      account?: { name?: string };
    };
  };
}

export interface ComparableAnalysisOptions {
  now?: number;
  maxAgeDays?: number;
  minimumFreshListings?: number;
}

export interface ComparablePriceAnalysis<T extends AnalyzableComparable> {
  included: T[];
  median: number;
  spread: number;
  confidence: PriceConfidence;
  excludedByReason: Record<ComparableExclusionReason, number>;
}

const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_MINIMUM_FRESH_LISTINGS = 3;
const ROBUST_Z_SCORE_LIMIT = 3.5;

export function analyzeComparablePrices<T extends AnalyzableComparable>(
  comparables: T[],
  options: ComparableAnalysisOptions = {},
): ComparablePriceAnalysis<T> {
  const excludedByReason: Record<ComparableExclusionReason, number> = {
    invalid: 0,
    duplicateSeller: 0,
    stale: 0,
    outlier: 0,
  };
  const valid = comparables.filter((comparable) => {
    const isValid =
      Number.isFinite(comparable.amount) && comparable.amount > 0;
    if (!isValid) {
      excludedByReason.invalid += 1;
    }
    return isValid;
  });
  const deduplicated = deduplicateSellers(valid, excludedByReason);
  const fresh = preferFreshListings(deduplicated, excludedByReason, options);
  const included = excludeOutliers(fresh, excludedByReason).sort(
    (left, right) => left.amount - right.amount,
  );
  const amounts = included.map((comparable) => comparable.amount);
  const medianAmount = median(amounts);
  const spread = median(
    amounts.map((amount) => Math.abs(amount - medianAmount)),
  ) * 1.4826;

  return {
    included,
    median: medianAmount,
    spread,
    confidence: getConfidence(included.length, medianAmount, spread),
    excludedByReason,
  };
}

export function median(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deduplicateSellers<T extends AnalyzableComparable>(
  comparables: T[],
  excluded: Record<ComparableExclusionReason, number>,
) {
  const bySeller = new Map<string, T>();

  comparables.forEach((comparable, index) => {
    const seller = comparable.item?.listing?.account?.name?.trim();
    const key = seller
      ? `seller:${seller.toLowerCase()}`
      : comparable.itemId
        ? `item:${comparable.itemId}`
        : `index:${index}`;
    const current = bySeller.get(key);

    if (!current) {
      bySeller.set(key, comparable);
      return;
    }

    excluded.duplicateSeller += 1;
    if (comparable.amount < current.amount) {
      bySeller.set(key, comparable);
    }
  });

  return [...bySeller.values()];
}

function preferFreshListings<T extends AnalyzableComparable>(
  comparables: T[],
  excluded: Record<ComparableExclusionReason, number>,
  options: ComparableAnalysisOptions,
) {
  const now = options.now ?? Date.now();
  const maxAgeMs =
    (options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const minimumFreshListings =
    options.minimumFreshListings ?? DEFAULT_MINIMUM_FRESH_LISTINGS;
  const fresh = comparables.filter((comparable) => {
    const indexedAt = Date.parse(comparable.item?.listing?.indexed || "");
    return Number.isNaN(indexedAt) || now - indexedAt <= maxAgeMs;
  });

  if (fresh.length < minimumFreshListings) {
    return comparables;
  }

  excluded.stale += comparables.length - fresh.length;
  return fresh;
}

function excludeOutliers<T extends AnalyzableComparable>(
  comparables: T[],
  excluded: Record<ComparableExclusionReason, number>,
) {
  if (comparables.length < 5) {
    return comparables;
  }

  const center = median(comparables.map((comparable) => comparable.amount));
  const absoluteDeviations = comparables.map((comparable) =>
    Math.abs(comparable.amount - center),
  );
  const medianAbsoluteDeviation = median(absoluteDeviations);
  const included = comparables.filter((comparable) => {
    if (medianAbsoluteDeviation === 0) {
      return comparable.amount === center;
    }

    const robustZScore =
      Math.abs(comparable.amount - center) /
      (1.4826 * medianAbsoluteDeviation);
    return robustZScore <= ROBUST_Z_SCORE_LIMIT;
  });

  if (included.length < 3) {
    return comparables;
  }

  excluded.outlier += comparables.length - included.length;
  return included;
}

function getConfidence(
  sampleSize: number,
  medianAmount: number,
  spread: number,
): PriceConfidence {
  const relativeSpread = medianAmount > 0 ? spread / medianAmount : Infinity;
  if (sampleSize >= 8 && relativeSpread <= 0.25) {
    return "high";
  }
  if (sampleSize >= 4 && relativeSpread <= 0.75) {
    return "medium";
  }
  return "low";
}
