export type DesktopPriceAlert = {
  kind: "underpriced" | "overpriced";
  title: string;
  body: string;
};

export function parsePriceAlertPayload(
  value: unknown,
): DesktopPriceAlert | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const payload = value as Partial<DesktopPriceAlert>;
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (
    (payload.kind !== "underpriced" && payload.kind !== "overpriced") ||
    !title ||
    title.length > 120 ||
    !body ||
    body.length > 300
  ) {
    return undefined;
  }

  return { kind: payload.kind, title, body };
}
