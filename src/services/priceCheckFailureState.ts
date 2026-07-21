export const PRICE_CHECK_FAILURES_STORAGE_KEY = "priceCheckFailures";

export type PriceCheckFailure = {
  message: string;
  failedAt: number;
};

export type PriceCheckFailures = Record<string, PriceCheckFailure>;

type PriceCheckFailureStorage = Pick<Storage, "getItem" | "setItem">;

function getDefaultStorage(): PriceCheckFailureStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function isPriceCheckFailure(value: unknown): value is PriceCheckFailure {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const failure = value as Partial<PriceCheckFailure>;
  return (
    typeof failure.message === "string" &&
    failure.message.length > 0 &&
    typeof failure.failedAt === "number" &&
    Number.isFinite(failure.failedAt)
  );
}

function parseFailureScopes(
  value: string | null,
): Record<string, PriceCheckFailures> {
  if (!value) {
    return {} as Record<string, PriceCheckFailures>;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const scopes: Record<string, PriceCheckFailures> = {};
    for (const [scope, failures] of Object.entries(parsed)) {
      scopes[scope] = {};
      if (!failures || typeof failures !== "object" || Array.isArray(failures)) {
        continue;
      }

      for (const [itemId, failure] of Object.entries(failures)) {
        if (isPriceCheckFailure(failure)) {
          scopes[scope][itemId] = failure;
        }
      }
    }

    return scopes;
  } catch {
    return {};
  }
}

export function loadPriceCheckFailures(
  scope: string,
  storage = getDefaultStorage(),
): PriceCheckFailures {
  if (!storage) {
    return {};
  }

  return {
    ...(parseFailureScopes(
      storage.getItem(PRICE_CHECK_FAILURES_STORAGE_KEY),
    )[scope] || {}),
  };
}

export function persistPriceCheckFailures(
  scope: string,
  failures: PriceCheckFailures,
  storage = getDefaultStorage(),
) {
  if (!storage) {
    return;
  }

  const scopes = parseFailureScopes(
    storage.getItem(PRICE_CHECK_FAILURES_STORAGE_KEY),
  );
  scopes[scope] = failures;
  storage.setItem(PRICE_CHECK_FAILURES_STORAGE_KEY, JSON.stringify(scopes));
}

export function recordPriceCheckFailure(
  failures: PriceCheckFailures,
  itemId: string,
  message: string,
  failedAt = Date.now(),
): PriceCheckFailures {
  return {
    ...failures,
    [itemId]: { message, failedAt },
  };
}

export function clearPriceCheckFailure(
  failures: PriceCheckFailures,
  itemId: string,
): PriceCheckFailures {
  if (!failures[itemId]) {
    return failures;
  }

  const next = { ...failures };
  delete next[itemId];
  return next;
}

export function getPriceCheckErrorMessages(failures: PriceCheckFailures) {
  return Object.fromEntries(
    Object.entries(failures).map(([itemId, failure]) => [
      itemId,
      failure.message,
    ]),
  );
}

export function isEstimateNewerThanFailure(
  estimate: { checkedAt?: number },
  failure?: PriceCheckFailure,
) {
  if (!failure) {
    return true;
  }

  return (
    typeof estimate.checkedAt === "number" &&
    Number.isFinite(estimate.checkedAt) &&
    estimate.checkedAt > failure.failedAt
  );
}
