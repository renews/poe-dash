import { expect, test } from "bun:test";
import { NewItemTracker } from "../src/services/NewItemTracker";
import { Poe2Item } from "../src/services/types";

const item = (id: string) => ({ id }) as Poe2Item;

test("only reports items added after the current account baseline", () => {
  const tracker = new NewItemTracker();

  expect(tracker.update("Account:Standard", [item("a")])).toEqual([]);
  expect(
    tracker.update("Account:Standard", [item("a"), item("b")]),
  ).toEqual([item("b")]);
  expect(
    tracker.update("Account:Standard", [item("a"), item("b")]),
  ).toEqual([]);
});

test("treats a relisted item as new but suppresses sync and scope baselines", () => {
  const tracker = new NewItemTracker();

  tracker.update("Account:Standard", [item("a")]);
  expect(tracker.update("Account:Standard", [])).toEqual([]);
  expect(tracker.update("Account:Standard", [item("a")])).toEqual([
    item("a"),
  ]);
  expect(
    tracker.update("Account:Standard", [item("a"), item("b")], true),
  ).toEqual([]);
  expect(
    tracker.update("Other:Standard", [item("a"), item("b"), item("c")]),
  ).toEqual([]);
});
