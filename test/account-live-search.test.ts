import axios from "axios";
import { expect, test } from "bun:test";
import { Poe2TradeClient } from "../src/services/Poe2TradeClient";

test("creates an account-only live search without a minimum buyout", async () => {
  const client = new Poe2TradeClient();
  const originalPost = axios.post;
  let capturedPayload: unknown;

  axios.post = (async (...args: Parameters<typeof axios.post>) => {
    capturedPayload = args[1];
    return {
      data: { id: "live-query", complexity: 0, result: [], total: 0 },
    };
  }) as unknown as typeof axios.post;

  try {
    await client.getAccountLiveSearch("Account#1234", "Standard");
  } finally {
    axios.post = originalPost;
  }

  expect(capturedPayload).toEqual({
    query: {
      filters: {
        trade_filters: {
          filters: { account: { input: "Account#1234" } },
        },
      },
    },
    sort: { indexed: "desc" },
  });
});
