/**
 * ASTRAEUS - Dev B Shared Types
 *
 * These types match the interface specifications in agent/interfaces.md
 * and the withdrawal queue format in contracts/WITHDRAWAL_QUEUE_FORMAT.md
 */
import { Asset as StellarAsset, Transaction } from '@stellar/stellar-sdk';
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
export declare function toStellarAsset(asset: Asset): StellarAsset;
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
    balances: {
        [asset_id_hex: string]: string;
    };
    signers: string[];
    threshold: number;
}
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
/**
 * Settlement failure types
 */
export declare enum SettlementFailure {
    POM_MISMATCH = "POM_MISMATCH",
    PARTIAL_SUBMISSION = "PARTIAL_SUBMISSION",
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    PATH_NOT_FOUND = "PATH_NOT_FOUND",
    SLIPPAGE_EXCEEDED = "SLIPPAGE_EXCEEDED",
    HORIZON_TIMEOUT = "HORIZON_TIMEOUT",
    THRESHOLD_NOT_MET = "THRESHOLD_NOT_MET",
    ALREADY_SETTLED = "ALREADY_SETTLED"
}
/**
 * Custom error class for settlement failures
 */
export declare class SettlementError extends Error {
    readonly failure: SettlementFailure;
    readonly details?: unknown | undefined;
    constructor(failure: SettlementFailure, message: string, details?: unknown | undefined);
    /**
     * Check if this error should halt the system
     */
    shouldHalt(): boolean;
}
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
export declare const TESTNET_CONFIG: NetworkConfig;
/**
 * Stellar mainnet configuration
 */
export declare const MAINNET_CONFIG: NetworkConfig;
/**
 * Stellar constants
 */
export declare const STELLAR_CONSTANTS: {
    /** Base reserve in stroops (0.5 XLM) */
    readonly BASE_RESERVE_STROOPS: 5000000n;
    /** Minimum balance for an account (1 XLM) */
    readonly MIN_BALANCE_STROOPS: 10000000n;
    /** Additional reserve per entry (0.5 XLM) */
    readonly ENTRY_RESERVE_STROOPS: 5000000n;
    /** Maximum operations per transaction */
    readonly MAX_OPS_PER_TX: 100;
    /** Stroops per XLM */
    readonly STROOPS_PER_XLM: 10000000n;
};
