/**
 * TVA Protocol Utility Functions
 */

import { keccak_256 } from '@noble/hashes/sha3';

/**
 * Converts a hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array, prefix = true): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return prefix ? `0x${hex}` : hex;
}

/**
 * Computes keccak256 hash
 */
export function keccak256(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? hexToBytes(data) : data;
  const hash = keccak_256(input);
  return bytesToHex(hash);
}

/**
 * Pads a hex string to a specific length
 */
export function padHex(hex: string, length: number, side: 'left' | 'right' = 'left'): string {
  const cleanHex = hex.replace(/^0x/, '');
  const padded = side === 'left'
    ? cleanHex.padStart(length, '0')
    : cleanHex.padEnd(length, '0');
  return `0x${padded}`;
}

/**
 * Formats a bigint as a decimal string with specified decimals
 */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absValue = negative ? -value : value;

  const str = absValue.toString().padStart(decimals + 1, '0');
  const integerPart = str.slice(0, -decimals) || '0';
  const decimalPart = str.slice(-decimals);

  // Trim trailing zeros from decimal part
  const trimmedDecimal = decimalPart.replace(/0+$/, '');

  const result = trimmedDecimal ? `${integerPart}.${trimmedDecimal}` : integerPart;
  return negative ? `-${result}` : result;
}

/**
 * Parses a decimal string to bigint with specified decimals
 */
export function parseUnits(value: string, decimals: number): bigint {
  const negative = value.startsWith('-');
  const cleanValue = negative ? value.slice(1) : value;

  const [integerPart, decimalPart = ''] = cleanValue.split('.');

  // Pad or truncate decimal part to match decimals
  const paddedDecimal = decimalPart.padEnd(decimals, '0').slice(0, decimals);

  const combined = integerPart + paddedDecimal;
  const result = BigInt(combined);

  return negative ? -result : result;
}

/**
 * Formats XLM (7 decimals) for display
 */
export function formatXlm(stroops: bigint): string {
  return formatUnits(stroops, 7);
}

/**
 * Parses XLM string to stroops
 */
export function parseXlm(xlm: string): bigint {
  return parseUnits(xlm, 7);
}

/**
 * Formats ETH-style value (18 decimals) for display
 */
export function formatEth(wei: bigint): string {
  return formatUnits(wei, 18);
}

/**
 * Parses ETH string to wei
 */
export function parseEth(eth: string): bigint {
  return parseUnits(eth, 18);
}

/**
 * Validates an EVM address format
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Validates a Stellar G-address format
 */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Validates a Soroban C-address format
 */
export function isValidContractId(address: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(address);
}

/**
 * Checksums an EVM address (EIP-55)
 */
export function checksumAddress(address: string): string {
  const addr = address.toLowerCase().replace(/^0x/, '');
  const hash = keccak256(new TextEncoder().encode(addr)).replace(/^0x/, '');

  let checksummed = '0x';
  for (let i = 0; i < addr.length; i++) {
    if (parseInt(hash[i], 16) >= 8) {
      checksummed += addr[i].toUpperCase();
    } else {
      checksummed += addr[i];
    }
  }

  return checksummed;
}

/**
 * Validates a checksummed EVM address (EIP-55)
 */
export function isValidChecksumAddress(address: string): boolean {
  if (!isValidEvmAddress(address)) return false;
  return address === checksumAddress(address);
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      await sleep(delay);
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Creates a deferred promise
 */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Chunks an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
