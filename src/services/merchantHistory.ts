export type MerchantHistoryRaw = Record<string, unknown>;

export interface MerchantHistoryEntry {
  id: string;
  timestamp: string | number;
  itemId?: string;
  itemName: string;
  itemTypeLine: string;
  item: MerchantHistoryRaw;
  itemIcon?: string;
  amount?: number;
  currency: string;
  buyer?: string;
  note?: string;
  raw: MerchantHistoryRaw;
}

function asRecord(value: unknown): MerchantHistoryRaw | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MerchantHistoryRaw)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  const record = asRecord(value);
  return asString(record?.description) || asString(record?.name);
}

function formatValues(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return formatValue(value);
  }

  return value
    .map((entry) => (Array.isArray(entry) ? entry[0] : entry))
    .map(formatValue)
    .filter((entry): entry is string => Boolean(entry))
    .join(", ");
}

function getExplicitModGroup(item: MerchantHistoryRaw, index: number) {
  const extended = asRecord(item.extended);
  const extendedMods = asRecord(extended?.mods);
  const mods = Array.isArray(extendedMods?.explicit)
    ? extendedMods.explicit
    : [];
  const mod = asRecord(mods[index]);
  const tier = asString(mod?.tier)?.toLowerCase();

  if (tier?.startsWith("p") || tier?.includes("prefix")) {
    return "Prefix";
  }

  if (tier?.startsWith("s") || tier?.includes("suffix")) {
    return "Suffix";
  }

  return undefined;
}

function getItem(row: MerchantHistoryRaw): MerchantHistoryRaw {
  return (
    asRecord(row.item) ||
    asRecord(asRecord(row.data)?.item) ||
    row
  );
}

export function extractMerchantHistoryRows(payload: unknown): MerchantHistoryRaw[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is MerchantHistoryRaw => !!asRecord(row));
  }

  const response = asRecord(payload);
  if (!response) {
    return [];
  }

  const nestedData = asRecord(response.data);
  const source = nestedData || response;
  const rows = source.result ?? source.entries;

  return Array.isArray(rows)
    ? rows.filter((row): row is MerchantHistoryRaw => !!asRecord(row))
    : [];
}

export function normalizeMerchantHistoryRow(
  row: MerchantHistoryRaw,
  index = 0,
): MerchantHistoryEntry {
  const item = getItem(row);
  const price = asRecord(row.price);
  const timestamp = row.time ?? row.listedAt ?? row.date ?? "";
  const itemId =
    asString(row.item_id) ||
    asString(row.itemId) ||
    asString(item.id);
  const itemName =
    asString(item.name) ||
    asString(item.typeLine) ||
    asString(item.baseType) ||
    "Unknown item";
  const itemTypeLine = asString(item.typeLine) || itemName;
  const amount =
    asNumber(price?.amount) ??
    asNumber(row.amount);
  const currency =
    asString(price?.currency) ||
    asString(row.currency) ||
    "Unknown currency";
  const buyer =
    asString(row.buyer) ||
    asString(row.characterName) ||
    asString(row.account);
  const note = asString(row.note) || asString(price?.raw);

  return {
    id: `${itemId || itemName}##${String(timestamp || index)}`,
    timestamp: typeof timestamp === "number" || typeof timestamp === "string"
      ? timestamp
      : "",
    itemId,
    itemName,
    itemTypeLine,
    item,
    itemIcon: asString(item.icon) || asString(item.iconUrl),
    amount,
    currency,
    buyer,
    note,
    raw: row,
  };
}

export interface MerchantHistoryTooltipSection {
  title: string;
  lines: string[];
}

export interface MerchantHistoryTooltipDetails {
  title: string;
  subtitle: string;
  metadata: string[];
  sections: MerchantHistoryTooltipSection[];
  sale: string;
}

export function getMerchantHistoryItemTooltipDetails(
  entry: MerchantHistoryEntry,
): MerchantHistoryTooltipDetails {
  const rarity = asString(entry.item.rarity);
  const typeLine = entry.itemTypeLine || asString(entry.item.baseType);
  const metadata: string[] = [];

  const itemLevel = entry.item.ilvl ?? entry.item.itemLevel;
  if (typeof itemLevel === "number" || typeof itemLevel === "string") {
    metadata.push(`Item level: ${itemLevel}`);
  }

  const gemLevel = entry.item.gemLevel;
  if (typeof gemLevel === "number" || typeof gemLevel === "string") {
    metadata.push(`Gem level: ${gemLevel}`);
  }

  const quality = entry.item.quality;
  if (typeof quality === "number" || typeof quality === "string") {
    metadata.push(`Quality: ${quality}%`);
  }

  if (entry.item.corrupted === true) {
    metadata.push("Corrupted");
  }

  const sections: MerchantHistoryTooltipSection[] = [];
  const properties = Array.isArray(entry.item.properties)
    ? entry.item.properties
        .map((property) => {
          const record = asRecord(property);
          const name = asString(record?.name);
          const values = formatValues(record?.values);
          return name && values ? `${name}: ${values}` : undefined;
        })
        .filter((property): property is string => Boolean(property))
    : [];
  if (properties.length) {
    sections.push({ title: "Properties", lines: properties });
  }

  for (const [label, field] of [
    ["Implicit", "implicitMods"],
    ["Enchant", "enchantMods"],
    ["Rune", "runeMods"],
  ] as const) {
    const mods = Array.isArray(entry.item[field])
      ? entry.item[field]
          .map(formatValue)
          .filter((mod): mod is string => Boolean(mod))
      : [];
    if (mods.length) {
      sections.push({ title: label, lines: mods });
    }
  }

  const explicitMods = Array.isArray(entry.item.explicitMods)
    ? entry.item.explicitMods
        .map((mod, index) => ({
          text: formatValue(mod),
          group: getExplicitModGroup(entry.item, index),
        }))
        .filter(
          (mod): mod is { text: string; group: string | undefined } =>
            Boolean(mod.text),
        )
    : [];
  const prefixes = explicitMods
    .filter((mod) => mod.group === "Prefix")
    .map((mod) => mod.text);
  const suffixes = explicitMods
    .filter((mod) => mod.group === "Suffix")
    .map((mod) => mod.text);
  const ungrouped = explicitMods
    .filter((mod) => !mod.group)
    .map((mod) => mod.text);

  if (prefixes.length) {
    sections.push({ title: "Prefixes", lines: prefixes });
  }
  if (suffixes.length) {
    sections.push({ title: "Suffixes", lines: suffixes });
  }
  if (ungrouped.length) {
    sections.push({ title: "Other modifiers", lines: ungrouped });
  }

  if (Array.isArray(entry.item.sockets) && entry.item.sockets.length) {
    metadata.push(`Sockets: ${entry.item.sockets.length}`);
  }

  const sale = entry.amount !== undefined
    ? `Sold for: ${entry.amount} ${entry.currency}`
    : `Sold for: ${entry.currency}`;

  return {
    title: entry.itemName,
    subtitle: [rarity, typeLine].filter(Boolean).join(" "),
    metadata,
    sections,
    sale,
  };
}

export function formatMerchantHistoryItemTooltip(
  entry: MerchantHistoryEntry,
) {
  const details = getMerchantHistoryItemTooltipDetails(entry);
  const lines = [details.title, details.subtitle, ...details.metadata];

  for (const section of details.sections) {
    lines.push(section.title, ...section.lines);
  }

  lines.push(details.sale);
  return lines.filter(Boolean).join("\n");
}

export function filterMerchantHistory(
  entries: MerchantHistoryEntry[],
  searchTerm: string,
) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) {
    return entries;
  }

  return entries.filter((entry) =>
    [
      entry.itemName,
      entry.itemTypeLine,
      entry.currency,
      entry.buyer,
      entry.note,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}
