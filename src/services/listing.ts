import { formatDateTime } from "./types";

export type ListingAgeStatus = "unknown" | "recent" | "aging" | "stale";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function getListingAgeInDays(indexed?: string, now = Date.now()) {
  const timestamp = Date.parse(indexed || "");
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return Math.floor(Math.max(0, now - timestamp) / MILLISECONDS_PER_DAY);
}

export function getListingSinceDateTime(indexed?: string) {
  const timestamp = Date.parse(indexed || "");
  return Number.isFinite(timestamp) ? formatDateTime(timestamp) : undefined;
}

export function getListingSinceLabel(indexed?: string) {
  const dateTime = getListingSinceDateTime(indexed);
  return dateTime ? `On sale since: ${dateTime}` : undefined;
}

export function getListingAge(indexed?: string, now = Date.now()) {
  const timestamp = Date.parse(indexed || "");
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `${elapsedDays}d`;
  }

  if (elapsedDays < 365) {
    return `${Math.floor(elapsedDays / 30)}mo`;
  }

  return `${Math.floor(elapsedDays / 365)}y`;
}

export function getListingAgeStatus(
  indexed?: string,
  now = Date.now(),
): ListingAgeStatus {
  const elapsedDays = getListingAgeInDays(indexed, now);
  if (elapsedDays === undefined) {
    return "unknown";
  }
  if (elapsedDays > 9) {
    return "stale";
  }
  if (elapsedDays > 4) {
    return "aging";
  }

  return "recent";
}
