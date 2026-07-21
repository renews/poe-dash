import { contextBridge, ipcRenderer } from "electron";
import { createBufferedPriceCheckChannel } from "./app/priceCheckClipboard";

type WindowControlAction = "minimize" | "toggle-maximize" | "close";

const bufferedPriceChecks = createBufferedPriceCheckChannel();
ipcRenderer.on("price-check-item-copied", (_event, value: unknown) => {
  if (typeof value === "string") {
    bufferedPriceChecks.publish(value);
  }
});

contextBridge.exposeInMainWorld("windowControls", {
  perform(action: WindowControlAction) {
    return ipcRenderer.invoke("window-control", action) as Promise<boolean>;
  },
  isMaximized() {
    return ipcRenderer.invoke("window-is-maximized") as Promise<boolean>;
  },
  onMaximizedChange(callback: (isMaximized: boolean) => void) {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      callback(value === true);
    };
    ipcRenderer.on("window-maximized-change", listener);
    return () =>
      ipcRenderer.removeListener("window-maximized-change", listener);
  },
});

contextBridge.exposeInMainWorld("desktopApi", {
  priceCheck: {
    getShortcutStatus() {
      return ipcRenderer.invoke("price-check-shortcut-status") as Promise<{
        registered: boolean;
        shortcut: string;
        error?: string;
      }>;
    },
    setShortcut(shortcut: string) {
      return ipcRenderer.invoke(
        "price-check-shortcut-update",
        shortcut,
      ) as Promise<{
        registered: boolean;
        shortcut: string;
        error?: string;
      }>;
    },
    onItemCopied(callback: (itemText: string) => void) {
      return bufferedPriceChecks.subscribe(callback);
    },
  },
  merchantHistory: {
    getSession() {
      return ipcRenderer.invoke("poe-get-session") as Promise<unknown>;
    },
    login() {
      return ipcRenderer.invoke("poe-login") as Promise<unknown>;
    },
    fetchHistory(league: string) {
      return ipcRenderer.invoke(
        "poe-fetch-history",
        league,
      ) as Promise<unknown>;
    },
  },
  showPriceAlert(payload: unknown) {
    return ipcRenderer.invoke("show-price-alert", payload) as Promise<boolean>;
  },
});
