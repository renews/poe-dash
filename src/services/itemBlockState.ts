export const ITEM_BLOCK_STATES_STORAGE_KEY = "itemBlockStates";

export type ItemBlockStateStorage = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): ItemBlockStateStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function loadItemBlockStates(
  storage: ItemBlockStateStorage | undefined,
): Record<string, boolean> {
  const value = storage?.getItem(ITEM_BLOCK_STATES_STORAGE_KEY);
  if (!value) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] =>
          typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function getItemBlockExpanded(
  itemId: string,
  storage: ItemBlockStateStorage | undefined = getBrowserStorage(),
) {
  return loadItemBlockStates(storage)[itemId] ?? true;
}

export function setItemBlockExpanded(
  itemId: string,
  expanded: boolean,
  storage: ItemBlockStateStorage | undefined = getBrowserStorage(),
) {
  if (!storage) {
    return;
  }

  const states = loadItemBlockStates(storage);
  states[itemId] = expanded;
  storage.setItem(ITEM_BLOCK_STATES_STORAGE_KEY, JSON.stringify(states));
}
