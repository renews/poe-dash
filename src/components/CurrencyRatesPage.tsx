import React from "react";
import { Coins } from "lucide-react";
import { useAppContext } from "../contexts/AppContext";
import { formatPriceAmount } from "../services/types";
import { League, Leagues } from "../data/leagues";

const rateRows = [
  { currency: "Chaos", comparedTo: "Exalted", key: "exalted:chaos" },
  { currency: "Divine", comparedTo: "Chaos", key: "chaos:divine" },
  { currency: "Mirror", comparedTo: "Divine", key: "divine:mirror" },
];

const CurrencyRatesPage: React.FC = () => {
  const {
    selectedLeague,
    setSelectedLeague,
    currencyRates,
    currencyRatesUpdatedAt,
    isRefreshingCurrencyRates,
    refreshCurrencyRates,
  } = useAppContext();

  return (
    <div className="container mx-auto p-4 pt-16">
      <div className="flex items-center gap-3 mb-6">
        <Coins className="h-8 w-8 text-yellow-300" />
        <h1 className="text-2xl font-bold">Currency Rates</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <label className="flex flex-col gap-1 text-sm text-gray-300">
          League
          <select
            value={selectedLeague}
            onChange={(event) =>
              setSelectedLeague(event.target.value as League)
            }
            className="border p-2 text-gray-900"
          >
            {Leagues.map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => void refreshCurrencyRates()}
          disabled={isRefreshingCurrencyRates}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white font-semibold py-2 px-4 rounded"
        >
          {isRefreshingCurrencyRates ? "Refreshing..." : "Refresh Rates"}
        </button>
      </div>

      <p className="text-gray-400 mb-4">
        Rates refresh automatically when the app starts and every hour.
        {currencyRatesUpdatedAt
          ? ` Last updated ${new Date(currencyRatesUpdatedAt).toLocaleTimeString()}.`
          : " Waiting for the first live refresh."}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        {rateRows.map((row) => {
          const rate = currencyRates[row.key];

          return (
            <div key={row.key} className="bg-gray-800 rounded-lg p-5 shadow-lg">
              <p className="text-gray-400 text-sm">1 {row.currency}</p>
              <p className="text-2xl font-semibold text-yellow-300 mt-2">
                {typeof rate === "number"
                  ? `~${formatPriceAmount(rate)}`
                  : "Unavailable"}{" "}
                {row.comparedTo}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CurrencyRatesPage;
