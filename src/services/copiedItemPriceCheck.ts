import { parseCopiedItemText } from "./copiedItemParser";
import { completeModifierSelection } from "./modifierSelection";
import {
  DEFAULT_MINIMUM_INDEPENDENT_SELLERS,
  Estimate,
  PriceChecker,
  type PriceEstimateRequestOptions,
} from "./PriceEstimator";
import type { ModifierSelection, Poe2Item } from "./types";

type EstimateItemPrice = (
  item: Poe2Item,
  league: string,
  selection: CopiedItemModifierSelection,
  modifierRangePercent: number,
  options?: PriceEstimateRequestOptions,
) => Promise<Estimate>;

export type CopiedItemModifierSelection = ModifierSelection & {
  enchant: boolean[];
};

type CopiedItemModifierSelectionInput = ModifierSelection & {
  enchant?: boolean[];
};

interface CopiedItemPriceCheckOptions {
  itemText: string;
  league: string;
  modifierRangePercent: number;
  selection?: CopiedItemModifierSelectionInput;
  signal?: AbortSignal;
  estimateItemPrice?: EstimateItemPrice;
}

export async function checkCopiedItemPrice(
  options: CopiedItemPriceCheckOptions,
) {
  const item = parseCopiedItemText(options.itemText);
  item.item.league = options.league;
  const completeSelection = completeModifierSelection(item, options.selection);
  const selection: CopiedItemModifierSelection = {
    ...completeSelection,
    explicit: [...completeSelection.explicit],
    implicit: [...completeSelection.implicit],
    enchant: [
      ...(options.selection?.enchant ||
        (item.item.enchantMods || []).map(() => true)),
    ],
  };
  const parsedModifiers = PriceChecker.parseItemMods(item);
  for (const modifier of parsedModifiers.unresolved) {
    selection[modifier.section][modifier.sourceIndex] = false;
  }
  const estimateItemPrice =
    options.estimateItemPrice ||
    ((...args: Parameters<EstimateItemPrice>) =>
      PriceChecker.estimateItemPrice(...args));
  const estimate = await estimateItemPrice(
    item,
    options.league,
    selection,
    options.modifierRangePercent,
    {
      signal: options.signal,
      applyListingContext: false,
      recordResult: false,
      minimumIndependentSellers: DEFAULT_MINIMUM_INDEPENDENT_SELLERS,
      maxTradeListings: 100,
    },
  );

  return { item, selection, estimate };
}
