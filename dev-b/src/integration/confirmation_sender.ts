/**
 * ASTRAEUS - Settlement Confirmation Sender
 *
 * Sends settlement confirmation back to Dev A after successful settlement.
 *
 * Per duo.md Phase 6:
 * "17. [Dev B] Send settlement confirmation to Dev A"
 *
 * Interface 3 (Settlement Confirmation - Dev B -> Dev A):
 * {
 *   subnet_id: string;
 *   block_number: number;
 *   tx_hashes: string[];
 *   memo: string;           // 28 bytes hex
 *   timestamp: string;      // ISO 8601
 * }
 */

import { SettlementConfirmation, NetworkConfig, TESTNET_CONFIG } from '../interfaces/types';

/**
 * Confirmation sender interface
 */
export interface IConfirmationSender {
  /**
   * Send settlement confirmation to Dev A
   * @param confirmation - The settlement confirmation
   * @returns True if confirmation was sent successfully
   */
  sendConfirmation(confirmation: SettlementConfirmation): Promise<boolean>;

  /**
   * Get all sent confirmations (for auditing)
   */
  getSentConfirmations(): SettlementConfirmation[];

  /**
   * Get confirmation by subnet and block
   */
  getConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined;
}

/**
 * Mock Confirmation Sender
 *
 * For testing before Dev A's confirmation endpoint is available.
 * Stores confirmations in memory for verification.
 */
export class MockConfirmationSender implements IConfirmationSender {
  private sentConfirmations: SettlementConfirmation[] = [];
  private confirmationsByKey: Map<string, SettlementConfirmation> = new Map();
  private callbacks: ((confirmation: SettlementConfirmation) => void)[] = [];

  async sendConfirmation(confirmation: SettlementConfirmation): Promise<boolean> {
    // Store confirmation
    this.sentConfirmations.push(confirmation);
    const key = this.makeKey(confirmation.subnet_id, confirmation.block_number);
    this.confirmationsByKey.set(key, confirmation);

    // Notify callbacks
    for (const callback of this.callbacks) {
      callback(confirmation);
    }

    return true;
  }

  getSentConfirmations(): SettlementConfirmation[] {
    return [...this.sentConfirmations];
  }

  getConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined {
    const key = this.makeKey(subnetId, blockNumber);
    return this.confirmationsByKey.get(key);
  }

  /**
   * Register callback for when confirmation is sent (for testing)
   */
  onConfirmation(callback: (confirmation: SettlementConfirmation) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Clear all callbacks
   */
  clearCallbacks(): void {
    this.callbacks = [];
  }

  /**
   * Clear all confirmations
   */
  clear(): void {
    this.sentConfirmations = [];
    this.confirmationsByKey.clear();
  }

  private makeKey(subnetId: string, blockNumber: bigint): string {
    return `${subnetId}:${blockNumber.toString()}`;
  }
}

/**
 * HTTP Confirmation Sender
 *
 * Sends confirmation to Dev A via HTTP API.
 * This is the production implementation.
 */
export class HttpConfirmationSender implements IConfirmationSender {
  private endpoint: string;
  private sentConfirmations: SettlementConfirmation[] = [];
  private confirmationsByKey: Map<string, SettlementConfirmation> = new Map();

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async sendConfirmation(confirmation: SettlementConfirmation): Promise<boolean> {
    try {
      // Convert to JSON-serializable format
      const payload = {
        subnet_id: confirmation.subnet_id,
        block_number: confirmation.block_number.toString(),
        tx_hashes: confirmation.tx_hashes,
        memo: confirmation.memo,
        timestamp: confirmation.timestamp.toISOString(),
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Store locally for auditing
        this.sentConfirmations.push(confirmation);
        const key = this.makeKey(confirmation.subnet_id, confirmation.block_number);
        this.confirmationsByKey.set(key, confirmation);
        return true;
      }

      console.error(
        'Failed to send confirmation:',
        response.status,
        await response.text()
      );
      return false;
    } catch (error) {
      console.error('Error sending confirmation:', error);
      return false;
    }
  }

  getSentConfirmations(): SettlementConfirmation[] {
    return [...this.sentConfirmations];
  }

  getConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined {
    const key = this.makeKey(subnetId, blockNumber);
    return this.confirmationsByKey.get(key);
  }

  private makeKey(subnetId: string, blockNumber: bigint): string {
    return `${subnetId}:${blockNumber.toString()}`;
  }
}

/**
 * File-based Confirmation Sender
 *
 * Writes confirmations to a file for manual verification.
 * Useful for testing and auditing.
 */
export class FileConfirmationSender implements IConfirmationSender {
  private filePath: string;
  private sentConfirmations: SettlementConfirmation[] = [];
  private confirmationsByKey: Map<string, SettlementConfirmation> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async sendConfirmation(confirmation: SettlementConfirmation): Promise<boolean> {
    try {
      // Store locally
      this.sentConfirmations.push(confirmation);
      const key = this.makeKey(confirmation.subnet_id, confirmation.block_number);
      this.confirmationsByKey.set(key, confirmation);

      // Append to file (in Node.js environment)
      const fs = await import('fs').catch(() => null);
      if (fs) {
        const payload = {
          subnet_id: confirmation.subnet_id,
          block_number: confirmation.block_number.toString(),
          tx_hashes: confirmation.tx_hashes,
          memo: confirmation.memo,
          timestamp: confirmation.timestamp.toISOString(),
        };

        const line = JSON.stringify(payload) + '\n';
        fs.appendFileSync(this.filePath, line);
      }

      return true;
    } catch (error) {
      console.error('Error writing confirmation to file:', error);
      return false;
    }
  }

  getSentConfirmations(): SettlementConfirmation[] {
    return [...this.sentConfirmations];
  }

  getConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined {
    const key = this.makeKey(subnetId, blockNumber);
    return this.confirmationsByKey.get(key);
  }

  private makeKey(subnetId: string, blockNumber: bigint): string {
    return `${subnetId}:${blockNumber.toString()}`;
  }
}

/**
 * Composite Confirmation Sender
 *
 * Sends to multiple destinations (e.g., API + file for auditing).
 */
export class CompositeConfirmationSender implements IConfirmationSender {
  private senders: IConfirmationSender[];

  constructor(senders: IConfirmationSender[]) {
    this.senders = senders;
  }

  async sendConfirmation(confirmation: SettlementConfirmation): Promise<boolean> {
    const results = await Promise.all(
      this.senders.map((sender) => sender.sendConfirmation(confirmation))
    );

    // Return true if at least one sender succeeded
    return results.some((r) => r === true);
  }

  getSentConfirmations(): SettlementConfirmation[] {
    // Return from first sender
    return this.senders[0]?.getSentConfirmations() || [];
  }

  getConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined {
    // Return from first sender that has it
    for (const sender of this.senders) {
      const confirmation = sender.getConfirmation(subnetId, blockNumber);
      if (confirmation) return confirmation;
    }
    return undefined;
  }
}

/**
 * Create appropriate confirmation sender based on configuration
 */
export function createConfirmationSender(config?: {
  httpEndpoint?: string;
  filePath?: string;
}): IConfirmationSender {
  const senders: IConfirmationSender[] = [];

  if (config?.httpEndpoint) {
    senders.push(new HttpConfirmationSender(config.httpEndpoint));
  }

  if (config?.filePath) {
    senders.push(new FileConfirmationSender(config.filePath));
  }

  if (senders.length === 0) {
    // Return mock for development/testing
    return new MockConfirmationSender();
  }

  if (senders.length === 1) {
    return senders[0];
  }

  return new CompositeConfirmationSender(senders);
}
