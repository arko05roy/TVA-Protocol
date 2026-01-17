/**
 * ASTRAEUS - Cryptographic Utilities
 *
 * Implements SHA-256 hashing as specified in agent/interfaces.md
 * CRITICAL: All hashes MUST use SHA-256, NOT keccak256
 */

import { createHash } from 'crypto';
import { StrKey } from '@stellar/stellar-sdk';

/**
 * Compute SHA-256 hash
 */
export function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/**
 * Compute asset_id as specified in interfaces.md Section 2.2
 *
 * asset_id = SHA256(asset_code || issuer)
 *
 * @param assetCode - Asset code (1-12 alphanumeric, UTF-8 encoded, null-terminated)
 * @param issuer - "NATIVE" for XLM, or raw 32-byte Ed25519 public key for issued assets
 * @returns 32-byte asset ID as hex string (64 lowercase hex characters)
 */
export function computeAssetId(assetCode: string, issuer: string): string {
  // Asset code: UTF-8 encoded, null-terminated
  const assetCodeBytes = Buffer.concat([
    Buffer.from(assetCode, 'utf-8'),
    Buffer.from([0x00]), // null terminator
  ]);

  let issuerBytes: Buffer;
  if (issuer.toUpperCase() === 'NATIVE') {
    // For XLM: "NATIVE" as UTF-8 (6 bytes: 0x4E 0x41 0x54 0x49 0x56 0x45)
    issuerBytes = Buffer.from('NATIVE', 'utf-8');
  } else if (issuer.startsWith('G')) {
    // Stellar public key (G... format) - decode to raw 32 bytes
    issuerBytes = Buffer.from(StrKey.decodeEd25519PublicKey(issuer));
  } else if (issuer.startsWith('0x')) {
    // Raw hex format (from Dev A's contract)
    issuerBytes = Buffer.from(issuer.slice(2), 'hex');
  } else {
    // Assume raw hex without 0x prefix
    issuerBytes = Buffer.from(issuer, 'hex');
  }

  // Concatenate and hash
  const input = Buffer.concat([assetCodeBytes, issuerBytes]);
  const hash = sha256(input);

  return hash.toString('hex').toLowerCase();
}

/**
 * Compute memo as specified in interfaces.md Section 3
 *
 * memo = first_28_bytes(SHA256(subnet_id || block_number))
 *
 * @param subnetId - 32-byte subnet ID (bytes32, hex string with 0x prefix or raw hex)
 * @param blockNumber - Block number (uint64)
 * @returns 28-byte memo as Buffer
 */
export function computeMemo(subnetId: string, blockNumber: bigint): Buffer {
  // subnet_id: 32 bytes
  const subnetIdHex = subnetId.startsWith('0x') ? subnetId.slice(2) : subnetId;
  if (subnetIdHex.length !== 64) {
    throw new Error(`Invalid subnet_id length: expected 64 hex chars, got ${subnetIdHex.length}`);
  }
  const subnetIdBytes = Buffer.from(subnetIdHex, 'hex');

  // block_number: uint64 big-endian (8 bytes)
  const blockNumberBytes = Buffer.alloc(8);
  blockNumberBytes.writeBigUInt64BE(blockNumber);

  // Concatenate (40 bytes total)
  const input = Buffer.concat([subnetIdBytes, blockNumberBytes]);

  // SHA-256 hash and take first 28 bytes
  const fullHash = sha256(input);
  return fullHash.subarray(0, 28);
}

/**
 * Convert a bigint to a big-endian Buffer of specified length
 */
export function bigintToBuffer(value: bigint, length: number): Buffer {
  const hex = value.toString(16).padStart(length * 2, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Convert a Buffer to bigint (big-endian)
 */
export function bufferToBigint(buffer: Buffer): bigint {
  return BigInt('0x' + buffer.toString('hex'));
}

/**
 * Convert Stellar public key (G...) to raw 32-byte Ed25519 key
 */
export function stellarKeyToRaw(publicKey: string): Buffer {
  if (!publicKey.startsWith('G')) {
    throw new Error('Invalid Stellar public key format');
  }
  return Buffer.from(StrKey.decodeEd25519PublicKey(publicKey));
}

/**
 * Convert raw 32-byte Ed25519 key to Stellar public key (G...)
 */
export function rawToStellarKey(rawKey: Buffer): string {
  if (rawKey.length !== 32) {
    throw new Error('Invalid raw key length: expected 32 bytes');
  }
  return StrKey.encodeEd25519PublicKey(rawKey);
}

/**
 * Convert hex string (with or without 0x) to Stellar public key
 */
export function hexToStellarKey(hex: string): string {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length !== 64) {
    throw new Error(`Invalid hex length: expected 64, got ${cleanHex.length}`);
  }
  return rawToStellarKey(Buffer.from(cleanHex, 'hex'));
}

/**
 * Validate that a string is a valid Stellar public key
 */
export function isValidStellarPublicKey(key: string): boolean {
  try {
    StrKey.decodeEd25519PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute balance leaf hash as specified in interfaces.md Section 1.3
 *
 * balance_leaf = SHA256("BAL" || user_id || asset_code || issuer || balance)
 */
export function computeBalanceLeaf(
  userId: string,
  assetCode: string,
  issuer: string,
  balance: bigint
): string {
  // Prefix: "BAL" (3 bytes: 0x42 0x41 0x4C)
  const prefix = Buffer.from('BAL', 'utf-8');

  // user_id: 32 bytes
  const userIdHex = userId.startsWith('0x') ? userId.slice(2) : userId;
  const userIdBytes = Buffer.from(userIdHex, 'hex');

  // asset_code: UTF-8 encoded, null-terminated
  const assetCodeBytes = Buffer.concat([
    Buffer.from(assetCode, 'utf-8'),
    Buffer.from([0x00]),
  ]);

  // issuer: "NATIVE" for XLM or 32-byte Ed25519 public key
  let issuerBytes: Buffer;
  if (issuer.toUpperCase() === 'NATIVE') {
    issuerBytes = Buffer.from('NATIVE', 'utf-8');
  } else if (issuer.startsWith('G')) {
    issuerBytes = Buffer.from(StrKey.decodeEd25519PublicKey(issuer));
  } else if (issuer.startsWith('0x')) {
    issuerBytes = Buffer.from(issuer.slice(2), 'hex');
  } else {
    issuerBytes = Buffer.from(issuer, 'hex');
  }

  // balance: 16 bytes big-endian int128
  const balanceBytes = bigintToBuffer(balance, 16);

  // Concatenate and hash
  const input = Buffer.concat([prefix, userIdBytes, assetCodeBytes, issuerBytes, balanceBytes]);
  return sha256(input).toString('hex').toLowerCase();
}

/**
 * Compute withdrawal leaf hash as specified in interfaces.md Section 1.4
 *
 * withdrawal_leaf = SHA256("WD" || withdrawal_id || user_id || asset_code || issuer || amount || destination)
 */
export function computeWithdrawalLeaf(
  withdrawalId: string,
  userId: string,
  assetCode: string,
  issuer: string,
  amount: bigint,
  destination: string
): string {
  // Prefix: "WD" (2 bytes: 0x57 0x44)
  const prefix = Buffer.from('WD', 'utf-8');

  // withdrawal_id: 32 bytes
  const withdrawalIdHex = withdrawalId.startsWith('0x') ? withdrawalId.slice(2) : withdrawalId;
  const withdrawalIdBytes = Buffer.from(withdrawalIdHex, 'hex');

  // user_id: 32 bytes
  const userIdHex = userId.startsWith('0x') ? userId.slice(2) : userId;
  const userIdBytes = Buffer.from(userIdHex, 'hex');

  // asset_code: UTF-8 encoded, null-terminated
  const assetCodeBytes = Buffer.concat([
    Buffer.from(assetCode, 'utf-8'),
    Buffer.from([0x00]),
  ]);

  // issuer
  let issuerBytes: Buffer;
  if (issuer.toUpperCase() === 'NATIVE') {
    issuerBytes = Buffer.from('NATIVE', 'utf-8');
  } else if (issuer.startsWith('G')) {
    issuerBytes = Buffer.from(StrKey.decodeEd25519PublicKey(issuer));
  } else if (issuer.startsWith('0x')) {
    issuerBytes = Buffer.from(issuer.slice(2), 'hex');
  } else {
    issuerBytes = Buffer.from(issuer, 'hex');
  }

  // amount: 16 bytes big-endian int128
  const amountBytes = bigintToBuffer(amount, 16);

  // destination: 32 bytes Ed25519 public key
  let destinationBytes: Buffer;
  if (destination.startsWith('G')) {
    destinationBytes = Buffer.from(StrKey.decodeEd25519PublicKey(destination));
  } else if (destination.startsWith('0x')) {
    destinationBytes = Buffer.from(destination.slice(2), 'hex');
  } else {
    destinationBytes = Buffer.from(destination, 'hex');
  }

  // Concatenate and hash
  const input = Buffer.concat([
    prefix,
    withdrawalIdBytes,
    userIdBytes,
    assetCodeBytes,
    issuerBytes,
    amountBytes,
    destinationBytes,
  ]);
  return sha256(input).toString('hex').toLowerCase();
}
