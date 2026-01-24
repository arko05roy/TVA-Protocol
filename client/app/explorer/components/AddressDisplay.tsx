"use client";

import { useState } from "react";
import Link from "next/link";
import { truncateAddress, isEvmAddress, isStellarAddress, isSorobanContractId } from "../lib/formatter";

interface AddressDisplayProps {
  evmAddress?: string;
  stellarAddress?: string;
  truncate?: boolean;
  showLink?: boolean;
  showToggle?: boolean;
  className?: string;
}

export function AddressDisplay({
  evmAddress,
  stellarAddress,
  truncate = true,
  showLink = true,
  showToggle = true,
  className = "",
}: AddressDisplayProps) {
  const [showStellar, setShowStellar] = useState(false);

  const currentAddress = showStellar && stellarAddress ? stellarAddress : evmAddress;
  const displayAddress = truncate && currentAddress ? truncateAddress(currentAddress, 8) : currentAddress;

  const copyToClipboard = () => {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress);
    }
  };

  if (!evmAddress && !stellarAddress) {
    return <span className="text-black/40">N/A</span>;
  }

  const addressType = evmAddress
    ? isEvmAddress(evmAddress)
      ? "EVM"
      : "Unknown"
    : stellarAddress
    ? isStellarAddress(stellarAddress)
      ? "Account"
      : isSorobanContractId(stellarAddress)
      ? "Contract"
      : "Unknown"
    : "Unknown";

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {showLink && currentAddress ? (
        <Link
          href={`/explorer/address/${currentAddress}`}
          className="font-mono text-[#0055ff] hover:underline"
        >
          {displayAddress}
        </Link>
      ) : (
        <span className="font-mono">{displayAddress}</span>
      )}

      {/* Copy Button */}
      <button
        onClick={copyToClipboard}
        className="p-1 rounded hover:bg-black/5 transition-colors"
        title="Copy address"
      >
        <svg
          className="w-4 h-4 text-black/40 hover:text-black/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Toggle Button */}
      {showToggle && evmAddress && stellarAddress && (
        <button
          onClick={() => setShowStellar(!showStellar)}
          className="px-2 py-1 rounded text-xs font-medium bg-black/5 hover:bg-black/10 transition-colors"
          title={showStellar ? "Show EVM address" : "Show Stellar address"}
        >
          {showStellar ? "EVM" : "Stellar"}
        </button>
      )}
    </div>
  );
}

/**
 * Simple address badge with type indicator
 */
export function AddressBadge({
  address,
  type,
}: {
  address: string;
  type?: "EOA" | "Contract";
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="font-mono text-sm">{truncateAddress(address, 6)}</span>
      {type && (
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            type === "Contract"
              ? "bg-[#0055ff]/10 text-[#0055ff]"
              : "bg-black/5 text-black/60"
          }`}
        >
          {type}
        </span>
      )}
    </div>
  );
}
