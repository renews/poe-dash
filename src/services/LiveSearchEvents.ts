export function parseLiveSearchItemIds(message: string) {
  try {
    const value: unknown = JSON.parse(message);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }

    const ids = (value as { new?: unknown }).new;
    if (!Array.isArray(ids)) {
      return [];
    }

    return [
      ...new Set(
        ids
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}
