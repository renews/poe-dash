import { formatDateTime } from "./types";

export function getListingSinceLabel(indexed?: string) {
  const timestamp = Date.parse(indexed || "");
  return Number.isFinite(timestamp)
    ? `On sale since: ${formatDateTime(timestamp)}`
    : undefined;
}
