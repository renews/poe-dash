import { expect, test } from "bun:test";
import {
  getItemBlockExpanded,
  ITEM_BLOCK_STATES_STORAGE_KEY,
  ItemBlockStateStorage,
  setItemBlockExpanded,
} from "../src/services/itemBlockState";

function createStorage(initialValue?: string): ItemBlockStateStorage {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set(ITEM_BLOCK_STATES_STORAGE_KEY, initialValue);
  }

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("opens new items and ignores malformed saved block states", () => {
  expect(getItemBlockExpanded("new-item", createStorage())).toBe(true);
  expect(
    getItemBlockExpanded("new-item", createStorage("not-json")),
  ).toBe(true);
  expect(
    getItemBlockExpanded(
      "new-item",
      createStorage(JSON.stringify({ "other-item": "collapsed" })),
    ),
  ).toBe(true);
});

test("persists each item's expanded state without replacing other items", () => {
  const storage = createStorage();

  setItemBlockExpanded("item-a", false, storage);
  setItemBlockExpanded("item-b", false, storage);
  setItemBlockExpanded("item-a", true, storage);

  expect(getItemBlockExpanded("item-a", storage)).toBe(true);
  expect(getItemBlockExpanded("item-b", storage)).toBe(false);
  expect(
    JSON.parse(storage.getItem(ITEM_BLOCK_STATES_STORAGE_KEY) || "{}"),
  ).toEqual({ "item-a": true, "item-b": false });
});
