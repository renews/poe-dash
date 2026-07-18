import {
  extractMerchantHistoryRows,
  MerchantHistoryEntry,
  normalizeMerchantHistoryRow,
} from "./merchantHistory";

export interface MerchantHistorySession {
  loggedIn: boolean;
  cookiePresent: boolean;
}

interface MerchantHistoryResponse {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

export class MerchantHistoryError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MerchantHistoryError";
  }
}

export class MerchantHistoryService {
  private async invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    if (typeof window === "undefined" || !window.ipcRenderer) {
      throw new MerchantHistoryError(
        "Merchant History is only available in the desktop app.",
      );
    }

    return (await window.ipcRenderer.invoke(channel, ...args)) as T;
  }

  getSession() {
    return this.invoke<MerchantHistorySession>("poe-get-session");
  }

  login() {
    return this.invoke<MerchantHistorySession>("poe-login");
  }

  async fetchHistory(league: string): Promise<MerchantHistoryEntry[]> {
    const response = await this.invoke<MerchantHistoryResponse>(
      "poe-fetch-history",
      league,
    );

    if (!response.ok) {
      throw new MerchantHistoryError(
        response.error || `Unable to fetch merchant history (HTTP ${response.status}).`,
        response.status,
      );
    }

    return extractMerchantHistoryRows(response.data)
      .map(normalizeMerchantHistoryRow)
      .sort((left, right) => {
        const leftTime = Date.parse(String(left.timestamp));
        const rightTime = Date.parse(String(right.timestamp));
        return rightTime - leftTime;
      });
  }
}

export const merchantHistoryService = new MerchantHistoryService();
