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
        },
        invalid: { explicit: "not-an-array", implicit: [] },
      }),
    ),
  ).toEqual({
    "item-1": {
      explicit: [true, false],
      implicit: [true],
      itemLevel: true,
    },
  });
});

test("returns no selections for missing or invalid storage", () => {
  expect(parseModifierSelections(null)).toEqual({});
  expect(parseModifierSelections("not-json")).toEqual({});
  expect(parseModifierSelections(JSON.stringify([]))).toEqual({});
});
