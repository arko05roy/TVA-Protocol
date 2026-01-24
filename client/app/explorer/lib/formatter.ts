/**
 * Explorer Data Formatters
 */

import { STELLAR_EXPERT_BASE, HASH_TRUNCATE_LENGTH } from "./constants";

/**
 * Format a block number as hex (EVM style)
 */
export function formatBlockNumberHex(blockNumber: number): string {
  return `0x${blockNumber.toString(16).toUpperCase()}`;
}

/**
 * Format Wei to XLM (18 decimals to 7 decimals)
 * TVA uses 18 decimals for EVM compatibility, Stellar uses 7
 */
export function weiToXlm(wei: bigint): string {
  // 1 XLM = 10^7 stroops (Stellar)
  // 1 "XLM" in Wei = 10^18 (EVM)
  // Conversion: wei / 10^18 * 10^7 = wei / 10^11
  const xlmAmount = wei / BigInt(10 ** 11);
  const stroops = Number(xlmAmount);
  return (stroops / 10_000_000).toFixed(7);
}

/**
 * Format XLM to Wei
 */
export function xlmToWei(xlm: number): bigint {
  const stroops = Math.floor(xlm * 10_000_000);
  return BigInt(stroops) * BigInt(10 ** 11);
}

/**
 * Format Wei as ETH-style (18 decimals)
 */
export function formatWei(wei: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = wei / divisor;
  const remainder = wei % divisor;
  const fractional = remainder.toString().padStart(decimals, "0").slice(0, 6);
  return `${whole}.${fractional}`;
}

/**
 * Format gas value
 */
export function formatGas(gas: bigint | number): string {
  const gasNum = typeof gas === "bigint" ? Number(gas) : gas;
  if (gasNum >= 1_000_000) {
    return `${(gasNum / 1_000_000).toFixed(2)}M`;
  }
  if (gasNum >= 1_000) {
    return `${(gasNum / 1_000).toFixed(2)}K`;
  }
  return gasNum.toLocaleString();
}

/**
 * Truncate hash for display
 */
export function truncateHash(hash: string, length: number = HASH_TRUNCATE_LENGTH): string {
  if (hash.length <= length * 2 + 2) return hash;
  return `${hash.slice(0, length + 2)}...${hash.slice(-length)}`;
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, length: number = 6): string {
  if (address.length <= length * 2 + 2) return address;
  return `${address.slice(0, length + 2)}...${address.slice(-length)}`;
}

/**
 * Format timestamp
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Convert EVM address to checksummed format
 */
export function toChecksumAddress(address: string): string {
  // Simple implementation - just lowercase for now
  // Full checksum would require keccak256
  return address.toLowerCase();
}

/**
 * Stellar.expert URLs
 */
export function getStellarExpertLedgerUrl(ledgerSequence: number): string {
  return `${STELLAR_EXPERT_BASE}/ledger/${ledgerSequence}`;
}

export function getStellarExpertTxUrl(stellarTxHash: string): string {
  return `${STELLAR_EXPERT_BASE}/tx/${stellarTxHash}`;
}

export function getStellarExpertAccountUrl(stellarAddress: string): string {
  return `${STELLAR_EXPERT_BASE}/account/${stellarAddress}`;
}

/**
 * Check if string is valid EVM address
 */
export function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(value);
}

/**
 * Check if string is valid Stellar address (G-address)
 */
export function isStellarAddress(value: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(value);
}

/**
 * Check if string is valid Soroban contract ID (C-address)
 */
export function isSorobanContractId(value: string): boolean {
  return /^C[A-Z0-9]{55}$/.test(value);
}

/**
 * Check if string is valid transaction hash
 */
export function isTransactionHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/i.test(value);
}

/**
 * Check if string is valid block number (decimal or hex)
 */
export function isBlockNumber(value: string): boolean {
  // Decimal number
  if (/^\d+$/.test(value)) return true;
  // Hex number
  if (/^0x[a-fA-F0-9]+$/i.test(value)) return true;
  return false;
}

/**
 * Parse search input and determine type
 */
export function parseSearchInput(input: string): {
  type: "block" | "transaction" | "address" | "unknown";
  value: string;
} {
  const trimmed = input.trim();

  if (isBlockNumber(trimmed)) {
    // Convert hex to decimal if needed
    const value = trimmed.startsWith("0x")
      ? parseInt(trimmed, 16).toString()
      : trimmed;
    return { type: "block", value };
  }

  if (isTransactionHash(trimmed)) {
    return { type: "transaction", value: trimmed };
  }

  if (isEvmAddress(trimmed) || isStellarAddress(trimmed) || isSorobanContractId(trimmed)) {
    return { type: "address", value: trimmed };
  }

  return { type: "unknown", value: trimmed };
}

/**
 * Format account type based on code
 */
export function getAccountType(code: string): "EOA" | "Contract" {
  // If code is "0x" or empty, it's an EOA
  return code === "0x" || code === "" || code === "0x0" ? "EOA" : "Contract";
}
