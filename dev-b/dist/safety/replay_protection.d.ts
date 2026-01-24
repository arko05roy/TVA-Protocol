/**
 * ASTRAEUS - Replay Protection
 *
 * Prevents double-settlement using memo-based deduplication.
 *
 * Per agent/interfaces.md Section 8 (Determinism and Replay Protection):
 * - Each settlement is bound to memo = first_28_bytes(SHA256(subnet_id || block_number))
 * - This ensures:
 *   - No double settlement
 *   - No cross-subnet confusion
 *   - Full traceability
 *
 * Per agent/plan.md B6 (Failure Handling):
 * - Idempotency (memo-based)
 * - Tx hash tracking
 */
import { NetworkConfig, SettlementConfirmation } from '../interfaces/types';
/**
 * Settlement record for tracking
 */
export interface SettlementRecord {
    subnetId: string;
    blockNumber: bigint;
    memoHex: string;
    txHashes: string[];
    ledgers: number[];
    timestamp: Date;
    status: 'pending' | 'confirmed' | 'failed';
    error?: string;
}
/**
 * Replay Protection Service
 *
 * Tracks settlements and prevents double-processing using memo-based deduplication.
 */
export declare class ReplayProtectionService {
    private server;
    private config;
    /** In-memory settlement log (could be persisted to database) */
    private settlementLog;
    constructor(config?: NetworkConfig);
    /**
     * Generate a unique key for a settlement (subnet_id + block_number).
     */
    private getSettlementKey;
    /**
     * Check if a settlement has already been processed.
     *
     * Per interfaces.md Section 8:
     * - Query Horizon for transactions with this memo
     * - If found, the settlement is already complete
     *
     * @param vaultAddress - Vault address to check transactions for
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns True if already settled, false otherwise
     */
    isAlreadySettled(vaultAddress: string, subnetId: string, blockNumber: bigint): Promise<boolean>;
    /**
     * Record a pending settlement (before submission).
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement record
     */
    recordPendingSettlement(subnetId: string, blockNumber: bigint): SettlementRecord;
    /**
     * Record a confirmed settlement (after successful submission).
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @param txHashes - Array of transaction hashes
     * @param ledgers - Array of ledger numbers
     */
    recordConfirmedSettlement(subnetId: string, blockNumber: bigint, txHashes: string[], ledgers: number[]): void;
    /**
     * Record a failed settlement.
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @param error - Error message
     */
    recordFailedSettlement(subnetId: string, blockNumber: bigint, error: string): void;
    /**
     * Get settlement record for a specific block.
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement record or undefined
     */
    getSettlementRecord(subnetId: string, blockNumber: bigint): SettlementRecord | undefined;
    /**
     * Get all settlement records for a subnet.
     *
     * @param subnetId - Subnet identifier
     * @returns Array of settlement records
     */
    getSubnetSettlements(subnetId: string): SettlementRecord[];
    /**
     * Create settlement confirmation for Dev A.
     *
     * Per duo.md Interface 3 (Settlement Confirmation):
     * {
     *   subnet_id: string,
     *   block_number: number,
     *   tx_hashes: string[],
     *   memo: string,
     *   timestamp: string
     * }
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement confirmation or undefined if not found
     */
    getSettlementConfirmation(subnetId: string, blockNumber: bigint): SettlementConfirmation | undefined;
    /**
     * Clear all records (for testing).
     */
    clearAll(): void;
    /**
     * Get count of settlements by status.
     */
    getStats(): {
        pending: number;
        confirmed: number;
        failed: number;
    };
}
/**
 * Create a ReplayProtectionService for testnet
 */
export declare function createTestnetReplayProtection(): ReplayProtectionService;
