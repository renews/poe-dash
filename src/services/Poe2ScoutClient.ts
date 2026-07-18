import axios from "axios";
import { ApiRequestQueue, ApiRequestRunOptions } from "./ApiRequestQueue";
import { Price, Poe2Item } from "./types";

const POE2_SCOUT_CACHE_MS = 60 * 60 * 1000;
const POE2_SCOUT_HISTORY_COUNT = 24;

export interface Poe2ScoutItem {
  ItemId: number;
  CategoryApiId: string;
  Text: string;
  Name?: string | null;
  Type?: string | null;
  CurrentPrice: number;
  ApiId?: string | null;
  IconUrl?: string | null;
}

export interface Poe2ScoutPriceLog {
  Price: number;
  Time: string;
  Quantity: number;
}

export interface Poe2ScoutHistoryResponse {
  PriceHistory: Poe2ScoutPriceLog[];
  HasMore: boolean;
}

export interface Poe2ScoutHistoryPoint {
  amount: number;
  quantity: number;
  updatedAt: number;
}

export interface Poe2ScoutMarketValuation {
  itemId: number;
  itemName: string;
  price: Price;
  quantity: number;
  updatedAt: number;
  history: Poe2ScoutHistoryPoint[];
}

function normalizeLookupText(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

export function getPoe2ScoutLookupTerms(item: Poe2Item) {
  const rarity = item.item?.rarity?.trim().toLowerCase();
  const frameType = item.item?.frameType;
  const isFixedIdentity =
    (typeof frameType === "number" && frameType >= 3) ||
    (!!rarity && !["normal", "magic", "rare"].includes(rarity));

  if (!isFixedIdentity) {
    return [];
  }

  return [item.item?.name, item.item?.typeLine, item.item?.baseType]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value)
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function findPoe2ScoutItem(
  items: Poe2ScoutItem[],
  item: Poe2Item,
) {
  const terms = getPoe2ScoutLookupTerms(item).map(normalizeLookupText);
  if (!terms.length) {
    return undefined;
  }

  for (const field of ["Name", "Type", "Text"] as const) {
    for (const term of terms) {
      const match = items.find(
        (candidate) => normalizeLookupText(candidate[field]) === term,
      );
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

export function createPoe2ScoutValuation(
  item: Poe2ScoutItem,
  response: Poe2ScoutHistoryResponse,
): Poe2ScoutMarketValuation | undefined {
  const history = (response.PriceHistory || [])
    .map((entry) => ({
      amount: Number(entry.Price),
      quantity: Number(entry.Quantity),
      updatedAt: Date.parse(entry.Time),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.amount) &&
        entry.amount > 0 &&
        Number.isFinite(entry.quantity) &&
        entry.quantity >= 0 &&
        Number.isFinite(entry.updatedAt),
    )
    .sort((left, right) => left.updatedAt - right.updatedAt);
  const latest = history.at(-1);
  if (!latest) {
    return undefined;
  }

  return {
    itemId: item.ItemId,
    itemName: item.Name || item.Text || item.Type || "Item",
    price: { amount: latest.amount, currency: "exalted" },
    quantity: latest.quantity,
    updatedAt: latest.updatedAt,
    history,
  };
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class Poe2ScoutClient {
  private readonly requests = new ApiRequestQueue({
    maxRetries: 2,
    minIntervalMs: 250,
  });
  private readonly itemCache = new Map<string, CacheEntry<Poe2ScoutItem[]>>();
  private readonly valuationCache = new Map<
    string,
    CacheEntry<Poe2ScoutMarketValuation>
  >();
  port = 7555;
  requestTimeout = 15_000;
  baseUrl = `http://localhost:${this.port}`;
  apiUrl = `${this.baseUrl}/proxy/poe2scout.com/api`;

  async getMarketValuation(
    item: Poe2Item,
    league = "Standard",
    options: ApiRequestRunOptions = {},
  ) {
    if (!getPoe2ScoutLookupTerms(item).length) {
      return undefined;
    }

    const marketItem = findPoe2ScoutItem(
      await this.getItems(league, options),
      item,
    );
    if (!marketItem) {
      return undefined;
    }

    const cacheKey = `${league}:${marketItem.ItemId}`;
    const cached = this.getCached(this.valuationCache, cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      LogCount: POE2_SCOUT_HISTORY_COUNT.toString(),
      ReferenceCurrency: "exalted",
    });
    const url = `${this.getLeagueUrl(league)}/Items/${marketItem.ItemId}/History?${params.toString()}`;
    const response = await this.requests.run(
      () =>
        axios.get<Poe2ScoutHistoryResponse>(url, {
          timeout: this.requestTimeout,
          signal: options.signal,
        }),
      options,
    );
    const valuation = createPoe2ScoutValuation(marketItem, response.data);
    if (valuation) {
      this.setCached(this.valuationCache, cacheKey, valuation);
    }
    return valuation;
  }

  private async getItems(
    league: string,
    options: ApiRequestRunOptions,
  ) {
    const cached = this.getCached(this.itemCache, league);
    if (cached) {
      return cached;
    }

    const response = await this.requests.run(
      () =>
        axios.get<Poe2ScoutItem[]>(`${this.getLeagueUrl(league)}/Items`, {
          timeout: this.requestTimeout,
          signal: options.signal,
        }),
      options,
    );
    const items = Array.isArray(response.data) ? response.data : [];
    if (items.length) {
      this.setCached(this.itemCache, league, items);
    }
    return items;
  }

  private getLeagueUrl(league: string) {
    return `${this.apiUrl}/poe2/Leagues/${encodeURIComponent(league)}`;
  }

  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ) {
    cache.set(key, {
      expiresAt: Date.now() + POE2_SCOUT_CACHE_MS,
      value,
    });
  }
}

export const Poe2Scout = new Poe2ScoutClient();
