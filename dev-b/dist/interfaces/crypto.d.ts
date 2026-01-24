/**
 * ASTRAEUS - Cryptographic Utilities
 *
 * Implements SHA-256 hashing as specified in agent/interfaces.md
 * CRITICAL: All hashes MUST use SHA-256, NOT keccak256
 */
/**
 * Compute SHA-256 hash
 */
export declare function sha256(data: Buffer): Buffer;
/**
 * Compute asset_id as specified in interfaces.md Section 2.2
 *
 * asset_id = SHA256(asset_code || issuer)
 *
 * @param assetCode - Asset code (1-12 alphanumeric, UTF-8 encoded, null-terminated)
 * @param issuer - "NATIVE" for XLM, or raw 32-byte Ed25519 public key for issued assets
 * @returns 32-byte asset ID as hex string (64 lowercase hex characters)
 */
export declare function computeAssetId(assetCode: string, issuer: string): string;
/**
 * Compute memo as specified in interfaces.md Section 3
 *
 * memo = first_28_bytes(SHA256(subnet_id || block_number))
 *
 * @param subnetId - 32-byte subnet ID (bytes32, hex string with 0x prefix or raw hex)
 * @param blockNumber - Block number (uint64)
 * @returns 28-byte memo as Buffer
 */
export declare function computeMemo(subnetId: string, blockNumber: bigint): Buffer;
/**
 * Convert a bigint to a big-endian Buffer of specified length
 */
export declare function bigintToBuffer(value: bigint, length: number): Buffer;
/**
 * Convert a Buffer to bigint (big-endian)
 */
export declare function bufferToBigint(buffer: Buffer): bigint;
/**
 * Convert Stellar public key (G...) to raw 32-byte Ed25519 key
 */
export declare function stellarKeyToRaw(publicKey: string): Buffer;
/**
 * Convert raw 32-byte Ed25519 key to Stellar public key (G...)
 */
export declare function rawToStellarKey(rawKey: Buffer): string;
/**
 * Convert hex string (with or without 0x) to Stellar public key
 */
export declare function hexToStellarKey(hex: string): string;
/**
 * Validate that a string is a valid Stellar public key
 */
export declare function isValidStellarPublicKey(key: string): boolean;
/**
 * Compute balance leaf hash as specified in interfaces.md Section 1.3
 *
 * balance_leaf = SHA256("BAL" || user_id || asset_code || issuer || balance)
 */
export declare function computeBalanceLeaf(userId: string, assetCode: string, issuer: string, balance: bigint): string;
/**
 * Compute withdrawal leaf hash as specified in interfaces.md Section 1.4
 *
 * withdrawal_leaf = SHA256("WD" || withdrawal_id || user_id || asset_code || issuer || amount || destination)
 */
export declare function computeWithdrawalLeaf(withdrawalId: string, userId: string, assetCode: string, issuer: string, amount: bigint, destination: string): string;
