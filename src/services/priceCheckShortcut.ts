export const DEFAULT_PRICE_CHECK_SHORTCUT = "Ctrl+D";

const SUPPORTED_KEYCODES = {
  "0": 11,
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 6,
  "6": 7,
  "7": 8,
  "8": 9,
  "9": 10,
  A: 30,
  B: 48,
  C: 46,
  D: 32,
  E: 18,
  F: 33,
  G: 34,
  H: 35,
  I: 23,
  J: 36,
  K: 37,
  L: 38,
  M: 50,
  N: 49,
  O: 24,
  P: 25,
  Q: 16,
  R: 19,
  S: 31,
  T: 20,
  U: 22,
  V: 47,
  W: 17,
  X: 45,
  Y: 21,
  Z: 44,
  F1: 59,
  F2: 60,
  F3: 61,
  F4: 62,
  F5: 63,
  F6: 64,
  F7: 65,
  F8: 66,
  F9: 67,
  F10: 68,
  F11: 87,
  F12: 88,
} as const;

export type PriceCheckShortcutKey = keyof typeof SUPPORTED_KEYCODES;

export interface PriceCheckShortcutBinding {
  label: string;
  key: PriceCheckShortcutKey;
  keycode: number;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

interface KeyboardShortcutEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

function normalizeShortcutKey(value: string) {
  const key = value.trim().toUpperCase();
  return key in SUPPORTED_KEYCODES ? (key as PriceCheckShortcutKey) : undefined;
}

function buildShortcutBinding(value: {
  key: PriceCheckShortcutKey;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): PriceCheckShortcutBinding | undefined {
  if (!value.ctrlKey && !value.altKey && !value.metaKey) {
    return undefined;
  }

  const modifiers = [
    value.ctrlKey ? "Ctrl" : undefined,
    value.altKey ? "Alt" : undefined,
    value.metaKey ? "Meta" : undefined,
    value.shiftKey ? "Shift" : undefined,
  ].filter((modifier): modifier is string => Boolean(modifier));

  return {
    ...value,
    label: [...modifiers, value.key].join("+"),
    keycode: SUPPORTED_KEYCODES[value.key],
  };
}

export function parsePriceCheckShortcut(
  value: string,
): PriceCheckShortcutBinding | undefined {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  let key: PriceCheckShortcutKey | undefined;

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === "ctrl" || normalized === "control") {
      modifiers.add("ctrl");
    } else if (normalized === "alt" || normalized === "option") {
      modifiers.add("alt");
    } else if (
      normalized === "meta" ||
      normalized === "cmd" ||
      normalized === "command" ||
      normalized === "super"
    ) {
      modifiers.add("meta");
    } else if (normalized === "shift") {
      modifiers.add("shift");
    } else {
      const nextKey = normalizeShortcutKey(part);
      if (!nextKey || key) {
        return undefined;
      }
      key = nextKey;
    }
  }

  if (!key) {
    return undefined;
  }

  return buildShortcutBinding({
    key,
    ctrlKey: modifiers.has("ctrl"),
    altKey: modifiers.has("alt"),
    metaKey: modifiers.has("meta"),
    shiftKey: modifiers.has("shift"),
  });
}

export function shortcutFromKeyboardEvent(event: KeyboardShortcutEvent) {
  const key = normalizeShortcutKey(event.key);
  if (!key) {
    return undefined;
  }

  return buildShortcutBinding({
    key,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  })?.label;
}

export const DEFAULT_PRICE_CHECK_SHORTCUT_BINDING = parsePriceCheckShortcut(
  DEFAULT_PRICE_CHECK_SHORTCUT,
) as PriceCheckShortcutBinding;
