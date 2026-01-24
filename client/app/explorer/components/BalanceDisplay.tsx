"use client";

import { useState } from "react";
import { formatWei, weiToXlm } from "../lib/formatter";

interface BalanceDisplayProps {
  /** Balance in Wei (18 decimals) */
  balance: bigint;
  showToggle?: boolean;
  className?: string;
}

export function BalanceDisplay({
  balance,
  showToggle = true,
  className = "",
}: BalanceDisplayProps) {
  const [showXlm, setShowXlm] = useState(false);

  const weiDisplay = formatWei(balance);
  const xlmDisplay = weiToXlm(balance);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-mono">
        {showXlm ? (
          <>
            {xlmDisplay} <span className="text-black/40">XLM</span>
          </>
        ) : (
          <>
            {weiDisplay} <span className="text-black/40">ETH</span>
          </>
        )}
      </span>

      {showToggle && (
        <button
          onClick={() => setShowXlm(!showXlm)}
          className="px-2 py-1 rounded text-xs font-medium bg-black/5 hover:bg-black/10 transition-colors"
          title={showXlm ? "Show in Wei/ETH" : "Show in XLM"}
        >
          {showXlm ? "Wei" : "XLM"}
        </button>
      )}
    </div>
  );
}

/**
 * Compact balance display
 */
export function BalanceCompact({
  balance,
  unit = "ETH",
}: {
  balance: bigint;
  unit?: "ETH" | "XLM";
}) {
  const display = unit === "XLM" ? weiToXlm(balance) : formatWei(balance);
  return (
    <span className="font-mono">
      {display} <span className="text-black/40">{unit}</span>
    </span>
  );
}
