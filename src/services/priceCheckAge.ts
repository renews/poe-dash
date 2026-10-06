const HOUR_MS = 60 * 60 * 1000;

export function getLastPriceCheckLabel(checkedAt?: number, now = Date.now()) {
  if (
    checkedAt === undefined ||
    !Number.isFinite(checkedAt) ||
    checkedAt <= 0
  ) {
    return undefined;
  }
  const elapsed = now - checkedAt;
  if (elapsed <= HOUR_MS) return undefined;

  const hours = Math.floor(elapsed / HOUR_MS);
  const amount = hours >= 24 ? Math.floor(hours / 24) : hours;
  const unit = hours >= 24 ? "day" : "hour";
  return `Last checked ${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}
