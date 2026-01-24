/**
 * ASTRAEUS - Dev B Module Exports
 *
 * Stellar Treasury, Settlement, and FX Layer
 *
 * This module provides everything Dev B needs for:
 * - Vault management (create, configure multisig)
 * - Treasury snapshots (for PoM validation)
 * - Settlement planning (build Stellar transactions)
 * - Settlement execution (sign, submit, track)
 * - Replay protection (memo-based deduplication)
 */

// =============================================================================
// Types and Interfaces
// =============================================================================
export * from './interfaces/types';
export * from './interfaces/crypto';

// =============================================================================
// Vault Management
// =============================================================================
export {
  VaultManager,
  VaultCreationResult,
  createTestnetVaultManager,
  generateTestAuditors,
} from './vault/vault_manager';

// =============================================================================
// Treasury Snapshot
// =============================================================================
export {
  TreasurySnapshotService,
  createTestnetSnapshotService,
  stroopsToDecimal,
  decimalToStroops,
} from './snapshot/treasury_snapshot';

// =============================================================================
// PoM Delta Computation
// =============================================================================
export {
  computeNetOutflow,
  pomDeltaToJSON,
  pomDeltaFromJSON,
  verifyDeltaMatch,
  groupWithdrawalsByAsset,
  sortWithdrawalsDeterministically,
} from './settlement/pom_delta';

// =============================================================================
// Settlement Planning
// =============================================================================
export {
  SettlementPlanner,
  SettlementTransaction,
  DetailedSettlementPlan,
  createTestnetSettlementPlanner,
} from './settlement/settlement_planner';

// =============================================================================
// Multisig Orchestration
// =============================================================================
export {
  MultisigOrchestrator,
  SubmissionResult,
  SettlementExecutionResult,
  createTestnetOrchestrator,
} from './settlement/multisig_orchestrator';

// =============================================================================
// Replay Protection
// =============================================================================
export {
  ReplayProtectionService,
  SettlementRecord,
  createTestnetReplayProtection,
} from './safety/replay_protection';

// =============================================================================
// Settlement Execution (Main Entry Point)
// =============================================================================
export {
  SettlementExecutor,
  SettlementExecutorConfig,
  CommitmentEventListener,
  createTestnetSettlementExecutor,
} from './settlement/settlement_executor';

// =============================================================================
// FX Engine
// =============================================================================
export {
  FxEngine,
  PathResult,
  FxSettlementResult,
  SlippageConfig,
  DEFAULT_SLIPPAGE_CONFIG,
  createTestnetFxEngine,
} from './fx/fx_engine';

// =============================================================================
// Failure Handling
// =============================================================================
export {
  FailureHandler,
  FailureSeverity,
  RecoveryAction,
  FailureContext,
  FailureClassification,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  createFailureHandler,
  assertOrHalt,
} from './safety/failure_handler';

// =============================================================================
// Integration (Phase 6)
// =============================================================================
export {
  // Commitment Event Listener
  ICommitmentEventSource,
  MockCommitmentEventSource,
  SorobanCommitmentEventSource,
  createCommitmentEventSource,
  // Withdrawal Queue Fetcher
  IWithdrawalFetcher,
  MockWithdrawalFetcher,
  SorobanWithdrawalFetcher,
  createWithdrawalFetcher,
  createTestWithdrawal,
  // Confirmation Sender
  IConfirmationSender,
  MockConfirmationSender,
  HttpConfirmationSender,
  FileConfirmationSender,
  CompositeConfirmationSender,
  createConfirmationSender,
  // Integration Orchestrator
  IntegrationConfig,
  IntegrationStats,
  IntegrationOrchestrator,
  createTestnetOrchestrator as createTestnetIntegrationOrchestrator,
  createProductionOrchestrator,
} from './integration';
