import { expect, test } from "bun:test";
import {
  getListingAge,
  getListingAgeStatus,
  getListingSinceDateTime,
  getListingSinceLabel,
} from "../src/services/listing";

test("formats the listing timestamp in local date and time", () => {
  const localTime = new Date(2026, 6, 18, 14, 30);

  expect(getListingSinceLabel(localTime.toISOString())).toBe(
    "On sale since: 07.18.2026 14:30",
  );
  expect(getListingSinceLabel("not-a-date")).toBeUndefined();
  expect(getListingSinceLabel(undefined)).toBeUndefined();
});

test("formats the listing timestamp for a compact table cell", () => {
  const localTime = new Date(2026, 6, 18, 14, 30);

  expect(getListingSinceDateTime(localTime.toISOString())).toBe(
    "07.18.2026 14:30",
  );
  expect(getListingSinceDateTime(undefined)).toBeUndefined();
});

test("formats a compact elapsed age without losing the exact timestamp", () => {
  const now = new Date(2026, 6, 20, 14, 30).getTime();

  expect(
    getListingAge(new Date(2026, 6, 20, 14, 29, 15).toISOString(), now),
  ).toBe("45s");
  expect(getListingAge(new Date(2026, 6, 20, 12, 30).toISOString(), now)).toBe(
    "2h",
  );
  expect(getListingAge(new Date(2026, 6, 18, 14, 30).toISOString(), now)).toBe(
    "2d",
  );
  expect(getListingAge("not-a-date", now)).toBeUndefined();
});

test("classifies displayed listing days at the warning boundaries", () => {
  const now = new Date(2026, 6, 20, 14, 30).getTime();
  const daysAgo = (days: number, hours = 0) =>
    new Date(now - (days * 24 + hours) * 60 * 60 * 1000).toISOString();

  expect(getListingAgeStatus(daysAgo(4, 23), now)).toBe("recent");
  expect(getListingAgeStatus(daysAgo(5), now)).toBe("aging");
  expect(getListingAgeStatus(daysAgo(9, 23), now)).toBe("aging");
  expect(getListingAgeStatus(daysAgo(10), now)).toBe("stale");
  expect(getListingAgeStatus("not-a-date", now)).toBe("unknown");
});
