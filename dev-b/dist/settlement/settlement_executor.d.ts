/**
 * ASTRAEUS - Settlement Executor
 *
 * End-to-end settlement execution orchestrating all components.
 *
 * Per agent/plan.md Section B (Dev B Overview):
 * "Dev B owns everything that touches Stellar L1 but never mutates execution state."
 *
 * Per duo.md Phase 6 (Full Flow):
 * 11. [Dev B] Receive commitment event
 * 12. [Dev B] Fetch withdrawal queue from Dev A
 * 13. [Dev B] Build settlement plan
 * 14. [Dev B] Verify plan matches PoM delta
 * 15. [Dev B] Sign and submit transactions
 * 16. [Dev B] Verify L1 balances changed correctly
 * 17. [Dev B] Send settlement confirmation to Dev A
 *
 * CRITICAL REMINDERS (from duo.md):
 * 1. NEVER use keccak256 — All hashes are SHA-256
 * 2. NEVER submit if PoM doesn't match — Halt immediately
 * 3. NEVER set internal FX prices — Use Stellar DEX only
 * 4. NEVER mutate execution state — You only move money
 * 5. ALWAYS verify before submit — Re-compute delta locally
 * 6. ALWAYS use memo-based idempotency — Prevent double-settlement
 * 7. ALWAYS halt on partial failure — Don't leave inconsistent state
 */
import { Keypair } from '@stellar/stellar-sdk';
import { WithdrawalIntent, CommitmentEvent, SettlementConfirmation, SettlementResult, NetworkConfig } from '../interfaces/types';
/**
 * Settlement Executor configuration
 */
export interface SettlementExecutorConfig {
    /** Vault address (G... format) */
    vaultAddress: string;
    /** Signer keypairs for multisig */
    signerKeypairs: Keypair[];
    /** Network configuration */
    networkConfig: NetworkConfig;
}
/**
 * Settlement Executor class
 *
 * Main orchestration layer for end-to-end settlement execution.
 * Implements the full settlement flow as specified in duo.md Phase 6.
 */
export declare class SettlementExecutor {
    private config;
    private planner;
    private orchestrator;
    private replayProtection;
    private snapshotService;
    constructor(config: SettlementExecutorConfig);
    /**
     * Execute settlement for a commitment event.
     *
     * This is the main entry point implementing the full flow from duo.md Phase 6.
     *
     * @param event - Commitment event from Dev A
     * @param withdrawals - Withdrawal queue from Dev A's contract
     * @returns Settlement result with transaction hashes
     */
    executeSettlement(event: CommitmentEvent, withdrawals: WithdrawalIntent[]): Promise<SettlementResult>;
    /**
     * Get settlement confirmation for Dev A.
     *
     * Per duo.md Interface 3 (Settlement Confirmation):
     * Dev B → Dev A: { subnet_id, block_number, tx_hashes, memo, timestamp }
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement confirmation or undefined
     */
    getSettlementConfirmation(subnetId: string, blockNumber: bigint): SettlementConfirmation | undefined;
    /**
     * Check if a settlement exists (for querying).
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns True if settlement exists (any status)
     */
    hasSettlement(subnetId: string, blockNumber: bigint): boolean;
    /**
     * Get settlement statistics.
     */
    getStats(): {
        pending: number;
        confirmed: number;
        failed: number;
    };
    /**
     * Handle commitment event from Dev A.
     *
     * This is the event handler that would be called when Dev A commits a state root.
     * It fetches the withdrawal queue and triggers settlement.
     *
     * @param event - Commitment event
     * @param fetchWithdrawals - Function to fetch withdrawals from Dev A
     * @returns Settlement result
     */
    onCommitmentEvent(event: CommitmentEvent, fetchWithdrawals: (subnetId: string, blockNumber: bigint) => Promise<WithdrawalIntent[]>): Promise<SettlementResult>;
}
/**
 * Create a SettlementExecutor for testnet
 */
export declare function createTestnetSettlementExecutor(vaultAddress: string, signerKeypairs: Keypair[]): SettlementExecutor;
/**
 * Commitment event listener interface.
 *
 * This would be implemented to listen for events from Dev A's commitment contract.
 */
export interface CommitmentEventListener {
    /**
     * Start listening for commitment events.
     * @param handler - Handler function called when event is received
     */
    start(handler: (event: CommitmentEvent) => Promise<void>): void;
    /**
     * Stop listening.
     */
    stop(): void;
}
