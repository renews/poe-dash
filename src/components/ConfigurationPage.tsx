import React, { useState } from "react";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { canStartAccountSync } from "../appNavigation";
import { League, Leagues } from "../data/leagues";
import {
  MAX_MODIFIER_RANGE_PERCENT,
  MIN_MODIFIER_RANGE_PERCENT,
} from "../services/PriceEstimator";
import { shortcutFromKeyboardEvent } from "../services/priceCheckShortcut";
import {
  formFieldClassName,
  formLabelClassName,
  primaryButtonClassName,
} from "./formStyles";

const ConfigurationPage: React.FC = () => {
  const {
    accountName,
    setAccountName,
    selectedLeague,
    setSelectedLeague,
    priceCheckCooldownMinutes,
    setPriceCheckCooldownMinutes,
    modifierRangePercent,
    setModifierRangePercent,
    openMarketInspectorOnSelect,
    setOpenMarketInspectorOnSelect,
    priceCheckShortcut,
    setPriceCheckShortcut,
    isSyncing,
    getItems,
  } = useAppContext();
  const navigate = useNavigate();
  const [shortcutHelp, setShortcutHelp] = useState(
    "Focus the field, then press a modifier and a letter, number, or F1 to F12.",
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canStartAccountSync(accountName, isSyncing)) {
      return;
    }

    localStorage.setItem("accountName", accountName);
    void getItems(accountName);
    navigate("/", { replace: true });
  };

  const handleShortcutKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Tab" || event.key === "Escape") {
      return;
    }

    event.preventDefault();
    const shortcut = shortcutFromKeyboardEvent(event);
    if (shortcut) {
      setPriceCheckShortcut(shortcut);
      setShortcutHelp(`${shortcut} is now the live price check shortcut.`);
      return;
    }

    if (!["Control", "Alt", "Meta", "Shift"].includes(event.key)) {
      setShortcutHelp(
        "Use Ctrl, Alt, or Meta with A to Z, 0 to 9, or F1 to F12. Shift is optional.",
      );
    }
  };

  return (
    <div className="w-full p-4 pt-16">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-8 w-8 text-blue-300" />
        <div>
          <h1 className="text-2xl font-bold">Configuration</h1>
          <p className="text-sm text-gray-400">
            Set the account, league, and price check behavior used by the app.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg bg-gray-800 p-6 shadow-lg sm:grid-cols-2"
      >
        <label className={formLabelClassName}>
          Account name
          <input
            type="text"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            placeholder="Enter your account name"
            className={`${formFieldClassName} w-full`}
          />
        </label>

        <label className={formLabelClassName}>
          League
          <select
            value={selectedLeague}
            onChange={(event) => setSelectedLeague(event.target.value as League)}
            className={`${formFieldClassName} w-full`}
          >
            {Leagues.map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </select>
        </label>

        <label className={formLabelClassName}>
          Recheck after (minutes)
          <input
            type="number"
            min="0"
            step="1"
            value={priceCheckCooldownMinutes}
            onChange={(event) =>
              setPriceCheckCooldownMinutes(
                Math.max(0, Number(event.target.value) || 0),
              )
            }
            title="Minutes to reuse a recent whole-tab price check. Set to 0 to always recheck."
            className={`${formFieldClassName} w-full`}
          />
        </label>

        <label className={formLabelClassName}>
          Modifier comparison range: {modifierRangePercent}%
          <input
            type="range"
            min={MIN_MODIFIER_RANGE_PERCENT}
            max={MAX_MODIFIER_RANGE_PERCENT}
            step="1"
            value={modifierRangePercent}
            onChange={(event) =>
              setModifierRangePercent(Number(event.target.value))
            }
            title="Compare modifier values within this percentage above or below the item value."
            className="w-full accent-blue-500"
          />
          <span className="flex justify-between text-xs text-gray-400">
            <span>{MIN_MODIFIER_RANGE_PERCENT}%</span>
            <span>{MAX_MODIFIER_RANGE_PERCENT}%</span>
          </span>
        </label>

        <label className={`${formLabelClassName} sm:col-span-2`}>
          Live price check shortcut
          <input
            type="text"
            readOnly
            value={priceCheckShortcut}
            onKeyDown={handleShortcutKeyDown}
            onFocus={() =>
              setShortcutHelp(
                "Press a modifier and a letter, number, or F1 to F12.",
              )
            }
            aria-describedby="price-check-shortcut-help"
            className={`${formFieldClassName} w-full`}
          />
          <span
            id="price-check-shortcut-help"
            role="status"
            aria-live="polite"
            className="text-xs text-gray-400"
          >
            {shortcutHelp}
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-700 bg-gray-900/60 p-4 text-left sm:col-span-2">
          <input
            type="checkbox"
            checked={openMarketInspectorOnSelect}
            onChange={(event) =>
              setOpenMarketInspectorOnSelect(event.target.checked)
            }
            className="form-checkbox mt-0.5 h-4 w-4"
          />
          <span>
            <strong className="block text-sm font-semibold text-gray-100">
              Open Market Inspector when selecting an item
            </strong>
            <span className="mt-1 block text-xs text-gray-400">
              Opens the inspector only when you select a different item.
            </span>
          </span>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={!canStartAccountSync(accountName, isSyncing)}
            className={primaryButtonClassName}
          >
            {isSyncing
              ? "Syncing your sales..."
              : "Sync your sales"}
          </button>
        </div>

      </form>
    </div>
  );
};

export default ConfigurationPage;
