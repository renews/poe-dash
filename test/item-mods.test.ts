import { expect, test } from "bun:test";
import {
  formatItemMod,
  getItemModifierHash,
  getItemModifierTierLabels,
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
      explicitMods: [
        { description: "+100 to maximum Life", hash: "life", mods: [{ tier: "P1" }] },
        { description: "+30% to Fire Resistance", hash: "fire", mods: [{ tier: "S1" }] },
      ],
    },
  } as Poe2Item;

  expect(getModifierDisplayKind(item, "explicit", 0)).toBe("prefix");
  expect(getModifierDisplayKind(item, "explicit", 1)).toBe("suffix");
});

test("preserves every authoritative modifier tier on a display line", () => {
  const mod = {
    description: "+120 to maximum Life and +10% to Fire Resistance",
    hash: "stat.explicit.stat_mixed",
    mods: [{ tier: "P3" }, { tier: "S1" }],
  };
  const item = {
    item: {
      explicitMods: [mod],
      extended: { mods: {}, hashes: {} },
    },
  } as Poe2Item;

  expect(getItemModifierTierLabels(item, "explicit", 0, mod)).toEqual([
    { token: "P3", label: "Prefix tier 3" },
    { token: "S1", label: "Suffix tier 1" },
  ]);
  expect(getModifierDisplayKind(item, "explicit", 0)).toBe("explicit");
});

test("joins tier metadata by modifier hash when structured details are absent", () => {
  const item = {
    item: {
      explicitMods: ["+100 to maximum Life"],
      extended: {
        hashes: { explicit: [["stat.explicit.stat_life", []]] },
        mods: {
          explicit: [
            {
              tier: "P2",
              magnitudes: [{ hash: "explicit.stat_life" }],
            },
          ],
        },
      },
    },
  } as Poe2Item;

  expect(getItemModifierTierLabels(item, "explicit", 0)).toEqual([
    { token: "P2", label: "Prefix tier 2" },
  ]);
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
