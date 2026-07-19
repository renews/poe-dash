import React from "react";
import { primaryButtonClassName } from "./formStyles";

interface LiveMonitorButtonProps {
  isLiveMonitoring: boolean;
  isStarting: boolean;
  error: string | null;
  onToggle: () => void;
}

export const LiveMonitorButton: React.FC<LiveMonitorButtonProps> = ({
  isLiveMonitoring,
  isStarting,
  error,
  onToggle,
}) => (
  <div className="flex flex-col gap-1">
    <button onClick={onToggle} className={primaryButtonClassName}>
      {isStarting
        ? "Starting Auto Monitor..."
        : isLiveMonitoring
          ? "Stop Auto Monitor"
          : "Start Auto Monitor"}
    </button>
    {error && <p className="max-w-md text-xs text-red-300">{error}</p>}
  </div>
);
