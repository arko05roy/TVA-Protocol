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

import { Horizon } from '@stellar/stellar-sdk';
import {
  NetworkConfig,
  TESTNET_CONFIG,
  SettlementConfirmation,
} from '../interfaces/types';
import { computeMemo } from '../interfaces/crypto';

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
export class ReplayProtectionService {
  private server: Horizon.Server;
  private config: NetworkConfig;

  /** In-memory settlement log (could be persisted to database) */
  private settlementLog: Map<string, SettlementRecord> = new Map();

  constructor(config: NetworkConfig = TESTNET_CONFIG) {
    this.config = config;
    this.server = new Horizon.Server(config.horizonUrl);
  }

  /**
   * Generate a unique key for a settlement (subnet_id + block_number).
   */
  private getSettlementKey(subnetId: string, blockNumber: bigint): string {
    return `${subnetId}:${blockNumber}`;
  }

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
  async isAlreadySettled(
    vaultAddress: string,
    subnetId: string,
    blockNumber: bigint
  ): Promise<boolean> {
    // First check local cache
    const key = this.getSettlementKey(subnetId, blockNumber);
    const localRecord = this.settlementLog.get(key);

    if (localRecord && localRecord.status === 'confirmed') {
      return true;
    }

    // Check on-chain via Horizon
    const memoBuffer = computeMemo(subnetId, blockNumber);
    // Pad to 32 bytes for Stellar memo hash
    const memoHash = Buffer.concat([memoBuffer, Buffer.alloc(4, 0)]).toString('hex');

    try {
      // Query transactions for this vault
      const transactions = await this.server
        .transactions()
        .forAccount(vaultAddress)
        .order('desc')
        .limit(200) // Check recent transactions
        .call();

      // Look for matching memo
      for (const tx of transactions.records) {
        if (tx.memo_type === 'hash' && tx.memo === memoHash) {
          // Found matching transaction - settlement already complete
          // Update local cache
          this.settlementLog.set(key, {
            subnetId,
            blockNumber,
            memoHex: memoBuffer.toString('hex'),
            txHashes: [tx.hash],
            ledgers: [tx.ledger_attr],
            timestamp: new Date(tx.created_at),
            status: 'confirmed',
          });

          return true;
        }
      }

      return false;
    } catch (error) {
      // If we can't check Horizon, err on the side of caution
      // Don't return false - could cause double settlement
      console.error('Failed to check settlement status on Horizon:', error);
      throw error;
    }
  }

  /**
   * Record a pending settlement (before submission).
   *
   * @param subnetId - Subnet identifier
   * @param blockNumber - Block number
   * @returns Settlement record
   */
  recordPendingSettlement(
    subnetId: string,
    blockNumber: bigint
  ): SettlementRecord {
    const key = this.getSettlementKey(subnetId, blockNumber);
    const memoBuffer = computeMemo(subnetId, blockNumber);

    const record: SettlementRecord = {
      subnetId,
      blockNumber,
      memoHex: memoBuffer.toString('hex'),
      txHashes: [],
      ledgers: [],
      timestamp: new Date(),
      status: 'pending',
    };

    this.settlementLog.set(key, record);
    return record;
  }

  /**
   * Record a confirmed settlement (after successful submission).
   *
   * @param subnetId - Subnet identifier
   * @param blockNumber - Block number
   * @param txHashes - Array of transaction hashes
   * @param ledgers - Array of ledger numbers
   */
  recordConfirmedSettlement(
    subnetId: string,
    blockNumber: bigint,
    txHashes: string[],
    ledgers: number[]
  ): void {
    const key = this.getSettlementKey(subnetId, blockNumber);
    const existing = this.settlementLog.get(key);
    const memoBuffer = computeMemo(subnetId, blockNumber);

    const record: SettlementRecord = {
      subnetId,
      blockNumber,
      memoHex: memoBuffer.toString('hex'),
      txHashes,
      ledgers,
      timestamp: existing?.timestamp || new Date(),
      status: 'confirmed',
    };

    this.settlementLog.set(key, record);
  }

  /**
   * Record a failed settlement.
   *
   * @param subnetId - Subnet identifier
   * @param blockNumber - Block number
   * @param error - Error message
   */
  recordFailedSettlement(
    subnetId: string,
    blockNumber: bigint,
    error: string
  ): void {
    const key = this.getSettlementKey(subnetId, blockNumber);
    const existing = this.settlementLog.get(key);

    if (existing) {
      existing.status = 'failed';
      existing.error = error;
      this.settlementLog.set(key, existing);
    }
  }

  /**
   * Get settlement record for a specific block.
   *
   * @param subnetId - Subnet identifier
   * @param blockNumber - Block number
   * @returns Settlement record or undefined
   */
  getSettlementRecord(
    subnetId: string,
    blockNumber: bigint
  ): SettlementRecord | undefined {
    const key = this.getSettlementKey(subnetId, blockNumber);
    return this.settlementLog.get(key);
  }

  /**
   * Get all settlement records for a subnet.
   *
   * @param subnetId - Subnet identifier
   * @returns Array of settlement records
   */
  getSubnetSettlements(subnetId: string): SettlementRecord[] {
    const records: SettlementRecord[] = [];

    for (const [key, record] of this.settlementLog) {
      if (record.subnetId === subnetId) {
        records.push(record);
      }
    }

    // Sort by block number
    return records.sort((a, b) => {
      if (a.blockNumber < b.blockNumber) return -1;
      if (a.blockNumber > b.blockNumber) return 1;
      return 0;
    });
  }

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
  getSettlementConfirmation(
    subnetId: string,
    blockNumber: bigint
  ): SettlementConfirmation | undefined {
    const record = this.getSettlementRecord(subnetId, blockNumber);

    if (!record || record.status !== 'confirmed') {
      return undefined;
    }

    return {
      subnet_id: record.subnetId,
      block_number: record.blockNumber,
      tx_hashes: record.txHashes,
      memo: record.memoHex,
      timestamp: record.timestamp,
    };
  }

  /**
   * Clear all records (for testing).
   */
  clearAll(): void {
    this.settlementLog.clear();
  }

  /**
   * Get count of settlements by status.
   */
  getStats(): { pending: number; confirmed: number; failed: number } {
    let pending = 0;
    let confirmed = 0;
    let failed = 0;

    for (const record of this.settlementLog.values()) {
      switch (record.status) {
        case 'pending':
          pending++;
          break;
        case 'confirmed':
          confirmed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { pending, confirmed, failed };
  }
}

/**
 * Create a ReplayProtectionService for testnet
 */
export function createTestnetReplayProtection(): ReplayProtectionService {
  return new ReplayProtectionService(TESTNET_CONFIG);
}
