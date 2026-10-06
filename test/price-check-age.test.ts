import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getLastPriceCheckLabel } from "../src/services/priceCheckAge";
import { PriceCheckAge } from "../src/components/PriceCheckAge";

const hour = 60 * 60 * 1000;
const checkedAt = 100 * hour;

test("shows elapsed time only after a completed check is more than an hour old", () => {
  expect(
    getLastPriceCheckLabel(checkedAt, checkedAt + hour - 1),
  ).toBeUndefined();
  expect(getLastPriceCheckLabel(checkedAt, checkedAt + hour)).toBeUndefined();
  expect(getLastPriceCheckLabel(checkedAt, checkedAt + hour + 1)).toBe(
    "Last checked 1 hour ago",
  );
  expect(getLastPriceCheckLabel(checkedAt, checkedAt + 2 * hour)).toBe(
    "Last checked 2 hours ago",
  );
  expect(getLastPriceCheckLabel(checkedAt, checkedAt + 24 * hour)).toBe(
    "Last checked 1 day ago",
  );
  expect(getLastPriceCheckLabel(checkedAt, checkedAt + 48 * hour)).toBe(
    "Last checked 2 days ago",
  );
});

test("does not label missing, invalid, or future check times", () => {
  for (const value of [undefined, NaN, Infinity, -1, 0, checkedAt + hour]) {
    expect(getLastPriceCheckLabel(value, checkedAt)).toBeUndefined();
  }
});

test("does not display age for fresh or provisional suggestions", () => {
  expect(
    renderToStaticMarkup(
      createElement(PriceCheckAge, { estimate: { checkedAt: Date.now() } }),
    ),
  ).toBe("");
  expect(
    renderToStaticMarkup(
      createElement(PriceCheckAge, {
        estimate: {
          checkedAt: Date.now() - 2 * hour,
          provisional: true,
        },
      }),
    ),
  ).toBe("");
});
