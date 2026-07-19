import { Poe2Item } from "./types";

export class NewItemTracker {
  private scope: string | undefined;
  private knownItemIds = new Set<string>();

  update(scope: string, items: Poe2Item[], suppressAlerts = false) {
    const currentItemIds = new Set(items.map((item) => item.id));
    const scopeChanged = this.scope !== scope;

    if (scopeChanged || suppressAlerts) {
      this.scope = scope;
      this.knownItemIds = currentItemIds;
      return [];
    }

    const addedItems = items.filter((item) => !this.knownItemIds.has(item.id));
    this.knownItemIds = currentItemIds;
    return addedItems;
  }
}
