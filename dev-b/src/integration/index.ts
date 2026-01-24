/**
 * ASTRAEUS - Integration Module
 *
 * Phase 6: End-to-End Integration
 *
 * This module provides all components needed for integrating
 * Dev B's settlement layer with Dev A's execution layer.
 */

// Commitment Event Listener
export {
  ICommitmentEventSource,
  MockCommitmentEventSource,
  SorobanCommitmentEventSource,
  createCommitmentEventSource,
} from './commitment_listener';

// Withdrawal Queue Fetcher
export {
  IWithdrawalFetcher,
  MockWithdrawalFetcher,
  SorobanWithdrawalFetcher,
  createWithdrawalFetcher,
  createTestWithdrawal,
} from './withdrawal_fetcher';

// Confirmation Sender
export {
  IConfirmationSender,
  MockConfirmationSender,
  HttpConfirmationSender,
  FileConfirmationSender,
  CompositeConfirmationSender,
  createConfirmationSender,
} from './confirmation_sender';

// Integration Orchestrator
export {
  IntegrationConfig,
  IntegrationStats,
  IntegrationOrchestrator,
  createTestnetOrchestrator,
  createProductionOrchestrator,
} from './integration_orchestrator';
