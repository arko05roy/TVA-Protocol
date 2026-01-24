/**
 * ASTRAEUS - Withdrawal Queue Fetcher
 *
 * Fetches withdrawal queue from Dev A's ExecutionCore contract.
 *
 * Per duo.md Phase 6:
 * "12. [Dev B] Fetch withdrawal queue from Dev A"
 *
 * Interface 4 (Withdrawal Queue - Dev A -> Dev B):
 * function get_withdrawal_queue(bytes32 subnet_id) returns (Withdrawal[])
 *
 * Where Withdrawal is:
 * struct Withdrawal {
 *   bytes32 withdrawal_id;
 *   bytes32 user_id;
 *   string asset_code;
 *   bytes32 issuer;        // "NATIVE" for XLM
 *   int128 amount;
 *   bytes32 destination;
 * }
 */

import {
  rpc,
  xdr,
  Contract,
  TransactionBuilder,
  Networks,
  Account,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { WithdrawalIntent, NetworkConfig, TESTNET_CONFIG } from '../interfaces/types';

/**
 * Withdrawal fetcher interface
 */
export interface IWithdrawalFetcher {
  /**
   * Fetch withdrawal queue for a subnet at a specific block
   * @param subnetId - Subnet identifier (bytes32 hex)
   * @param blockNumber - Block number
   * @returns Array of withdrawal intents
   */
  fetchWithdrawals(
    subnetId: string,
    blockNumber: bigint
  ): Promise<WithdrawalIntent[]>;

  /**
   * Get pending withdrawal count for a subnet
   */
  getPendingCount(subnetId: string): Promise<number>;
}

/**
 * Mock Withdrawal Fetcher
 *
 * For testing before Dev A's contract is deployed.
 * Allows setting up test withdrawal queues.
 */
export class MockWithdrawalFetcher implements IWithdrawalFetcher {
  private withdrawalQueues: Map<string, Map<bigint, WithdrawalIntent[]>> = new Map();

  async fetchWithdrawals(
    subnetId: string,
    blockNumber: bigint
  ): Promise<WithdrawalIntent[]> {
    const subnetQueue = this.withdrawalQueues.get(subnetId);
    if (!subnetQueue) {
      return [];
    }

    // Return withdrawals for this block or latest if specific block not found
    const blockWithdrawals = subnetQueue.get(blockNumber);
    if (blockWithdrawals) {
      return blockWithdrawals;
    }

    // Find closest block less than or equal to requested
    let closestBlock = 0n;
    for (const block of subnetQueue.keys()) {
      if (block <= blockNumber && block > closestBlock) {
        closestBlock = block;
      }
    }

    return subnetQueue.get(closestBlock) || [];
  }

  async getPendingCount(subnetId: string): Promise<number> {
    const subnetQueue = this.withdrawalQueues.get(subnetId);
    if (!subnetQueue) {
      return 0;
    }

    // Get latest block's count
    let latestBlock = 0n;
    for (const block of subnetQueue.keys()) {
      if (block > latestBlock) {
        latestBlock = block;
      }
    }

    return subnetQueue.get(latestBlock)?.length || 0;
  }

  /**
   * Set withdrawal queue for testing
   */
  setWithdrawals(
    subnetId: string,
    blockNumber: bigint,
    withdrawals: WithdrawalIntent[]
  ): void {
    if (!this.withdrawalQueues.has(subnetId)) {
      this.withdrawalQueues.set(subnetId, new Map());
    }
    this.withdrawalQueues.get(subnetId)!.set(blockNumber, withdrawals);
  }

  /**
   * Add a single withdrawal for testing
   */
  addWithdrawal(
    subnetId: string,
    blockNumber: bigint,
    withdrawal: WithdrawalIntent
  ): void {
    if (!this.withdrawalQueues.has(subnetId)) {
      this.withdrawalQueues.set(subnetId, new Map());
    }
    const subnetQueue = this.withdrawalQueues.get(subnetId)!;

    if (!subnetQueue.has(blockNumber)) {
      subnetQueue.set(blockNumber, []);
    }
    subnetQueue.get(blockNumber)!.push(withdrawal);
  }

  /**
   * Clear all withdrawals for a subnet
   */
  clearWithdrawals(subnetId: string): void {
    this.withdrawalQueues.delete(subnetId);
  }

  /**
   * Clear all withdrawals
   */
  clearAll(): void {
    this.withdrawalQueues.clear();
  }
}

/**
 * Soroban RPC Withdrawal Fetcher
 *
 * Fetches withdrawal queue from Dev A's ExecutionCore contract via Soroban RPC.
 * This is the production implementation to be used once Dev A's contract is deployed.
 */
export class SorobanWithdrawalFetcher implements IWithdrawalFetcher {
  private contractId: string;
  private networkConfig: NetworkConfig;
  private server: rpc.Server;
  private contract: Contract;

  constructor(contractId: string, networkConfig: NetworkConfig = TESTNET_CONFIG) {
    this.contractId = contractId;
    this.networkConfig = networkConfig;
    this.server = new rpc.Server(this.getSorobanRpcUrl());
    this.contract = new Contract(contractId);
  }

  async fetchWithdrawals(
    subnetId: string,
    blockNumber: bigint
  ): Promise<WithdrawalIntent[]> {
    // Build a contract call operation for get_withdrawal_queue(bytes32 subnet_id)
    const subnetIdBytes = Buffer.from(subnetId.replace('0x', ''), 'hex');
    const subnetIdScVal = xdr.ScVal.scvBytes(subnetIdBytes);

    const operation = this.contract.call('get_withdrawal_queue', subnetIdScVal);

    // Create a dummy source account for simulation (read-only call)
    const dummySource = new Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0'
    );

    const networkPassphrase = this.networkConfig.isTestnet
      ? Networks.TESTNET
      : Networks.PUBLIC;

    const transaction = new TransactionBuilder(dummySource, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simResponse = await this.server.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simResponse)) {
      throw new Error(
        `Contract simulation failed: ${(simResponse as rpc.Api.SimulateTransactionErrorResponse).error}`
      );
    }

    const successResponse = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    if (!successResponse.result) {
      return [];
    }

    return this.parseWithdrawalQueue(successResponse.result.retval);
  }

  async getPendingCount(subnetId: string): Promise<number> {
    const withdrawals = await this.fetchWithdrawals(subnetId, 0n);
    return withdrawals.length;
  }

  private getSorobanRpcUrl(): string {
    if (this.networkConfig.isTestnet) {
      return 'https://soroban-testnet.stellar.org';
    }
    return 'https://soroban.stellar.org';
  }

  /**
   * Parse withdrawal queue from Soroban contract response.
   *
   * The return value is a Vec of Withdrawal structs from Solang:
   * struct Withdrawal {
   *   bytes32 withdrawal_id;
   *   bytes32 user_id;
   *   string asset_code;
   *   bytes32 issuer;        // "NATIVE" for XLM
   *   int128 amount;
   *   bytes32 destination;
   * }
   *
   * In Soroban ScVal, this becomes a Vec of Maps (struct fields as map entries).
   */
  private parseWithdrawalQueue(retval: xdr.ScVal): WithdrawalIntent[] {
    const nativeResult = scValToNative(retval);

    if (!Array.isArray(nativeResult)) {
      return [];
    }

    return nativeResult.map((item: any) => {
      // Solang structs are represented as maps or structs in ScVal
      // scValToNative converts them to plain objects
      const withdrawalId = this.toHexString(item.withdrawal_id ?? item[0]);
      const userId = this.toHexString(item.user_id ?? item[1]);
      const assetCode = typeof (item.asset_code ?? item[2]) === 'string'
        ? (item.asset_code ?? item[2])
        : Buffer.from(item.asset_code ?? item[2]).toString('utf8').replace(/\0/g, '');
      const issuer = this.toHexString(item.issuer ?? item[3]);
      const amount = BigInt(item.amount ?? item[4]).toString();
      const destination = this.toHexString(item.destination ?? item[5]);

      return {
        withdrawal_id: withdrawalId,
        user_id: userId,
        asset_code: assetCode,
        issuer: issuer,
        amount: amount,
        destination: destination,
      };
    });
  }

  private toHexString(val: any): string {
    if (Buffer.isBuffer(val)) {
      return '0x' + val.toString('hex');
    }
    if (typeof val === 'string') {
      return val.startsWith('0x') ? val : '0x' + val;
    }
    if (val instanceof Uint8Array) {
      return '0x' + Buffer.from(val).toString('hex');
    }
    return '0x' + String(val);
  }
}

/**
 * Create appropriate fetcher based on environment
 */
export function createWithdrawalFetcher(
  contractId?: string,
  networkConfig: NetworkConfig = TESTNET_CONFIG
): IWithdrawalFetcher {
  if (contractId) {
    return new SorobanWithdrawalFetcher(contractId, networkConfig);
  }
  // Return mock for development/testing
  return new MockWithdrawalFetcher();
}

/**
 * Create test withdrawal for mock setup
 */
export function createTestWithdrawal(params: {
  withdrawalId?: string;
  userId?: string;
  assetCode: string;
  issuer: string;
  amount: string;
  destination: string;
}): WithdrawalIntent {
  return {
    withdrawal_id:
      params.withdrawalId ||
      '0x' + Buffer.from(Math.random().toString()).toString('hex').padEnd(64, '0'),
    user_id:
      params.userId ||
      '0x' + Buffer.from(Math.random().toString()).toString('hex').padEnd(64, '0'),
    asset_code: params.assetCode,
    issuer: params.issuer,
    amount: params.amount,
    destination: params.destination,
  };
}
