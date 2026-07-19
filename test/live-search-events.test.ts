import { expect, test } from "bun:test";
import { parseLiveSearchItemIds } from "../src/services/LiveSearchEvents";

test("extracts valid item ids from live-search messages", () => {
  expect(parseLiveSearchItemIds('{"new":["a","b","a"]}')).toEqual([
    "a",
    "b",
  ]);
  expect(parseLiveSearchItemIds('{"new":["",1,null]}')).toEqual([]);
  expect(parseLiveSearchItemIds("not json")).toEqual([]);
  expect(parseLiveSearchItemIds('{"gone":["a"]}')).toEqual([]);
});
