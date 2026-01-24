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

import {
  rpc,
  xdr,
  Contract,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
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
  private server: rpc.Server;
  private lastCursor: string | undefined;
  private startLedger: number | undefined;

  constructor(
    contractId: string,
    networkConfig: NetworkConfig = TESTNET_CONFIG,
    pollIntervalMs: number = 5000
  ) {
    this.contractId = contractId;
    this.networkConfig = networkConfig;
    this.pollIntervalMs = pollIntervalMs;
    this.server = new rpc.Server(this.getSorobanRpcUrl());
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
      // If no startLedger set, get the latest ledger to start from
      if (!this.startLedger && !this.lastCursor) {
        const network = await this.server.getNetwork();
        // Start from a recent ledger (current - small buffer)
        const latestLedger = await this.server.getLatestLedger();
        this.startLedger = latestLedger.sequence;
      }

      // Build the event topic filter for StateCommitted
      // Solang emits event name as Symbol in topic[0]
      const eventNameScVal = xdr.ScVal.scvSymbol('StateCommitted');
      const eventNameBase64 = eventNameScVal.toXDR('base64');

      const request: rpc.Server.GetEventsRequest = {
        filters: [{
          type: 'contract' as const,
          contractIds: [this.contractId],
          topics: [[eventNameBase64, '*', '*']],
        }],
        ...(this.lastCursor
          ? { cursor: this.lastCursor }
          : { startLedger: this.startLedger }),
        limit: 100,
      };

      const response = await this.server.getEvents(request);

      for (const event of response.events) {
        const parsed = this.parseEvent(event);
        if (parsed && this.handler) {
          await this.handler(parsed);
          this.lastProcessedBlock = parsed.block_number;
        }
        // Update cursor for next poll
        this.lastCursor = event.pagingToken;
      }
    } catch (error) {
      console.error('Error polling for commitment events:', error);
    }
  }

  private getSorobanRpcUrl(): string {
    if (this.networkConfig.isTestnet) {
      return 'https://soroban-testnet.stellar.org';
    }
    return 'https://soroban.stellar.org';
  }

  /**
   * Parse a Soroban EventResponse into a CommitmentEvent
   *
   * Event structure from Solang-compiled Soroban contract:
   * - topic[0]: Symbol "StateCommitted"
   * - topic[1]: subnet_id (bytes32, indexed)
   * - topic[2]: block_number (uint64, indexed)
   * - value: state_root (bytes32)
   */
  private parseEvent(rawEvent: rpc.Api.EventResponse): CommitmentEvent | null {
    try {
      const topics = rawEvent.topic;
      if (!topics || topics.length < 3) {
        return null;
      }

      // topic[1] is subnet_id as bytes32
      const subnetIdNative = scValToNative(topics[1]);
      const subnetId = Buffer.isBuffer(subnetIdNative)
        ? '0x' + subnetIdNative.toString('hex')
        : typeof subnetIdNative === 'string'
          ? (subnetIdNative.startsWith('0x') ? subnetIdNative : '0x' + subnetIdNative)
          : '0x' + Buffer.from(subnetIdNative).toString('hex');

      // topic[2] is block_number as uint64
      const blockNumberNative = scValToNative(topics[2]);
      const blockNumber = BigInt(blockNumberNative);

      // value is state_root as bytes32
      const stateRootNative = scValToNative(rawEvent.value);
      const stateRoot = Buffer.isBuffer(stateRootNative)
        ? '0x' + stateRootNative.toString('hex')
        : typeof stateRootNative === 'string'
          ? (stateRootNative.startsWith('0x') ? stateRootNative : '0x' + stateRootNative)
          : '0x' + Buffer.from(stateRootNative).toString('hex');

      return {
        subnet_id: subnetId,
        block_number: blockNumber,
        state_root: stateRoot,
      };
    } catch (error) {
      console.error('Error parsing commitment event:', error);
      return null;
    }
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
