/**
 * ASTRAEUS - Commitment Event Listener
 *
 * Listens for StateCommitted events from Dev A's ExecutionCore contract.
 *
 * Per duo.md Phase 6:
 * "11. [Dev B] Receive commitment event"
 *
 * Interface 2 (Commitment Event - Dev A -> Dev B):
 * event StateCommitted(bytes32 indexed subnet_id, uint64 indexed block_number, bytes32 state_root)
 */

import { CommitmentEvent, NetworkConfig, TESTNET_CONFIG } from '../interfaces/types';

/**
 * Commitment event listener interface
 */
export interface ICommitmentEventSource {
  /**
   * Start listening for commitment events
   * @param handler - Callback when event is received
   */
  start(handler: (event: CommitmentEvent) => Promise<void>): void;

  /**
   * Stop listening
   */
  stop(): void;

  /**
   * Check if listener is running
   */
  isRunning(): boolean;

  /**
   * Get last processed block number
   */
  getLastProcessedBlock(): bigint;
}

/**
 * Mock Commitment Event Source
 *
 * For testing before Dev A's contract is deployed.
 * Allows manual emission of events for E2E testing.
 */
export class MockCommitmentEventSource implements ICommitmentEventSource {
  private running: boolean = false;
  private handler: ((event: CommitmentEvent) => Promise<void>) | null = null;
  private lastProcessedBlock: bigint = 0n;
  private pendingEvents: CommitmentEvent[] = [];

  start(handler: (event: CommitmentEvent) => Promise<void>): void {
    this.running = true;
    this.handler = handler;
    // Process any pending events
    this.processPendingEvents();
  }

  stop(): void {
    this.running = false;
    this.handler = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastProcessedBlock(): bigint {
    return this.lastProcessedBlock;
  }

  /**
   * Emit a mock commitment event (for testing)
   */
  async emitEvent(event: CommitmentEvent): Promise<void> {
    if (this.running && this.handler) {
      await this.handler(event);
      this.lastProcessedBlock = event.block_number;
    } else {
      this.pendingEvents.push(event);
    }
  }

  /**
   * Emit multiple events in sequence
   */
  async emitEvents(events: CommitmentEvent[]): Promise<void> {
    for (const event of events) {
      await this.emitEvent(event);
    }
  }

  private async processPendingEvents(): Promise<void> {
    if (!this.running || !this.handler) return;

    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()!;
      await this.handler(event);
      this.lastProcessedBlock = event.block_number;
    }
  }
}

/**
 * Soroban RPC Commitment Event Source
 *
 * Polls Soroban RPC for StateCommitted events.
 * This is the production implementation to be used once Dev A's contract is deployed.
 */
export class SorobanCommitmentEventSource implements ICommitmentEventSource {
  private running: boolean = false;
  private handler: ((event: CommitmentEvent) => Promise<void>) | null = null;
  private lastProcessedBlock: bigint = 0n;
  private pollingInterval: NodeJS.Timeout | null = null;
  private contractId: string;
  private networkConfig: NetworkConfig;
  private pollIntervalMs: number;

  constructor(
    contractId: string,
    networkConfig: NetworkConfig = TESTNET_CONFIG,
    pollIntervalMs: number = 5000
  ) {
    this.contractId = contractId;
    this.networkConfig = networkConfig;
    this.pollIntervalMs = pollIntervalMs;
  }

  start(handler: (event: CommitmentEvent) => Promise<void>): void {
    this.running = true;
    this.handler = handler;
    this.startPolling();
  }

  stop(): void {
    this.running = false;
    this.handler = null;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastProcessedBlock(): bigint {
    return this.lastProcessedBlock;
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.pollEvents();
    }, this.pollIntervalMs);

    // Initial poll
    this.pollEvents();
  }

  private async pollEvents(): Promise<void> {
    if (!this.running || !this.handler) return;

    try {
      // TODO: Implement actual Soroban RPC event polling
      // This requires:
      // 1. Connect to Soroban RPC endpoint
      // 2. Call getEvents with filter for StateCommitted topic
      // 3. Parse events and convert to CommitmentEvent
      // 4. Call handler for each new event

      // Placeholder for Soroban RPC call:
      // const sorobanRpc = new SorobanRpc.Server(this.getSorobanRpcUrl());
      // const events = await sorobanRpc.getEvents({
      //   startLedger: this.lastProcessedLedger,
      //   filters: [{
      //     type: 'contract',
      //     contractIds: [this.contractId],
      //     topics: [['StateCommitted']]
      //   }]
      // });

      // For now, this is a no-op until contract is deployed
    } catch (error) {
      console.error('Error polling for commitment events:', error);
    }
  }

  private getSorobanRpcUrl(): string {
    // Soroban RPC URL (different from Horizon)
    if (this.networkConfig.isTestnet) {
      return 'https://soroban-testnet.stellar.org';
    }
    return 'https://soroban.stellar.org';
  }

  /**
   * Parse a Soroban event into a CommitmentEvent
   * This will be implemented when contract is deployed
   */
  private parseEvent(rawEvent: unknown): CommitmentEvent | null {
    // TODO: Implement parsing of Soroban event XDR
    // The event topics contain:
    // - topic[0]: event name hash
    // - topic[1]: subnet_id (indexed)
    // - topic[2]: block_number (indexed)
    // - data: state_root

    return null;
  }
}

/**
 * Create appropriate event source based on environment
 */
export function createCommitmentEventSource(
  contractId?: string,
  networkConfig: NetworkConfig = TESTNET_CONFIG
): ICommitmentEventSource {
  if (contractId) {
    return new SorobanCommitmentEventSource(contractId, networkConfig);
  }
  // Return mock for development/testing
  return new MockCommitmentEventSource();
}
