import type { Poe2ExchangeSearch } from "./types";
import { analyzeComparablePrices } from "./priceAnalysis";

export interface OfficialTradeStaticEntry {
  id: string;
  text: string;
}

export interface OfficialTradeStaticGroup {
  id: string;
  label: string;
  entries: OfficialTradeStaticEntry[];
}

export interface OfficialTradeStaticData {
  result: OfficialTradeStaticGroup[];
}

export type OfficialTradeTagResolution =
  | { status: "resolved"; tag: string; text: string }
  | { status: "not-found"; text: string }
  | { status: "ambiguous"; tags: string[]; text: string };

export interface OfficialExchangePrice {
  amount: number;
  currency: string;
  searchId: string;
  sellerCount: number;
  targetTag: string;
}

function normalizeVisibleText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function resolveOfficialTradeTag(
  staticData: OfficialTradeStaticData,
  visibleText: string,
): OfficialTradeTagResolution {
  const normalizedText = normalizeVisibleText(visibleText);
  if (!normalizedText) {
    return { status: "not-found", text: "" };
  }

  const matches = (staticData.result || [])
    .flatMap((group) => group.entries || [])
    .filter(
      (entry) =>
        typeof entry.id === "string" &&
        entry.id.length > 0 &&
        entry.id !== "sep" &&
        typeof entry.text === "string" &&
        normalizeVisibleText(entry.text) === normalizedText,
    );
  const tags = [...new Set(matches.map((entry) => entry.id))];

  if (tags.length === 0) {
    return { status: "not-found", text: visibleText.trim() };
  }
  if (tags.length > 1) {
    return { status: "ambiguous", tags, text: visibleText.trim() };
  }

  return {
    status: "resolved",
    tag: tags[0],
    text: matches[0].text.trim().replace(/\s+/g, " "),
  };
}

export function getOfficialExchangePrice(
  exchangeSearch: Poe2ExchangeSearch,
  targetTag: string,
  paymentTags: readonly string[],
): OfficialExchangePrice | undefined {
  const uniquePaymentTags = [...new Set(paymentTags)];
  const candidates: Array<{
    price: OfficialExchangePrice;
    confidence: "low" | "medium" | "high";
    paymentOrder: number;
  }> = [];

  for (const [paymentOrder, paymentTag] of uniquePaymentTags.entries()) {
    const pricesBySeller = new Map<string, number>();

    for (const result of Object.values(exchangeSearch.result || {})) {
      const listing = result?.listing;
      const seller = listing?.account?.name?.trim();
      if (!seller || !Array.isArray(listing.offers)) {
        continue;
      }

      for (const offer of listing.offers) {
        if (
          offer.exchange?.currency !== paymentTag ||
          offer.item?.currency !== targetTag ||
          !isPositiveNumber(offer.exchange.amount) ||
          !isPositiveNumber(offer.item.amount) ||
          !isPositiveNumber(offer.item.stock) ||
          offer.item.stock < offer.item.amount
        ) {
          continue;
        }

        const unitPrice = offer.exchange.amount / offer.item.amount;
        if (!isPositiveNumber(unitPrice)) {
          continue;
        }

        const sellerKey = seller.toLowerCase();
        const currentPrice = pricesBySeller.get(sellerKey);
        if (currentPrice === undefined || unitPrice < currentPrice) {
          pricesBySeller.set(sellerKey, unitPrice);
        }
      }
    }

    const analysis = analyzeComparablePrices(
      [...pricesBySeller].map(([seller, amount]) => ({
        amount,
        item: { listing: { account: { name: seller } } },
      })),
    );
    if (analysis.included.length === 0) {
      continue;
    }

    candidates.push({
      price: {
        amount: analysis.median,
        currency: paymentTag,
        searchId: exchangeSearch.id,
        sellerCount: analysis.included.length,
        targetTag,
      },
      confidence: analysis.confidence,
      paymentOrder,
    });
  }

  const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
  return candidates.sort(
    (left, right) =>
      confidenceRank[right.confidence] - confidenceRank[left.confidence] ||
      right.price.sellerCount - left.price.sellerCount ||
      left.paymentOrder - right.paymentOrder,
  )[0]?.price;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
