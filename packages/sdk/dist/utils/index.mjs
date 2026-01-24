import { keccak_256 } from '@noble/hashes/sha3';

// src/utils/index.ts
function hexToBytes(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes, prefix = true) {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return prefix ? `0x${hex}` : hex;
}
function keccak256(data) {
  const input = typeof data === "string" ? hexToBytes(data) : data;
  const hash = keccak_256(input);
  return bytesToHex(hash);
}
function padHex(hex, length, side = "left") {
  const cleanHex = hex.replace(/^0x/, "");
  const padded = side === "left" ? cleanHex.padStart(length, "0") : cleanHex.padEnd(length, "0");
  return `0x${padded}`;
}
function formatUnits(value, decimals) {
  const negative = value < 0n;
  const absValue = negative ? -value : value;
  const str = absValue.toString().padStart(decimals + 1, "0");
  const integerPart = str.slice(0, -decimals) || "0";
  const decimalPart = str.slice(-decimals);
  const trimmedDecimal = decimalPart.replace(/0+$/, "");
  const result = trimmedDecimal ? `${integerPart}.${trimmedDecimal}` : integerPart;
  return negative ? `-${result}` : result;
}
function parseUnits(value, decimals) {
  const negative = value.startsWith("-");
  const cleanValue = negative ? value.slice(1) : value;
  const [integerPart, decimalPart = ""] = cleanValue.split(".");
  const paddedDecimal = decimalPart.padEnd(decimals, "0").slice(0, decimals);
  const combined = integerPart + paddedDecimal;
  const result = BigInt(combined);
  return negative ? -result : result;
}
function formatXlm(stroops) {
  return formatUnits(stroops, 7);
}
function parseXlm(xlm) {
  return parseUnits(xlm, 7);
}
function formatEth(wei) {
  return formatUnits(wei, 18);
}
function parseEth(eth) {
  return parseUnits(eth, 18);
}
function isValidEvmAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}
function isValidStellarAddress(address) {
  return /^G[A-Z2-7]{55}$/.test(address);
}
function isValidContractId(address) {
  return /^C[A-Z2-7]{55}$/.test(address);
}
function checksumAddress(address) {
  const addr = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak256(new TextEncoder().encode(addr)).replace(/^0x/, "");
  let checksummed = "0x";
  for (let i = 0; i < addr.length; i++) {
    if (parseInt(hash[i], 16) >= 8) {
      checksummed += addr[i].toUpperCase();
    } else {
      checksummed += addr[i];
    }
  }
  return checksummed;
}
function isValidChecksumAddress(address) {
  if (!isValidEvmAddress(address)) return false;
  return address === checksumAddress(address);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1e3,
    maxDelay = 3e4,
    shouldRetry = () => true
  } = options;
  let lastError;
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
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export { bytesToHex, checksumAddress, chunk, deferred, formatEth, formatUnits, formatXlm, hexToBytes, isValidChecksumAddress, isValidContractId, isValidEvmAddress, isValidStellarAddress, keccak256, padHex, parseEth, parseUnits, parseXlm, retry, sleep };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map