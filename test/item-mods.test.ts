import { expect, test } from "bun:test";
import {
  formatItemMod,
  getItemModifierHash,
  getModifierDisplayKind,
  Poe2Item,
} from "../src/services/types";

test("formats structured Path of Exile 2 modifiers for display", () => {
  expect(
    formatItemMod({
      description: "+5 to Spirit",
      hash: "stat_hash",
      mods: [],
    }),
  ).toBe("+5 to Spirit");
});

test("classifies explicit modifiers by prefix and suffix tier", () => {
  const item = {
    item: {
      extended: {
        mods: {
          explicit: [{ tier: "P1" }, { tier: "S1" }],
        },
      },
    },
  } as Poe2Item;

  expect(getModifierDisplayKind(item, "explicit", 0)).toBe("prefix");
  expect(getModifierDisplayKind(item, "explicit", 1)).toBe("suffix");
});

test("normalizes comparable modifier hashes for strike-through matching", () => {
  const item = {
    item: {
      extended: {
        hashes: {
          explicit: [["stat.explicit.stat_123", []]],
        },
      },
    },
  } as Poe2Item;

  expect(getItemModifierHash(item, "explicit", 0)).toBe("explicit.stat_123");
});
