import { expect, test } from "bun:test";
import { parseModifierSelections } from "../src/contexts/AppContext";

test("restores valid modifier selections and ignores invalid saved entries", () => {
  expect(
    parseModifierSelections(
      JSON.stringify({
        "item-1": {
          explicit: [true, false],
          implicit: [true],
          itemLevel: true,
          requiredLevel: true,
          requiredLevelMin: 60,
          requiredLevelMax: 70,
        },
        invalid: { explicit: "not-an-array", implicit: [] },
      }),
    ),
  ).toEqual({
    "item-1": {
      explicit: [true, false],
      implicit: [true],
      itemLevel: true,
      requiredLevel: true,
      requiredLevelMin: 60,
      requiredLevelMax: 70,
    },
  });
});

test("ignores saved modifier selections with invalid requirement ranges", () => {
  expect(
    parseModifierSelections(
      JSON.stringify({
        invalid: {
          explicit: [],
          implicit: [],
          requiredLevel: true,
          requiredLevelMin: "sixty",
        },
      }),
    ),
  ).toEqual({});
});

test("returns no selections for missing or invalid storage", () => {
  expect(parseModifierSelections(null)).toEqual({});
  expect(parseModifierSelections("not-json")).toEqual({});
  expect(parseModifierSelections(JSON.stringify([]))).toEqual({});
});
