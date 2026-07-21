import axios from "axios";
import { expect, test } from "bun:test";
import {
  getOfficialExchangePrice,
  OfficialTradeStaticData,
  resolveOfficialTradeTag,
} from "../src/services/OfficialExchangePricing";
import { Poe2TradeClient } from "../src/services/Poe2TradeClient";
import { Poe2ExchangeSearch } from "../src/services/types";

test("resolves only an exact normalized and unambiguous official trade tag", () => {
  const staticData: OfficialTradeStaticData = {
    result: [
      {
        id: "Currency",
        label: "Currency",
        entries: [
          { id: "divine", text: "Divine Orb" },
          { id: "omen-one", text: "Omen of Return" },
          { id: "sep", text: "" },
          { id: "sep", text: "Divine Orb" },
        ],
      },
      {
        id: "Fragments",
        label: "Fragments",
        entries: [{ id: "omen-two", text: "  OMEN OF RETURN " }],
      },
    ],
  };

  expect(resolveOfficialTradeTag(staticData, "  divine   ORB ")).toEqual({
    status: "resolved",
    tag: "divine",
    text: "Divine Orb",
  });
  expect(resolveOfficialTradeTag(staticData, "Divine")).toEqual({
    status: "not-found",
    text: "Divine",
  });
  expect(resolveOfficialTradeTag(staticData, "Omen of Return")).toEqual({
    status: "ambiguous",
    tags: ["omen-one", "omen-two"],
    text: "Omen of Return",
  });
  expect(resolveOfficialTradeTag(staticData, "   ")).toEqual({
    status: "not-found",
    text: "",
  });
});

test("requests exchange listings with payment tags in have and target in want", async () => {
  const client = new Poe2TradeClient();
  const originalPost = axios.post;
  let capturedUrl: string | undefined;
  let capturedPayload: unknown;

  axios.post = (async (...args: Parameters<typeof axios.post>) => {
    capturedUrl = args[0];
    capturedPayload = args[1];
    return { data: { id: "exchange-id", result: {} } };
  }) as unknown as typeof axios.post;

  try {
    await client.getExchangeListings(
      "chaos",
      ["exalted", "divine", "exalted"],
      "Standard",
    );
  } finally {
    axios.post = originalPost;
  }

  expect(capturedUrl).toBe(
    "http://localhost:7555/proxy/www.pathofexile.com/api/trade2/exchange/poe2/Standard",
  );
  expect(capturedPayload).toEqual({
    query: {
      status: { option: "online" },
      have: ["exalted", "divine"],
      want: ["chaos"],
    },
    sort: { have: "asc" },
    engine: "new",
  });
});

test("caches official trade static metadata within one client", async () => {
  const client = new Poe2TradeClient();
  const originalGet = axios.get;
  let requestCount = 0;
  Object.assign(client, {
    requests: { run: (request: () => Promise<unknown>) => request() },
  });
  axios.get = (async () => {
    requestCount += 1;
    return {
      data: {
        result: [
          {
            id: "Currency",
            label: "Currency",
            entries: [{ id: "divine", text: "Divine Orb" }],
          },
        ],
      },
    };
  }) as typeof axios.get;

  try {
    const first = await client.getTradeStaticData();
    const second = await client.getTradeStaticData();

    expect(second).toBe(first);
    expect(requestCount).toBe(1);
  } finally {
    axios.get = originalGet;
  }
});

test("cancelling one static metadata wait does not cancel the shared request", async () => {
  const client = new Poe2TradeClient();
  const originalGet = axios.get;
  const controller = new AbortController();
  const staticData: OfficialTradeStaticData = {
    result: [
      {
        id: "Currency",
        label: "Currency",
        entries: [{ id: "divine", text: "Divine Orb" }],
      },
    ],
  };
  let requestCount = 0;
  let receivedSignal: unknown;
  let resolveRequest!: (response: { data: OfficialTradeStaticData }) => void;
  const pendingResponse = new Promise<{ data: OfficialTradeStaticData }>(
    (resolve) => {
      resolveRequest = resolve;
    },
  );
  Object.assign(client, {
    metadataRequests: { run: (request: () => Promise<unknown>) => request() },
  });
  axios.get = (async (...args: Parameters<typeof axios.get>) => {
    requestCount += 1;
    receivedSignal = args[1]?.signal;
    return pendingResponse;
  }) as typeof axios.get;

  try {
    const cancelledWait = client.getTradeStaticData({
      signal: controller.signal,
    });
    const sharedWait = client.getTradeStaticData();
    const cancelledOutcome = cancelledWait.then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({
        status: "rejected" as const,
        name: error instanceof Error ? error.name : "",
      }),
    );

    controller.abort();
    resolveRequest({ data: staticData });

    expect(await cancelledOutcome).toEqual({
      status: "rejected",
      name: "AbortError",
    });
    const sharedData = await sharedWait;
    expect(sharedData).toBe(staticData);
    expect(await client.getTradeStaticData()).toBe(sharedData);
    expect(receivedSignal).toBeUndefined();
    expect(requestCount).toBe(1);
  } finally {
    axios.get = originalGet;
  }
});

test("retries static metadata after a rejected shared request", async () => {
  const client = new Poe2TradeClient();
  const originalGet = axios.get;
  const staticData: OfficialTradeStaticData = {
    result: [
      {
        id: "Currency",
        label: "Currency",
        entries: [{ id: "divine", text: "Divine Orb" }],
      },
    ],
  };
  let requestCount = 0;
  Object.assign(client, {
    metadataRequests: { run: (request: () => Promise<unknown>) => request() },
  });
  axios.get = (async () => {
    requestCount += 1;
    if (requestCount === 1) {
      throw new Error("Static metadata unavailable");
    }
    return { data: staticData };
  }) as typeof axios.get;

  try {
    await expect(client.getTradeStaticData()).rejects.toThrow(
      "Static metadata unavailable",
    );
    expect(await client.getTradeStaticData()).toBe(staticData);
    expect(requestCount).toBe(2);
  } finally {
    axios.get = originalGet;
  }
});

test("uses payment per target unit from one valid offer per seller", () => {
  const response = exchangeSearch([
    listing("seller-a", offer("exalted", 9, "chaos", 3, 10)),
    listing("seller-a", offer("exalted", 1, "chaos", 10, 10)),
    listing("seller-b", offer("exalted", 10, "chaos", 2, 10)),
    listing("seller-c", offer("exalted", 20, "chaos", 4, 10)),
    listing("invalid-offers", [
      offer("divine", 1, "chaos", 1, 1)[0],
      offer("exalted", 2, "alchemy", 1, 1)[0],
    ]),
    listing("wrong-payment", offer("divine", 1, "chaos", 1, 1)),
    listing("wrong-target", offer("exalted", 1, "alchemy", 1, 1)),
    listing("zero-amount", offer("exalted", 0, "chaos", 1, 1)),
    listing("no-stock", offer("exalted", 1, "chaos", 1, 0)),
    listing("", offer("exalted", 1, "chaos", 1, 1)),
  ]);

  expect(getOfficialExchangePrice(response, "chaos", ["exalted"])).toEqual({
    amount: 5,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 3,
    targetTag: "chaos",
  });
});

test("selects matching offers from multi-payment listings without mixing currencies", () => {
  const response = exchangeSearch([
    listing("seller-a", [
      ...offer("divine", 1, "chaos", 2, 10),
      ...offer("exalted", 6, "chaos", 1, 10),
      ...offer("exalted", 4, "chaos", 1, 10),
    ]),
    listing("seller-b", [
      ...offer("divine", 1, "chaos", 2, 10),
      ...offer("exalted", 5, "chaos", 1, 10),
    ]),
    listing("seller-c", [
      ...offer("divine", 1, "chaos", 2, 10),
      ...offer("exalted", 6, "chaos", 1, 10),
    ]),
  ]);

  expect(
    getOfficialExchangePrice(response, "chaos", ["exalted", "divine"]),
  ).toEqual({
    amount: 5,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 3,
    targetTag: "chaos",
  });
});

test("uses one valid exchange seller when the market is thin", () => {
  const response = exchangeSearch([
    listing("only-seller", offer("exalted", 4, "chaos", 1, 10)),
  ]);

  expect(getOfficialExchangePrice(response, "chaos", ["exalted"])).toEqual({
    amount: 4,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 1,
    targetTag: "chaos",
  });
});

test("keeps payment currencies separate in thin markets", () => {
  const mixedResponse = exchangeSearch([
    listing("exalted-a", offer("exalted", 4, "chaos", 1, 10)),
    listing("exalted-b", offer("exalted", 5, "chaos", 1, 10)),
    listing("divine-a", offer("divine", 1, "chaos", 2, 10)),
    listing("divine-b", offer("divine", 1, "chaos", 4, 10)),
  ]);

  expect(
    getOfficialExchangePrice(mixedResponse, "chaos", ["exalted", "divine"]),
  ).toEqual({
    amount: 4.5,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 2,
    targetTag: "chaos",
  });

  const oneCurrencyResponse = exchangeSearch([
    ...Object.values(mixedResponse.result),
    listing("divine-c", offer("divine", 3, "chaos", 6, 10)),
  ]);

  expect(
    getOfficialExchangePrice(oneCurrencyResponse, "chaos", [
      "exalted",
      "divine",
    ]),
  ).toEqual({
    amount: 0.5,
    currency: "divine",
    searchId: "exchange-id",
    sellerCount: 3,
    targetTag: "chaos",
  });
});

test("prefers the strongest reliable payment-currency sample", () => {
  const response = exchangeSearch([
    listing("exalted-a", offer("exalted", 4, "chaos", 1, 10)),
    listing("exalted-b", offer("exalted", 4, "chaos", 1, 10)),
    listing("exalted-c", offer("exalted", 4, "chaos", 1, 10)),
    listing("divine-a", offer("divine", 1, "chaos", 2, 10)),
    listing("divine-b", offer("divine", 1, "chaos", 2, 10)),
    listing("divine-c", offer("divine", 1, "chaos", 2, 10)),
    listing("divine-d", offer("divine", 1, "chaos", 2, 10)),
  ]);

  expect(
    getOfficialExchangePrice(response, "chaos", ["exalted", "divine"]),
  ).toEqual({
    amount: 0.5,
    currency: "divine",
    searchId: "exchange-id",
    sellerCount: 4,
    targetTag: "chaos",
  });
});

test("requires stock that can fulfill the advertised target amount", () => {
  const response = exchangeSearch([
    listing("understocked", offer("exalted", 1, "chaos", 10, 5)),
  ]);

  expect(getOfficialExchangePrice(response, "chaos", ["exalted"])).toBeUndefined();
});

test("keeps each seller's lowest valid unit price", () => {
  const response = exchangeSearch([
    listing("seller-a", offer("exalted", 3, "chaos", 1, 10)),
    listing("SELLER-A", offer("exalted", 1, "chaos", 10, 10)),
    listing("seller-b", offer("exalted", 1, "chaos", 1, 10)),
    listing("seller-c", offer("exalted", 2, "chaos", 1, 10)),
  ]);

  expect(getOfficialExchangePrice(response, "chaos", ["exalted"])).toEqual({
    amount: 1,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 3,
    targetTag: "chaos",
  });
});

test("excludes extreme exchange outliers before reporting seller confidence", () => {
  const response = exchangeSearch([
    listing("seller-a", offer("exalted", 1, "chaos", 1, 10)),
    listing("seller-b", offer("exalted", 1, "chaos", 1, 10)),
    listing("seller-c", offer("exalted", 1, "chaos", 1, 10)),
    listing("seller-d", offer("exalted", 1, "chaos", 1, 10)),
    listing("outlier", offer("exalted", 1000, "chaos", 1, 10)),
  ]);

  expect(getOfficialExchangePrice(response, "chaos", ["exalted"])).toEqual({
    amount: 1,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 4,
    targetTag: "chaos",
  });
});

test("rejects a non-finite unit price while keeping valid sellers", () => {
  const response = exchangeSearch([
    listing("seller-a", offer("exalted", 4, "chaos", 1, 10)),
    listing("seller-b", offer("exalted", 5, "chaos", 1, 10)),
    listing(
      "overflow",
      offer("exalted", Number.MAX_VALUE, "chaos", Number.MIN_VALUE, 1),
    ),
  ]);

  expect(getOfficialExchangePrice(response, "chaos", ["exalted"])).toEqual({
    amount: 4.5,
    currency: "exalted",
    searchId: "exchange-id",
    sellerCount: 2,
    targetTag: "chaos",
  });
});

function exchangeSearch(
  entries: Array<ReturnType<typeof listing>>,
): Poe2ExchangeSearch {
  return {
    id: "exchange-id",
    result: Object.fromEntries(entries.map((entry, index) => [index, entry])),
  } as Poe2ExchangeSearch;
}

function listing(
  seller: string,
  offers: ReturnType<typeof offer>,
) {
  return {
    id: `${seller || "anonymous"}-listing`,
    listing: {
      account: { name: seller },
      offers,
    },
  };
}

function offer(
  paymentTag: string,
  paymentAmount: number,
  targetTag: string,
  targetAmount: number,
  stock: number,
) {
  return [
    {
      exchange: { currency: paymentTag, amount: paymentAmount },
      item: { currency: targetTag, amount: targetAmount, stock },
    },
  ];
}
