import { ModifierTierLabel } from "../services/types";

export function ModifierTierBadges(props: { tiers: ModifierTierLabel[] }) {
  if (!props.tiers.length) {
    return null;
  }

  return (
    <span className="modifier-tier-badges">
      {props.tiers.map(({ token, label }, index) => (
        <span
          key={`${token}-${index}`}
          className="modifier-tier-badge"
          aria-label={label}
          title={label}
        >
          {token}
        </span>
      ))}
    </span>
  );
}
