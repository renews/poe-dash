export type PricePosition =
  | "underpriced"
  | "fair"
  | "overpriced"
  | "unpriced";

export const MINIMUM_FAIR_PRICE_TOLERANCE_PERCENT = 5;

export function classifyPricePosition(
  listedAmount: number,
  suggestedAmount: number,
  spreadAmount = 0,
): PricePosition {
  if (
    !Number.isFinite(listedAmount) ||
    !Number.isFinite(suggestedAmount) ||
    suggestedAmount <= 0
  ) {
    return "unpriced";
  }

  const minimumTolerance =
    suggestedAmount * (MINIMUM_FAIR_PRICE_TOLERANCE_PERCENT / 100);
  const tolerance = Math.max(
    Number.isFinite(spreadAmount) ? Math.abs(spreadAmount) : 0,
    minimumTolerance,
  );

  if (listedAmount < suggestedAmount - tolerance) {
    return "underpriced";
  }
  if (listedAmount > suggestedAmount + tolerance) {
    return "overpriced";
  }
  return "fair";
}
