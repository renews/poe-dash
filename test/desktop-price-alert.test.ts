import { expect, test } from "bun:test";
import { parsePriceAlertPayload } from "../electron/app/priceAlert";

test("accepts only bounded underpriced and overpriced alert payloads", () => {
  expect(
    parsePriceAlertPayload({
      kind: "underpriced",
      title: " Potentially underpriced: Doom Loop ",
      body: " Listed: 80 exalted ",
    }),
  ).toEqual({
    kind: "underpriced",
    title: "Potentially underpriced: Doom Loop",
    body: "Listed: 80 exalted",
  });
  expect(
    parsePriceAlertPayload({ kind: "fair", title: "No", body: "No" }),
  ).toBeUndefined();
  expect(
    parsePriceAlertPayload({
      kind: "overpriced",
      title: "x".repeat(121),
      body: "Too long",
    }),
  ).toBeUndefined();
  expect(parsePriceAlertPayload(null)).toBeUndefined();
});
