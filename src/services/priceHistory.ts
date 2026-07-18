import type { Estimate } from "./PriceEstimator";
import type { Poe2Item, Price } from "./types";

export const PRICE_SNAPSHOT_STORAGE_KEY = "price_suggestion_history_v1";
const MAX_PRICE_SNAPSHOTS = 1000;

type PriceSnapshotStorage = Pick<Storage, "getItem" | "setItem">;

export interface PriceSnapshot {
  id: string;
  itemId: string;
  itemName: string;
  league?: string;
  checkedAt: number;
  suggested: Price;
  listed?: Price;
}

function getBrowserStorage(): PriceSnapshotStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export function createPriceSnapshot(
  item: Poe2Item,
  estimate: Estimate,
): PriceSnapshot {
  const checkedAt = estimate.checkedAt || Date.now();
  const itemId = item.item?.id || item.id;
  const listedPrice = item.listing?.price;

  return {
    id: `${itemId}:${checkedAt}`,
    itemId,
    itemName: item.item?.name || item.item?.typeLine || item.item?.baseType,
    league: item.item?.league || estimate.search?.league,
    checkedAt,
    suggested: clonePrice(estimate.price),
    ...(listedPrice &&
    Number.isFinite(listedPrice.amount) &&
    listedPrice.currency
      ? {
          listed: {
            amount: listedPrice.amount,
            currency: listedPrice.currency,
          },
        }
      : {}),
  };
}

export function loadPriceSnapshots(
  storage: PriceSnapshotStorage | undefined = getBrowserStorage(),
) {
  const raw = storage?.getItem(PRICE_SNAPSHOT_STORAGE_KEY);
  if (!raw) {
    return [] as PriceSnapshot[];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isPriceSnapshot).slice(0, MAX_PRICE_SNAPSHOTS)
      : [];
  } catch {
    return [];
  }
}

export function savePriceSnapshot(
  snapshot: PriceSnapshot,
  storage: PriceSnapshotStorage | undefined = getBrowserStorage(),
) {
  if (!storage) {
    return;
  }

  const snapshots = loadPriceSnapshots(storage);
  const nextSnapshots = [
    snapshot,
    ...snapshots.filter((entry) => entry.id !== snapshot.id),
  ]
    .sort((left, right) => right.checkedAt - left.checkedAt)
    .slice(0, MAX_PRICE_SNAPSHOTS);
  storage.setItem(PRICE_SNAPSHOT_STORAGE_KEY, JSON.stringify(nextSnapshots));
}

export function recordPriceSnapshot(item: Poe2Item, estimate: Estimate) {
  savePriceSnapshot(createPriceSnapshot(item, estimate));
}

function clonePrice(price: Price): Price {
  return {
    amount: price.amount,
    currency: price.currency,
    ...(price.lowerPrice ? { lowerPrice: clonePrice(price.lowerPrice) } : {}),
  };
}

function isPriceSnapshot(value: unknown): value is PriceSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<PriceSnapshot>;
  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.itemId === "string" &&
    typeof snapshot.checkedAt === "number" &&
    !!snapshot.suggested &&
    typeof snapshot.suggested.amount === "number" &&
    typeof snapshot.suggested.currency === "string"
  );
}
