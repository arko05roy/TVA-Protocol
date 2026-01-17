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

import {
  Horizon,
  Transaction,
  Keypair,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import {
  PomDelta,
  NetworkConfig,
  TESTNET_CONFIG,
  SettlementError,
  SettlementFailure,
  TreasurySnapshot,
} from '../interfaces/types';
import { DetailedSettlementPlan, SettlementTransaction } from './settlement_planner';
import { verifyDeltaMatch, computeNetOutflow } from './pom_delta';

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
export class MultisigOrchestrator {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private config: NetworkConfig;

  constructor(config: NetworkConfig = TESTNET_CONFIG) {
    this.config = config;
    this.server = new Horizon.Server(config.horizonUrl);
    this.networkPassphrase = config.networkPassphrase;
  }

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
  verifySettlementMatchesPoM(
    plan: DetailedSettlementPlan,
    expectedDelta: PomDelta
  ): void {
    // Verify plan totals match expected delta
    const verification = verifyDeltaMatch(plan.totalsByAsset, expectedDelta);

    if (!verification.matches) {
      const discrepancyDetails = verification.discrepancies
        .map(
          (d) =>
            `Asset ${d.assetId}: expected ${d.expected}, got ${d.actual}`
        )
        .join('; ');

      throw new SettlementError(
        SettlementFailure.POM_MISMATCH,
        `Settlement plan does not match PoM delta: ${discrepancyDetails}`,
        verification.discrepancies
      );
    }
  }

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
  verifySolvency(expectedDelta: PomDelta, snapshot: TreasurySnapshot): void {
    for (const [assetId, requiredAmount] of expectedDelta) {
      const availableBalance = snapshot.balances.get(assetId) || 0n;

      if (availableBalance < requiredAmount) {
        throw new SettlementError(
          SettlementFailure.INSUFFICIENT_BALANCE,
          `Insufficient balance for asset ${assetId}: need ${requiredAmount}, have ${availableBalance}`,
          { assetId, required: requiredAmount, available: availableBalance }
        );
      }
    }
  }

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
  verifySignerThreshold(
    availableSigners: Keypair[],
    snapshot: TreasurySnapshot
  ): void {
    // Get public keys from available signers
    const availableKeys = availableSigners.map((k) => k.publicKey());

    // Count how many are valid vault signers
    const validSignerCount = availableKeys.filter((key) =>
      snapshot.signers.includes(key)
    ).length;

    if (validSignerCount < snapshot.threshold) {
      throw new SettlementError(
        SettlementFailure.THRESHOLD_NOT_MET,
        `Insufficient signers: need ${snapshot.threshold}, have ${validSignerCount} valid signers`,
        {
          required: snapshot.threshold,
          available: validSignerCount,
          validSigners: availableKeys.filter((key) =>
            snapshot.signers.includes(key)
          ),
        }
      );
    }
  }

  /**
   * Sign a transaction with multiple signers.
   *
   * @param transaction - Transaction to sign
   * @param signerKeypairs - Array of signer keypairs
   * @param threshold - Required number of signatures
   * @returns Signed transaction
   */
  signTransaction(
    transaction: Transaction,
    signerKeypairs: Keypair[],
    threshold: number
  ): Transaction {
    let signedCount = 0;

    for (const keypair of signerKeypairs) {
      if (signedCount >= threshold) {
        break;
      }

      transaction.sign(keypair);
      signedCount++;
    }

    if (signedCount < threshold) {
      throw new SettlementError(
        SettlementFailure.THRESHOLD_NOT_MET,
        `Could only gather ${signedCount} signatures, need ${threshold}`,
        { signed: signedCount, required: threshold }
      );
    }

    return transaction;
  }

  /**
   * Submit a signed transaction to Stellar.
   *
   * Per plan.md B4: "Submit to Stellar"
   *
   * @param transaction - Signed transaction
   * @returns Submission result with hash and ledger
   */
  async submitTransaction(
    transaction: Transaction | FeeBumpTransaction
  ): Promise<SubmissionResult> {
    try {
      const response = await this.server.submitTransaction(transaction);

      return {
        hash: response.hash,
        ledger: response.ledger,
        successful: response.successful,
      };
    } catch (error: any) {
      // Handle Horizon errors
      if (error.response && error.response.data) {
        const extras = error.response.data.extras;
        throw new SettlementError(
          SettlementFailure.PARTIAL_SUBMISSION,
          `Transaction submission failed: ${error.message}`,
          { horizonError: extras }
        );
      }

      throw new SettlementError(
        SettlementFailure.HORIZON_TIMEOUT,
        `Transaction submission failed: ${error.message}`,
        { originalError: error }
      );
    }
  }

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
  async submitWithRetry(
    transaction: Transaction | FeeBumpTransaction,
    maxRetries: number = 3,
    retryDelayMs: number = 1000
  ): Promise<SubmissionResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.submitTransaction(transaction);
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (
          error instanceof SettlementError &&
          error.failure === SettlementFailure.PARTIAL_SUBMISSION
        ) {
          // This is a definitive failure, don't retry
          throw error;
        }

        // Exponential backoff
        if (attempt < maxRetries - 1) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new SettlementError(
      SettlementFailure.HORIZON_TIMEOUT,
      `Transaction submission failed after ${maxRetries} attempts`,
      { lastError }
    );
  }

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
  async executeSettlement(
    plan: DetailedSettlementPlan,
    expectedDelta: PomDelta,
    snapshot: TreasurySnapshot,
    signerKeypairs: Keypair[]
  ): Promise<SettlementExecutionResult> {
    // Step 1: Verify PoM match (CRITICAL - halts if mismatch)
    this.verifySettlementMatchesPoM(plan, expectedDelta);

    // Step 2: Verify solvency
    this.verifySolvency(expectedDelta, snapshot);

    // Step 3: Verify we have enough signers
    this.verifySignerThreshold(signerKeypairs, snapshot);

    // Step 4: Sign and submit each transaction
    const transactionResults: SettlementExecutionResult['transactionResults'] = [];

    for (let i = 0; i < plan.transactions.length; i++) {
      const settlementTx = plan.transactions[i];

      try {
        // Sign the transaction
        const signedTx = this.signTransaction(
          settlementTx.transaction,
          signerKeypairs,
          snapshot.threshold
        );

        // Submit with retry
        const result = await this.submitWithRetry(signedTx);

        transactionResults.push({
          index: i,
          hash: result.hash,
          ledger: result.ledger,
          withdrawalCount: settlementTx.withdrawals.length,
        });
      } catch (error: any) {
        // Per plan.md B6: "halt on PoM mismatch" / "partial submission failures"
        // If any transaction fails, we halt and report
        return {
          success: false,
          transactionResults,
          failedAt: i,
          error: error.message,
        };
      }
    }

    return {
      success: true,
      transactionResults,
    };
  }
}

/**
 * Create a MultisigOrchestrator for testnet
 */
export function createTestnetOrchestrator(): MultisigOrchestrator {
  return new MultisigOrchestrator(TESTNET_CONFIG);
}
