const TRADE_HOSTNAME = "www.pathofexile.com";

export function createTradeSearchUrl(league: string, searchId: string) {
  return `https://${TRADE_HOSTNAME}/trade2/search/poe2/${encodeURIComponent(league)}/${encodeURIComponent(searchId)}`;
}

export function createTradeExchangeUrl(league: string, searchId: string) {
  return `https://${TRADE_HOSTNAME}/trade2/exchange/poe2/${encodeURIComponent(league)}/${encodeURIComponent(searchId)}`;
}

export function createMerchantHistoryUrl() {
  return `https://${TRADE_HOSTNAME}/trade2/history`;
}

export function isAllowedExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === TRADE_HOSTNAME &&
      (url.pathname.startsWith("/trade2/search/poe2/") ||
        url.pathname.startsWith("/trade2/exchange/poe2/") ||
        url.pathname === "/trade2/history" ||
        url.pathname === "/trade2/history/")
    );
  } catch {
    return false;
  }
}
