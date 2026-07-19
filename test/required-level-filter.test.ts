import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PoeListItem } from "../src/components/PoeListItem";
import { Poe2Item } from "../src/services/types";

test("shows a zero-to-two required-level filter when no requirement exists", () => {
  const item = {
    id: "no-required-level-item",
    listing: {
      indexed: new Date().toISOString(),
      stash: { name: "Shop", x: 0, y: 0 },
      price: { amount: 1, currency: "exalted" },
    },
    item: {
      id: "no-required-level-item",
      icon: "",
      name: "",
      typeLine: "Lapis Amulet",
      baseType: "Lapis Amulet",
      rarity: "Rare",
      ilvl: 1,
      requirements: [],
      properties: [],
      explicitMods: [],
      implicitMods: [],
    },
  } as Poe2Item;

  const markup = renderToStaticMarkup(
    createElement(PoeListItem, { item, league: "Standard" }),
  );

  expect(markup).toContain("Required level");
  expect(markup).toContain('value="0"');
  expect(markup).toContain('value="2"');
});
