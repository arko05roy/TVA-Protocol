/**
 * ASTRAEUS - Settlement Planner
 *
 * Builds deterministic Stellar transactions from withdrawal queues.
 *
 * Per agent/plan.md Section B3 (Settlement Planner):
 * - Input: committed_state_root, withdrawal_queue
 * - Output: SettlementPlan { txs[] }
 * - Rules: batch per asset, deterministic ordering, memo = H(subnet_id || block_number)
 *
 * Per agent/interfaces.md Section 3 (Memo Format):
 * - memo = first_28_bytes(SHA256(subnet_id || block_number))
 *
 * Per agent/interfaces.md Section 7.2 (Transaction Construction):
 * - Native/Issued → Payment
 * - FX required → PathPaymentStrictReceive
 * - Memo encodes (subnet_id, block_number)
 * - Fails atomically if constraints violated
 */
import { Asset, Transaction } from '@stellar/stellar-sdk';
import { WithdrawalIntent, NetworkConfig, Asset as AstraeusAsset } from '../interfaces/types';
/**
 * Settlement transaction with metadata
 */
export interface SettlementTransaction {
    /** The built Stellar transaction (unsigned) */
    transaction: Transaction;
    /** Withdrawals included in this transaction */
    withdrawals: WithdrawalIntent[];
    /** Asset being settled */
    assetId: string;
}
/**
 * Extended settlement plan with transaction details
 */
export interface DetailedSettlementPlan {
    subnetId: string;
    blockNumber: bigint;
    /** 28-byte memo as hex string */
    memoHex: string;
    /** Memo as Buffer for Stellar SDK */
    memoBuffer: Buffer;
    /** Settlement transactions */
    transactions: SettlementTransaction[];
    /** Total withdrawals processed */
    totalWithdrawals: number;
    /** Total amount per asset (for verification) */
    totalsByAsset: Map<string, bigint>;
}
/**
 * Settlement Planner class
 *
 * Builds Stellar transactions from withdrawal queues following
 * the specifications in interfaces.md and plan.md.
 */
export declare class SettlementPlanner {
    private server;
    private networkPassphrase;
    private config;
    constructor(config?: NetworkConfig);
    /**
     * Build a complete settlement plan from withdrawal queue.
     *
     * Per plan.md B3 and interfaces.md Section 3:
     * 1. Compute memo = first_28_bytes(SHA256(subnet_id || block_number))
     * 2. Group withdrawals by asset
     * 3. Sort deterministically within each group
     * 4. Build transactions (max 100 ops each)
     * 5. Attach memo to each transaction
     *
     * @param vaultAddress - Stellar address of the treasury vault (G... format)
     * @param subnetId - Subnet identifier (bytes32, hex string)
     * @param blockNumber - Block number (uint64)
     * @param withdrawals - Array of withdrawal intents from ExecutionCore
     * @returns Detailed settlement plan with all transactions
     */
    buildSettlementPlan(vaultAddress: string, subnetId: string, blockNumber: bigint, withdrawals: WithdrawalIntent[]): Promise<DetailedSettlementPlan>;
    /**
     * Build a payment transaction for a batch of withdrawals.
     *
     * Per interfaces.md Section 7.2:
     * - Native → Payment
     * - Issued → Payment
     * - Each tx encodes memo
     * - Fails atomically
     *
     * @param vaultAddress - Source vault address
     * @param sequenceNumber - Transaction sequence number
     * @param withdrawals - Batch of withdrawals (same asset)
     * @param memo - 28-byte memo buffer
     * @returns Built (unsigned) transaction
     */
    private buildPaymentTransaction;
    /**
     * Build a PathPaymentStrictReceive transaction for FX settlement.
     *
     * Per plan.md B5 (FX Handling):
     * - Uses PathPaymentStrictReceive
     * - Never sets internal prices
     * - Never uses oracles
     * - FX happens after execution, never inside PoM
     *
     * @param vaultAddress - Source vault address
     * @param sequenceNumber - Transaction sequence number
     * @param withdrawal - Single withdrawal requiring FX
     * @param sendAsset - Asset the vault will send
     * @param sendMax - Maximum amount to send (with slippage)
     * @param path - Intermediate path assets
     * @param memo - 28-byte memo buffer
     * @returns Built (unsigned) transaction
     */
    buildPathPaymentTransaction(vaultAddress: string, sequenceNumber: string, withdrawal: WithdrawalIntent, sendAsset: AstraeusAsset, sendMax: bigint, path: Asset[], memo: Buffer): Promise<Transaction>;
    /**
     * Batch withdrawals into groups respecting Stellar's max operations limit.
     *
     * Per STELLAR_CONSTANTS.MAX_OPS_PER_TX (100 operations max)
     *
     * @param withdrawals - Sorted array of withdrawals
     * @returns Array of batches
     */
    private batchWithdrawals;
    /**
     * Convert withdrawal destination to Stellar address.
     *
     * Destination comes from Dev A as bytes32 (hex) or G... address.
     * Per contracts/WITHDRAWAL_QUEUE_FORMAT.md: destination is Ed25519 pubkey
     *
     * @param destination - Destination from withdrawal intent
     * @returns Stellar address (G... format)
     */
    private convertDestination;
    /**
     * Convert asset to Stellar SDK Asset.
     *
     * Per contracts/WITHDRAWAL_QUEUE_FORMAT.md:
     * - issuer = "NATIVE" for XLM
     * - issuer = bytes32 hex for issued assets
     *
     * @param assetCode - Asset code (e.g., "USDC", "XLM")
     * @param issuer - "NATIVE" or issuer address/hex
     * @returns Stellar SDK Asset
     */
    private toStellarAsset;
    /**
     * Convert stroops to decimal string for Stellar SDK.
     *
     * Stellar SDK uses string amounts with 7 decimal places.
     * 1 XLM = 10,000,000 stroops
     *
     * @param stroops - Amount in stroops
     * @returns Decimal string (e.g., "10.0000000")
     */
    private stroopsToDecimal;
    /**
     * Calculate transaction fee based on number of operations.
     *
     * Base fee is 100 stroops per operation.
     *
     * @param numOperations - Number of operations in transaction
     * @returns Total fee in stroops
     */
    private calculateFee;
}
/**
 * Create a SettlementPlanner for testnet
 */
export declare function createTestnetSettlementPlanner(): SettlementPlanner;
