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
import {
  WithdrawalIntent,
  CommitmentEvent,
  SettlementConfirmation,
  SettlementResult,
  NetworkConfig,
  TESTNET_CONFIG,
  SettlementError,
  SettlementFailure,
} from '../interfaces/types';
import { SettlementPlanner, DetailedSettlementPlan } from './settlement_planner';
import { MultisigOrchestrator, SettlementExecutionResult } from './multisig_orchestrator';
import { ReplayProtectionService } from '../safety/replay_protection';
import { TreasurySnapshotService } from '../snapshot/treasury_snapshot';
import { computeNetOutflow } from './pom_delta';

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
  /** Skip Horizon check in replay protection (for testing) */
  skipHorizonCheck?: boolean;
}

/**
 * Settlement Executor class
 *
 * Main orchestration layer for end-to-end settlement execution.
 * Implements the full settlement flow as specified in duo.md Phase 6.
 */
export class SettlementExecutor {
  private config: SettlementExecutorConfig;
  private planner: SettlementPlanner;
  private orchestrator: MultisigOrchestrator;
  private replayProtection: ReplayProtectionService;
  private snapshotService: TreasurySnapshotService;

  constructor(config: SettlementExecutorConfig) {
    this.config = config;
    this.planner = new SettlementPlanner(config.networkConfig);
    this.orchestrator = new MultisigOrchestrator(config.networkConfig);
    this.replayProtection = new ReplayProtectionService(
      config.networkConfig,
      config.skipHorizonCheck ?? false
    );
    this.snapshotService = new TreasurySnapshotService(config.networkConfig);
  }

  /**
   * Execute settlement for a commitment event.
   *
   * This is the main entry point implementing the full flow from duo.md Phase 6.
   *
   * @param event - Commitment event from Dev A
   * @param withdrawals - Withdrawal queue from Dev A's contract
   * @returns Settlement result with transaction hashes
   */
  async executeSettlement(
    event: CommitmentEvent,
    withdrawals: WithdrawalIntent[]
  ): Promise<SettlementResult> {
    const { subnet_id, block_number } = event;

    try {
      // Step 1: Check for replay (memo-based idempotency)
      // Per duo.md: "ALWAYS use memo-based idempotency — Prevent double-settlement"
      const alreadySettled = await this.replayProtection.isAlreadySettled(
        this.config.vaultAddress,
        subnet_id,
        block_number
      );

      if (alreadySettled) {
        const confirmation = this.replayProtection.getSettlementConfirmation(
          subnet_id,
          block_number
        );

        return {
          status: 'already_settled',
          tx_hashes: confirmation?.tx_hashes || [],
          memo: confirmation?.memo || '',
        };
      }

      // Step 2: Handle empty withdrawal queue
      if (withdrawals.length === 0) {
        // Even for empty queues, record as confirmed to prevent duplicate processing
        this.replayProtection.recordPendingSettlement(subnet_id, block_number);
        this.replayProtection.recordConfirmedSettlement(subnet_id, block_number, [], []);
        return {
          status: 'confirmed',
          tx_hashes: [],
          memo: '',
        };
      }

      // Step 3: Record pending settlement
      this.replayProtection.recordPendingSettlement(subnet_id, block_number);

      // Step 4: Get treasury snapshot for solvency check
      // Per duo.md: "ALWAYS verify before submit — Re-compute delta locally"
      const snapshot = await this.snapshotService.getTreasurySnapshot(
        this.config.vaultAddress
      );

      // Step 5: Compute PoM delta from withdrawals
      const pomDelta = computeNetOutflow(withdrawals);

      // Step 6: Build settlement plan
      const plan = await this.planner.buildSettlementPlan(
        this.config.vaultAddress,
        subnet_id,
        block_number,
        withdrawals
      );

      // Step 7: Execute settlement (includes PoM verification)
      // Per duo.md: "NEVER submit if PoM doesn't match — Halt immediately"
      const executionResult = await this.orchestrator.executeSettlement(
        plan,
        pomDelta,
        snapshot,
        this.config.signerKeypairs
      );

      // Step 8: Record result
      if (executionResult.success) {
        const txHashes = executionResult.transactionResults.map((r) => r.hash);
        const ledgers = executionResult.transactionResults.map((r) => r.ledger);

        this.replayProtection.recordConfirmedSettlement(
          subnet_id,
          block_number,
          txHashes,
          ledgers
        );

        return {
          status: 'confirmed',
          tx_hashes: txHashes,
          memo: plan.memoHex,
        };
      } else {
        // Per duo.md: "ALWAYS halt on partial failure — Don't leave inconsistent state"
        this.replayProtection.recordFailedSettlement(
          subnet_id,
          block_number,
          executionResult.error || 'Unknown error'
        );

        return {
          status: 'failed',
          tx_hashes: executionResult.transactionResults.map((r) => r.hash),
          memo: plan.memoHex,
          error: executionResult.error,
        };
      }
    } catch (error: any) {
      // Handle errors
      this.replayProtection.recordFailedSettlement(
        subnet_id,
        block_number,
        error.message
      );

      // Re-throw if it's a critical error that should halt
      if (error instanceof SettlementError && error.shouldHalt()) {
        throw error;
      }

      return {
        status: 'failed',
        tx_hashes: [],
        memo: '',
        error: error.message,
      };
    }
  }

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
  getSettlementConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined {
    return this.replayProtection.getSettlementConfirmation(subnetId, blockNumber);
  }

  /**
   * Check if a settlement exists (for querying).
   *
   * @param subnetId - Subnet identifier
   * @param blockNumber - Block number
   * @returns True if settlement exists (any status)
   */
  hasSettlement(subnetId: string, blockNumber: bigint): boolean {
    return this.replayProtection.getSettlementRecord(subnetId, blockNumber) !== undefined;
  }

  /**
   * Get settlement statistics.
   */
  getStats(): { pending: number; confirmed: number; failed: number } {
    return this.replayProtection.getStats();
  }

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
  async onCommitmentEvent(
    event: CommitmentEvent,
    fetchWithdrawals: (subnetId: string, blockNumber: bigint) => Promise<WithdrawalIntent[]>
  ): Promise<SettlementResult> {
    // Fetch withdrawal queue from Dev A
    const withdrawals = await fetchWithdrawals(event.subnet_id, event.block_number);

    // Execute settlement
    return this.executeSettlement(event, withdrawals);
  }
}

/**
 * Create a SettlementExecutor for testnet
 */
export function createTestnetSettlementExecutor(
  vaultAddress: string,
  signerKeypairs: Keypair[]
): SettlementExecutor {
  return new SettlementExecutor({
    vaultAddress,
    signerKeypairs,
    networkConfig: TESTNET_CONFIG,
  });
}

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
