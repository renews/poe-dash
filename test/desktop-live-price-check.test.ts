import { expect, test } from "bun:test";
import {
  capturePoeItemText,
  createBufferedPriceCheckChannel,
  createPriceCheckShortcutTracker,
  isPriceCheckShortcutEvent,
  isPoeItemText,
  isPathOfExileForegroundWindow,
  pressPoeCopyShortcut,
} from "../electron/app/priceCheckClipboard";
import { getLivePriceCheckPlatformIssue } from "../electron/app/foregroundWindow";
import {
  DEFAULT_PRICE_CHECK_SHORTCUT,
  parsePriceCheckShortcut,
  shortcutFromKeyboardEvent,
} from "../src/services/priceCheckShortcut";

const OLD_ITEM = `Item Class: Rings
Rarity: Rare
Old Grip
Iron Ring
--------
Item Level: 20`;

const NEW_ITEM = `Item Class: Rings
Rarity: Rare
New Grip
Amethyst Ring
--------
Item Level: 74`;

test("captures only newly copied Path of Exile item text", async () => {
  let clipboard = OLD_ITEM;
  const writes: string[] = [];

  const captured = await capturePoeItemText({
    readText: () => clipboard,
    writeText: (text) => {
      writes.push(text);
      clipboard = text;
    },
    pressCopy: () => {
      clipboard = NEW_ITEM;
    },
    wait: async () => {},
  });

  expect(captured).toBe(NEW_ITEM);
  expect(writes).toEqual([""]);
  expect(isPoeItemText("my clipboard secret")).toBe(false);
  expect(isPoeItemText(NEW_ITEM)).toBe(true);
});

test("restores the clipboard when the game does not provide an item", async () => {
  let clipboard = "notes to preserve";

  await expect(
    capturePoeItemText(
      {
        readText: () => clipboard,
        writeText: (text) => {
          clipboard = text;
        },
        pressCopy: () => {},
        wait: async () => {},
      },
      { pollIntervalMs: 50, timeoutMs: 100 },
    ),
  ).rejects.toThrow("No Path of Exile item was copied");
  expect(clipboard).toBe("notes to preserve");
});

test("restores the clipboard when native copy injection fails", async () => {
  let clipboard = OLD_ITEM;

  await expect(
    capturePoeItemText({
      readText: () => clipboard,
      writeText: (text) => {
        clipboard = text;
      },
      pressCopy: async () => {
        throw new Error("native copy failed");
      },
      wait: async () => {},
    }),
  ).rejects.toThrow("native copy failed");
  expect(clipboard).toBe(OLD_ITEM);
});

test("releases the price-check combo before sending one copy action", async () => {
  const events: string[] = [];

  await pressPoeCopyShortcut({
    keyUp: (key) => events.push(`up:${key}`),
    keyDown: (key) => events.push(`down:${key}`),
    keyTap: (key) => events.push(`tap:${key}`),
    wait: async () => {},
  });

  expect(events).toEqual(["up:D", "up:Ctrl", "down:Ctrl", "tap:C", "up:Ctrl"]);
});

test("releases Ctrl when native copy injection throws", async () => {
  const events: string[] = [];

  await expect(
    pressPoeCopyShortcut({
      keyUp: (key) => events.push(`up:${key}`),
      keyDown: (key) => events.push(`down:${key}`),
      keyTap: (key) => {
        events.push(`tap:${key}`);
        throw new Error("copy injection failed");
      },
      wait: async () => {},
    }),
  ).rejects.toThrow("copy injection failed");
  expect(events.at(-1)).toBe("up:Ctrl");
});

test("releases the configured key and modifiers before copying", async () => {
  const events: string[] = [];
  const shortcut = parsePriceCheckShortcut("Ctrl+Shift+P");
  expect(shortcut).toBeDefined();

  await pressPoeCopyShortcut(
    {
      keyUp: (key) => events.push(`up:${key}`),
      keyDown: (key) => events.push(`down:${key}`),
      keyTap: (key) => events.push(`tap:${key}`),
      wait: async () => {},
    },
    shortcut,
  );

  expect(events).toEqual([
    "up:P",
    "up:Ctrl",
    "up:Shift",
    "down:Ctrl",
    "tap:C",
    "up:Ctrl",
  ]);
});

test("allows native copy only while Path of Exile is foreground", () => {
  expect(
    isPathOfExileForegroundWindow({
      processName: "PathOfExile2.exe",
      title: "Path of Exile 2",
    }),
  ).toBe(true);
  expect(
    isPathOfExileForegroundWindow({
      processName: "Path of Exile",
      title: "Path of Exile",
    }),
  ).toBe(true);
  expect(
    isPathOfExileForegroundWindow({
      processName: "Google Chrome",
      title: "Path of Exile 2 Trade",
    }),
  ).toBe(false);
  expect(
    isPathOfExileForegroundWindow({
      processName: "firefox",
      title: "Path of Exile Wiki",
    }),
  ).toBe(false);
});

test("observes only an unmodified Ctrl+D chord without reserving a global shortcut", () => {
  expect(
    isPriceCheckShortcutEvent({
      keycode: 32,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    }),
  ).toBe(true);
  expect(
    isPriceCheckShortcutEvent({
      keycode: 32,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: true,
    }),
  ).toBe(false);
  expect(
    isPriceCheckShortcutEvent({
      keycode: 46,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    }),
  ).toBe(false);
});

test("fires once on release after repeated Ctrl+D keydown events", () => {
  let captures = 0;
  const tracker = createPriceCheckShortcutTracker(() => {
    captures += 1;
  });
  const chord = {
    keycode: 32,
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
  };

  tracker.keyDown(chord);
  tracker.keyDown(chord);
  tracker.keyUp({ ...chord, ctrlKey: false });
  tracker.keyUp({ ...chord, ctrlKey: false });

  expect(captures).toBe(1);
});

test("matches a configured modifier chord instead of the default shortcut", () => {
  let captures = 0;
  const shortcut = {
    keycode: 25,
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: true,
  };
  const tracker = createPriceCheckShortcutTracker(() => {
    captures += 1;
  }, shortcut);

  expect(
    isPriceCheckShortcutEvent(
      {
        keycode: 25,
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        shiftKey: true,
      },
      shortcut,
    ),
  ).toBe(true);
  tracker.keyDown({
    keycode: 25,
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: true,
  });
  tracker.keyUp({ keycode: 25 });

  expect(captures).toBe(1);
});

test("normalizes configurable shortcuts and rejects unsafe incomplete chords", () => {
  expect(DEFAULT_PRICE_CHECK_SHORTCUT).toBe("Ctrl+D");
  expect(parsePriceCheckShortcut("shift + ctrl + p")).toMatchObject({
    label: "Ctrl+Shift+P",
    key: "P",
    ctrlKey: true,
    shiftKey: true,
  });
  expect(parsePriceCheckShortcut("D")).toBeUndefined();
  expect(parsePriceCheckShortcut("Shift+D")).toBeUndefined();
  expect(parsePriceCheckShortcut("Ctrl+Escape")).toBeUndefined();
});

test("captures a supported shortcut from the Settings key field", () => {
  expect(
    shortcutFromKeyboardEvent({
      key: "p",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: true,
    }),
  ).toBe("Ctrl+Shift+P");
  expect(
    shortcutFromKeyboardEvent({
      key: "p",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    }),
  ).toBeUndefined();
});

test("reports Wayland as unsupported before enabling the Linux live shortcut", () => {
  expect(
    getLivePriceCheckPlatformIssue("linux", { XDG_SESSION_TYPE: "wayland" }),
  ).toContain("X11");
  expect(
    getLivePriceCheckPlatformIssue("linux", { XDG_SESSION_TYPE: "x11" }),
  ).toBeUndefined();
  expect(getLivePriceCheckPlatformIssue("darwin", {})).toBeUndefined();
});

test("buffers a captured item until the renderer subscribes", () => {
  const channel = createBufferedPriceCheckChannel();
  const received: string[] = [];

  channel.publish(NEW_ITEM);
  const unsubscribe = channel.subscribe((itemText) => received.push(itemText));
  channel.publish(OLD_ITEM);
  unsubscribe();
  channel.publish("ignored after unsubscribe");

  expect(received).toEqual([NEW_ITEM, OLD_ITEM]);
});
