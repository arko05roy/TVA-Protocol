/**
 * ASTRAEUS - Settlement Planner
 *
 * Builds deterministic Stellar transactions from withdrawal queues.
 *
 * Per agent/plan.md Section B3 (Settlement Planner):
 * - Input: committed_state_root, withdrawal_queue
 * - Output: SettlementPlan { txs[] }
 * - Rules: batch per asset, deterministic ordering, memo = H(subnet_id || block_number)
 *
 * Per agent/interfaces.md Section 3 (Memo Format):
 * - memo = first_28_bytes(SHA256(subnet_id || block_number))
 *
 * Per agent/interfaces.md Section 7.2 (Transaction Construction):
 * - Native/Issued → Payment
 * - FX required → PathPaymentStrictReceive
 * - Memo encodes (subnet_id, block_number)
 * - Fails atomically if constraints violated
 */

import {
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  Keypair,
  Transaction,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import {
  WithdrawalIntent,
  SettlementPlan,
  NetworkConfig,
  TESTNET_CONFIG,
  STELLAR_CONSTANTS,
  Asset as AstraeusAsset,
} from '../interfaces/types';
import { computeMemo, hexToStellarKey } from '../interfaces/crypto';
import {
  groupWithdrawalsByAsset,
  sortWithdrawalsDeterministically,
  computeNetOutflow,
} from './pom_delta';

/**
 * Settlement transaction with metadata
 */
export interface SettlementTransaction {
  /** The built Stellar transaction (unsigned) */
  transaction: Transaction;
  /** Withdrawals included in this transaction */
  withdrawals: WithdrawalIntent[];
  /** Asset being settled */
  assetId: string;
}

/**
 * Extended settlement plan with transaction details
 */
export interface DetailedSettlementPlan {
  subnetId: string;
  blockNumber: bigint;
  /** 28-byte memo as hex string */
  memoHex: string;
  /** Memo as Buffer for Stellar SDK */
  memoBuffer: Buffer;
  /** Settlement transactions */
  transactions: SettlementTransaction[];
  /** Total withdrawals processed */
  totalWithdrawals: number;
  /** Total amount per asset (for verification) */
  totalsByAsset: Map<string, bigint>;
}

/**
 * Settlement Planner class
 *
 * Builds Stellar transactions from withdrawal queues following
 * the specifications in interfaces.md and plan.md.
 */
export class SettlementPlanner {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private config: NetworkConfig;

  constructor(config: NetworkConfig = TESTNET_CONFIG) {
    this.config = config;
    this.server = new Horizon.Server(config.horizonUrl);
    this.networkPassphrase = config.networkPassphrase;
  }

  /**
   * Build a complete settlement plan from withdrawal queue.
   *
   * Per plan.md B3 and interfaces.md Section 3:
   * 1. Compute memo = first_28_bytes(SHA256(subnet_id || block_number))
   * 2. Group withdrawals by asset
   * 3. Sort deterministically within each group
   * 4. Build transactions (max 100 ops each)
   * 5. Attach memo to each transaction
   *
   * @param vaultAddress - Stellar address of the treasury vault (G... format)
   * @param subnetId - Subnet identifier (bytes32, hex string)
   * @param blockNumber - Block number (uint64)
   * @param withdrawals - Array of withdrawal intents from ExecutionCore
   * @returns Detailed settlement plan with all transactions
   */
  async buildSettlementPlan(
    vaultAddress: string,
    subnetId: string,
    blockNumber: bigint,
    withdrawals: WithdrawalIntent[]
  ): Promise<DetailedSettlementPlan> {
    if (withdrawals.length === 0) {
      // No withdrawals to process
      const memoBuffer = computeMemo(subnetId, blockNumber);
      return {
        subnetId,
        blockNumber,
        memoHex: memoBuffer.toString('hex'),
        memoBuffer,
        transactions: [],
        totalWithdrawals: 0,
        totalsByAsset: new Map(),
      };
    }

    // Step 1: Compute memo per interfaces.md Section 3
    // memo = first_28_bytes(SHA256(subnet_id || block_number))
    const memoBuffer = computeMemo(subnetId, blockNumber);
    const memoHex = memoBuffer.toString('hex');

    // Step 2: Group withdrawals by asset
    const groupedWithdrawals = groupWithdrawalsByAsset(withdrawals);

    // Step 3: Build transactions for each asset group
    const transactions: SettlementTransaction[] = [];
    const totalsByAsset = computeNetOutflow(withdrawals);

    // Load vault account for sequence number
    const vaultAccount = await this.server.loadAccount(vaultAddress);

    // Track sequence number for multiple transactions
    let sequenceNumber = BigInt(vaultAccount.sequenceNumber());

    for (const [assetId, assetWithdrawals] of groupedWithdrawals) {
      // Sort withdrawals deterministically within the group
      const sortedWithdrawals = sortWithdrawalsDeterministically(assetWithdrawals);

      // Batch into transactions (max 100 operations per tx)
      const batches = this.batchWithdrawals(sortedWithdrawals);

      for (const batch of batches) {
        sequenceNumber = sequenceNumber + 1n;

        const tx = await this.buildPaymentTransaction(
          vaultAddress,
          sequenceNumber.toString(),
          batch,
          memoBuffer
        );

        transactions.push({
          transaction: tx,
          withdrawals: batch,
          assetId,
        });
      }
    }

    return {
      subnetId,
      blockNumber,
      memoHex,
      memoBuffer,
      transactions,
      totalWithdrawals: withdrawals.length,
      totalsByAsset,
    };
  }

  /**
   * Build a payment transaction for a batch of withdrawals.
   *
   * Per interfaces.md Section 7.2:
   * - Native → Payment
   * - Issued → Payment
   * - Each tx encodes memo
   * - Fails atomically
   *
   * @param vaultAddress - Source vault address
   * @param sequenceNumber - Transaction sequence number
   * @param withdrawals - Batch of withdrawals (same asset)
   * @param memo - 28-byte memo buffer
   * @returns Built (unsigned) transaction
   */
  private async buildPaymentTransaction(
    vaultAddress: string,
    sequenceNumber: string,
    withdrawals: WithdrawalIntent[],
    memo: Buffer
  ): Promise<Transaction> {
    // Create account object with specific sequence number
    const sourceAccount = {
      accountId: () => vaultAddress,
      sequenceNumber: () => sequenceNumber,
      incrementSequenceNumber: () => {},
    };

    const txBuilder = new TransactionBuilder(sourceAccount as any, {
      fee: this.calculateFee(withdrawals.length).toString(),
      networkPassphrase: this.networkPassphrase,
    });

    // Add payment operation for each withdrawal
    for (const withdrawal of withdrawals) {
      const asset = this.toStellarAsset(withdrawal.asset_code, withdrawal.issuer);
      const destination = this.convertDestination(withdrawal.destination);
      const amount = this.stroopsToDecimal(BigInt(withdrawal.amount));

      txBuilder.addOperation(
        Operation.payment({
          destination,
          asset,
          amount,
        })
      );
    }

    // Add memo (MemoHash with 32 bytes, padded from 28)
    // Stellar MemoHash requires 32 bytes, so we pad with zeros
    const memoHash = Buffer.concat([memo, Buffer.alloc(4, 0)]);
    txBuilder.addMemo(Memo.hash(memoHash.toString('hex')));

    // Set timeout (5 minutes)
    txBuilder.setTimeout(300);

    return txBuilder.build();
  }

  /**
   * Build a PathPaymentStrictReceive transaction for FX settlement.
   *
   * Per plan.md B5 (FX Handling):
   * - Uses PathPaymentStrictReceive
   * - Never sets internal prices
   * - Never uses oracles
   * - FX happens after execution, never inside PoM
   *
   * @param vaultAddress - Source vault address
   * @param sequenceNumber - Transaction sequence number
   * @param withdrawal - Single withdrawal requiring FX
   * @param sendAsset - Asset the vault will send
   * @param sendMax - Maximum amount to send (with slippage)
   * @param path - Intermediate path assets
   * @param memo - 28-byte memo buffer
   * @returns Built (unsigned) transaction
   */
  async buildPathPaymentTransaction(
    vaultAddress: string,
    sequenceNumber: string,
    withdrawal: WithdrawalIntent,
    sendAsset: AstraeusAsset,
    sendMax: bigint,
    path: Asset[],
    memo: Buffer
  ): Promise<Transaction> {
    const sourceAccount = {
      accountId: () => vaultAddress,
      sequenceNumber: () => sequenceNumber,
      incrementSequenceNumber: () => {},
    };

    const txBuilder = new TransactionBuilder(sourceAccount as any, {
      fee: this.calculateFee(1).toString(),
      networkPassphrase: this.networkPassphrase,
    });

    const destAsset = this.toStellarAsset(withdrawal.asset_code, withdrawal.issuer);
    const destination = this.convertDestination(withdrawal.destination);
    const destAmount = this.stroopsToDecimal(BigInt(withdrawal.amount));
    const sendMaxDecimal = this.stroopsToDecimal(sendMax);

    txBuilder.addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: this.toStellarAsset(sendAsset.code, sendAsset.issuer),
        sendMax: sendMaxDecimal,
        destination,
        destAsset,
        destAmount,
        path,
      })
    );

    // Add memo
    const memoHash = Buffer.concat([memo, Buffer.alloc(4, 0)]);
    txBuilder.addMemo(Memo.hash(memoHash.toString('hex')));

    txBuilder.setTimeout(300);

    return txBuilder.build();
  }

  /**
   * Batch withdrawals into groups respecting Stellar's max operations limit.
   *
   * Per STELLAR_CONSTANTS.MAX_OPS_PER_TX (100 operations max)
   *
   * @param withdrawals - Sorted array of withdrawals
   * @returns Array of batches
   */
  private batchWithdrawals(withdrawals: WithdrawalIntent[]): WithdrawalIntent[][] {
    const batches: WithdrawalIntent[][] = [];
    const maxOps = STELLAR_CONSTANTS.MAX_OPS_PER_TX;

    for (let i = 0; i < withdrawals.length; i += maxOps) {
      batches.push(withdrawals.slice(i, i + maxOps));
    }

    return batches;
  }

  /**
   * Convert withdrawal destination to Stellar address.
   *
   * Destination comes from Dev A as bytes32 (hex) or G... address.
   * Per contracts/WITHDRAWAL_QUEUE_FORMAT.md: destination is Ed25519 pubkey
   *
   * @param destination - Destination from withdrawal intent
   * @returns Stellar address (G... format)
   */
  private convertDestination(destination: string): string {
    if (destination.startsWith('G')) {
      // Already in Stellar format
      return destination;
    }

    // Convert from hex (bytes32) to Stellar address
    return hexToStellarKey(destination);
  }

  /**
   * Convert asset to Stellar SDK Asset.
   *
   * Per contracts/WITHDRAWAL_QUEUE_FORMAT.md:
   * - issuer = "NATIVE" for XLM
   * - issuer = bytes32 hex for issued assets
   *
   * @param assetCode - Asset code (e.g., "USDC", "XLM")
   * @param issuer - "NATIVE" or issuer address/hex
   * @returns Stellar SDK Asset
   */
  private toStellarAsset(assetCode: string, issuer: string): Asset {
    if (issuer.toUpperCase() === 'NATIVE') {
      return Asset.native();
    }

    // Convert issuer to Stellar format if needed
    let stellarIssuer: string;
    if (issuer.startsWith('G')) {
      stellarIssuer = issuer;
    } else {
      stellarIssuer = hexToStellarKey(issuer);
    }

    return new Asset(assetCode, stellarIssuer);
  }

  /**
   * Convert stroops to decimal string for Stellar SDK.
   *
   * Stellar SDK uses string amounts with 7 decimal places.
   * 1 XLM = 10,000,000 stroops
   *
   * @param stroops - Amount in stroops
   * @returns Decimal string (e.g., "10.0000000")
   */
  private stroopsToDecimal(stroops: bigint): string {
    const str = stroops.toString().padStart(8, '0');
    const whole = str.slice(0, -7) || '0';
    const decimal = str.slice(-7);
    return `${whole}.${decimal}`;
  }

  /**
   * Calculate transaction fee based on number of operations.
   *
   * Base fee is 100 stroops per operation.
   *
   * @param numOperations - Number of operations in transaction
   * @returns Total fee in stroops
   */
  private calculateFee(numOperations: number): number {
    const baseFeePerOp = 100;
    return baseFeePerOp * numOperations;
  }
}

/**
 * Create a SettlementPlanner for testnet
 */
export function createTestnetSettlementPlanner(): SettlementPlanner {
  return new SettlementPlanner(TESTNET_CONFIG);
}
