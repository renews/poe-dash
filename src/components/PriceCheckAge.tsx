import { useEffect, useState } from "react";
import type { Estimate } from "../services/PriceEstimator";
import { getLastPriceCheckLabel } from "../services/priceCheckAge";

export function PriceCheckAge({
  estimate,
}: {
  estimate?: Pick<Estimate, "checkedAt" | "provisional">;
}) {
  const checkedAt = estimate?.provisional ? undefined : estimate?.checkedAt;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!checkedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [checkedAt]);

  const label = getLastPriceCheckLabel(checkedAt, now);
  return label && checkedAt ? (
    <time
      dateTime={new Date(checkedAt).toISOString()}
      className="block text-xs text-gray-400"
    >
      {label}
    </time>
  ) : null;
}
