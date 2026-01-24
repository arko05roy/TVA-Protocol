/**
 * ASTRAEUS - Multisig Orchestrator
 *
 * Handles signature collection and transaction submission for settlement.
 *
 * Per agent/plan.md Section B4 (Multisig Orchestration):
 * - Signer coordination
 * - Transaction signature aggregation
 * - Retry logic
 *
 * Steps:
 * 1. Fetch commitment
 * 2. Recompute NetOutflow (sanity check)
 * 3. Verify tx matches PoM delta
 * 4. Sign tx
 * 5. Submit to Stellar
 *
 * Per agent/plan.md Section 9.2 (Attack Analysis):
 * - PoM mismatch → HALT (never submit)
 * - Funds must remain safe
 */
import { Transaction, Keypair, FeeBumpTransaction } from '@stellar/stellar-sdk';
import { PomDelta, NetworkConfig, TreasurySnapshot } from '../interfaces/types';
import { DetailedSettlementPlan } from './settlement_planner';
/**
 * Result of transaction submission
 */
export interface SubmissionResult {
    hash: string;
    ledger: number;
    successful: boolean;
}
/**
 * Result of settlement execution
 */
export interface SettlementExecutionResult {
    success: boolean;
    transactionResults: Array<{
        index: number;
        hash: string;
        ledger: number;
        withdrawalCount: number;
    }>;
    failedAt?: number;
    error?: string;
}
/**
 * Multisig Orchestrator class
 *
 * Coordinates signature collection and transaction submission
 * with strict PoM verification.
 */
export declare class MultisigOrchestrator {
    private server;
    private networkPassphrase;
    private config;
    constructor(config?: NetworkConfig);
    /**
     * Verify that settlement plan matches PoM delta exactly.
     *
     * Per plan.md B4: "Verify tx matches PoM delta"
     * Per core-idea.md Section 5.2: "PoM proves execution is payable"
     *
     * This is a CRITICAL safety check. If mismatched, the system MUST HALT.
     * Never submit transactions that don't match the expected PoM delta.
     *
     * @param plan - Settlement plan to verify
     * @param expectedDelta - PoM delta from withdrawal queue
     * @throws SettlementError with POM_MISMATCH if verification fails
     */
    verifySettlementMatchesPoM(plan: DetailedSettlementPlan, expectedDelta: PomDelta): void;
    /**
     * Verify that treasury has sufficient balance for settlement.
     *
     * Per core-idea.md Section 5.1 (PoM Definition):
     * "∀a: Δ(a) ≤ T(a)" - For each asset, outflow must not exceed treasury balance
     *
     * @param expectedDelta - PoM delta (required outflows)
     * @param snapshot - Current treasury snapshot
     * @throws SettlementError with INSUFFICIENT_BALANCE if insolvent
     */
    verifySolvency(expectedDelta: PomDelta, snapshot: TreasurySnapshot): void;
    /**
     * Verify that we have enough signers to meet threshold.
     *
     * Per plan.md A4.3 (Authorization Checks):
     * - signer set ⊆ auditor set
     * - threshold satisfiable
     *
     * @param availableSigners - Keypairs available for signing
     * @param snapshot - Treasury snapshot with signer info
     * @throws SettlementError with THRESHOLD_NOT_MET if insufficient signers
     */
    verifySignerThreshold(availableSigners: Keypair[], snapshot: TreasurySnapshot): void;
    /**
     * Sign a transaction with multiple signers.
     *
     * @param transaction - Transaction to sign
     * @param signerKeypairs - Array of signer keypairs
     * @param threshold - Required number of signatures
     * @returns Signed transaction
     */
    signTransaction(transaction: Transaction, signerKeypairs: Keypair[], threshold: number): Transaction;
    /**
     * Submit a signed transaction to Stellar.
     *
     * Per plan.md B4: "Submit to Stellar"
     *
     * @param transaction - Signed transaction
     * @returns Submission result with hash and ledger
     */
    submitTransaction(transaction: Transaction | FeeBumpTransaction): Promise<SubmissionResult>;
    /**
     * Submit transaction with retry logic.
     *
     * Per plan.md B6 (Failure Handling):
     * - Network retries
     * - Idempotency (memo-based)
     *
     * @param transaction - Signed transaction
     * @param maxRetries - Maximum retry attempts
     * @param retryDelayMs - Base delay between retries
     * @returns Submission result
     */
    submitWithRetry(transaction: Transaction | FeeBumpTransaction, maxRetries?: number, retryDelayMs?: number): Promise<SubmissionResult>;
    /**
     * Execute full settlement with all verifications.
     *
     * This is the main entry point for settlement execution.
     * Performs all safety checks before submitting any transactions.
     *
     * Per plan.md B4 Steps:
     * 1. Fetch commitment (passed in as plan)
     * 2. Recompute NetOutflow (sanity check)
     * 3. Verify tx matches PoM delta
     * 4. Sign tx
     * 5. Submit to Stellar
     *
     * @param plan - Settlement plan to execute
     * @param expectedDelta - Expected PoM delta for verification
     * @param snapshot - Current treasury snapshot
     * @param signerKeypairs - Available signer keypairs
     * @returns Execution result with all transaction hashes
     */
    executeSettlement(plan: DetailedSettlementPlan, expectedDelta: PomDelta, snapshot: TreasurySnapshot, signerKeypairs: Keypair[]): Promise<SettlementExecutionResult>;
}
/**
 * Create a MultisigOrchestrator for testnet
 */
export declare function createTestnetOrchestrator(): MultisigOrchestrator;
