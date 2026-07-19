import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LiveMonitor from "../src/components/LiveMonitor";

test("keeps elapsed monitor time out of the visible session summary", () => {
  const markup = renderToStaticMarkup(
    createElement(LiveMonitor, {
      items: [],
      priceSuggestions: {},
      league: "Standard",
    }),
  );

  expect(markup).not.toContain("Time elapsed");
  expect(markup).toContain("Number of drops");
});
