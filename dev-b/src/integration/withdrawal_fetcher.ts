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

  constructor(contractId: string, networkConfig: NetworkConfig = TESTNET_CONFIG) {
    this.contractId = contractId;
    this.networkConfig = networkConfig;
  }

  async fetchWithdrawals(
    subnetId: string,
    blockNumber: bigint
  ): Promise<WithdrawalIntent[]> {
    // TODO: Implement actual Soroban RPC contract call
    // This requires:
    // 1. Build a transaction to call get_withdrawal_queue(subnet_id)
    // 2. Use simulateTransaction to execute (read-only)
    // 3. Parse the result XDR into WithdrawalIntent[]

    // Placeholder implementation:
    // const sorobanRpc = new SorobanRpc.Server(this.getSorobanRpcUrl());
    //
    // // Build the contract call
    // const contract = new Contract(this.contractId);
    // const call = contract.call(
    //   'get_withdrawal_queue',
    //   xdr.ScVal.scvBytes(Buffer.from(subnetId.replace('0x', ''), 'hex'))
    // );
    //
    // // Simulate the transaction
    // const result = await sorobanRpc.simulateTransaction(call);
    //
    // // Parse the result
    // return this.parseWithdrawalQueue(result);

    throw new Error(
      'SorobanWithdrawalFetcher: Contract not deployed. Use MockWithdrawalFetcher for testing.'
    );
  }

  async getPendingCount(subnetId: string): Promise<number> {
    // TODO: Call get_withdrawal_queue_length(subnet_id) on contract
    throw new Error(
      'SorobanWithdrawalFetcher: Contract not deployed. Use MockWithdrawalFetcher for testing.'
    );
  }

  private getSorobanRpcUrl(): string {
    if (this.networkConfig.isTestnet) {
      return 'https://soroban-testnet.stellar.org';
    }
    return 'https://soroban.stellar.org';
  }

  /**
   * Parse withdrawal queue from Soroban contract response
   * Will be implemented when contract is deployed
   */
  private parseWithdrawalQueue(rawResult: unknown): WithdrawalIntent[] {
    // TODO: Parse the XDR response from contract
    // The response is an array of Withdrawal structs

    // Expected format from contract:
    // struct Withdrawal {
    //   bytes32 withdrawal_id;
    //   bytes32 user_id;
    //   string asset_code;
    //   bytes32 issuer;
    //   int128 amount;
    //   bytes32 destination;
    // }

    return [];
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
