/**
 * ASTRAEUS - Dev B Shared Types
 *
 * These types match the interface specifications in agent/interfaces.md
 * and the withdrawal queue format in contracts/WITHDRAWAL_QUEUE_FORMAT.md
 */

import { Keypair, Asset as StellarAsset, Transaction } from '@stellar/stellar-sdk';

// =============================================================================
// Asset Types
// =============================================================================

/**
 * Asset representation matching Stellar specification
 */
export interface Asset {
  /** Asset code (1-12 alphanumeric characters) */
  code: string;
  /**
   * Asset issuer:
   * - For issued assets: Ed25519 public key (G... address)
   * - For XLM: "native"
   */
  issuer: string;
}

/**
 * Convert Asset to Stellar SDK Asset
 */
export function toStellarAsset(asset: Asset): StellarAsset {
  if (asset.issuer.toLowerCase() === 'native') {
    return StellarAsset.native();
  }
  return new StellarAsset(asset.code, asset.issuer);
}

// =============================================================================
// Withdrawal Types (From Dev A)
// =============================================================================

/**
 * Withdrawal intent as returned by ExecutionCore.get_withdrawal_queue()
 * Matches contracts/WITHDRAWAL_QUEUE_FORMAT.md
 */
export interface WithdrawalIntent {
  /** Unique identifier - keccak256 hash (bytes32 hex, 0x-prefixed) */
  withdrawal_id: string;
  /** User requesting withdrawal (bytes32 hex, 0x-prefixed) */
  user_id: string;
  /** Asset code (1-12 alphanumeric characters) */
  asset_code: string;
  /**
   * Asset issuer:
   * - For issued assets: bytes32 hex (0x-prefixed)
   * - For XLM: "NATIVE"
   */
  issuer: string;
  /** Amount in stroops (decimal string, NOT hex) */
  amount: string;
  /** Stellar destination address - Ed25519 public key (bytes32 hex, 0x-prefixed) */
  destination: string;
}

// =============================================================================
// Treasury Snapshot Types (Dev B -> Dev A)
// =============================================================================

/**
 * Treasury snapshot for PoM validation
 * This is what Dev B provides to Dev A for Proof of Money checks
 */
export interface TreasurySnapshot {
  /**
   * Balances indexed by asset_id (SHA-256 hash of asset_code || issuer)
   * Key: asset_id_hex (64 lowercase hex characters)
   * Value: balance in stroops (as string)
   */
  balances: Map<string, bigint>;
  /** List of authorized signers (Ed25519 pubkeys, G... addresses) */
  signers: string[];
  /** Required signature threshold */
  threshold: number;
}

/**
 * JSON-serializable version of TreasurySnapshot for API responses
 */
export interface TreasurySnapshotJSON {
  balances: { [asset_id_hex: string]: string };
  signers: string[];
  threshold: number;
}

// =============================================================================
// PoM Delta Types
// =============================================================================

/**
 * Proof of Money delta - net outflow per asset
 * Key: asset_id_hex (SHA-256 hash, 64 lowercase hex chars)
 * Value: total outflow in stroops
 */
export type PomDelta = Map<string, bigint>;

/**
 * JSON-serializable version for transmission
 */
export interface PomDeltaJSON {
  [asset_id_hex: string]: string;
}

// =============================================================================
// Settlement Types
// =============================================================================

/**
 * Settlement plan containing transactions to execute
 */
export interface SettlementPlan {
  subnet_id: string;
  block_number: bigint;
  /** 28-byte memo as hex string */
  memo: string;
  /** List of transactions to submit */
  transactions: Transaction[];
}

/**
 * Result of a settlement execution
 */
export interface SettlementResult {
  status: 'confirmed' | 'already_settled' | 'failed';
  tx_hashes: string[];
  memo: string;
  error?: string;
}

// =============================================================================
// Commitment Event Types (Dev A -> Dev B)
// =============================================================================

/**
 * Commitment event emitted by Dev A when state is committed
 */
export interface CommitmentEvent {
  /** Subnet identifier (bytes32 hex) */
  subnet_id: string;
  /** Block number (uint64) */
  block_number: bigint;
  /** State root (bytes32 hex) */
  state_root: string;
}

// =============================================================================
// Settlement Confirmation Types (Dev B -> Dev A)
// =============================================================================

/**
 * Settlement confirmation sent to Dev A after settlement completes
 */
export interface SettlementConfirmation {
  subnet_id: string;
  block_number: bigint;
  tx_hashes: string[];
  /** 28-byte memo as hex string */
  memo: string;
  timestamp: Date;
}

// =============================================================================
// Vault Types
// =============================================================================

/**
 * Vault configuration
 */
export interface VaultConfig {
  /** Vault Stellar address (G... format) */
  address: string;
  /** Auditor public keys (G... addresses) */
  auditors: string[];
  /** Required signature threshold */
  threshold: number;
  /** Whitelisted assets */
  assets: Asset[];
}

/**
 * Signer information from Stellar account
 */
export interface SignerInfo {
  key: string;
  weight: number;
  type: 'ed25519_public_key' | 'sha256_hash' | 'preauth_tx';
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Settlement failure types
 */
export enum SettlementFailure {
  POM_MISMATCH = 'POM_MISMATCH',
  PARTIAL_SUBMISSION = 'PARTIAL_SUBMISSION',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  HORIZON_TIMEOUT = 'HORIZON_TIMEOUT',
  THRESHOLD_NOT_MET = 'THRESHOLD_NOT_MET',
  ALREADY_SETTLED = 'ALREADY_SETTLED',
}

/**
 * Custom error class for settlement failures
 */
export class SettlementError extends Error {
  constructor(
    public readonly failure: SettlementFailure,
    message: string,
    public readonly details?: unknown
  ) {
    super(`[${failure}] ${message}`);
    this.name = 'SettlementError';
  }

  /**
   * Check if this error should halt the system
   */
  shouldHalt(): boolean {
    const haltConditions = [
      SettlementFailure.POM_MISMATCH,
      SettlementFailure.PARTIAL_SUBMISSION,
      SettlementFailure.THRESHOLD_NOT_MET,
    ];
    return haltConditions.includes(this.failure);
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Network configuration
 */
export interface NetworkConfig {
  horizonUrl: string;
  networkPassphrase: string;
  isTestnet: boolean;
}

/**
 * Stellar testnet configuration
 */
export const TESTNET_CONFIG: NetworkConfig = {
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  isTestnet: true,
};

/**
 * Stellar mainnet configuration
 */
export const MAINNET_CONFIG: NetworkConfig = {
  horizonUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  isTestnet: false,
};

// =============================================================================
// Constants
// =============================================================================

/**
 * Stellar constants
 */
export const STELLAR_CONSTANTS = {
  /** Base reserve in stroops (0.5 XLM) */
  BASE_RESERVE_STROOPS: 5000000n,
  /** Minimum balance for an account (1 XLM) */
  MIN_BALANCE_STROOPS: 10000000n,
  /** Additional reserve per entry (0.5 XLM) */
  ENTRY_RESERVE_STROOPS: 5000000n,
  /** Maximum operations per transaction */
  MAX_OPS_PER_TX: 100,
  /** Stroops per XLM */
  STROOPS_PER_XLM: 10000000n,
} as const;
