/**
 * TVA Protocol RPC Client
 *
 * Communicates with the TVA RPC server which translates
 * Ethereum JSON-RPC calls to Stellar/Soroban operations.
 */

import type {
  EvmAddress,
  EvmTransactionReceipt,
  EvmBlock,
  EvmLog,
  NetworkType,
  NetworkConfig,
} from '../types/index.js';
import { NETWORKS, TVAError, TVAErrorCode } from '../types/index.js';

/**
 * JSON-RPC request structure
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

/**
 * JSON-RPC response structure
 */
interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * RPC Client options
 */
export interface RpcClientOptions {
  /** RPC endpoint URL */
  url?: string;
  /** Network type (uses pre-configured URL if not providing custom URL) */
  network?: NetworkType;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom headers for requests */
  headers?: Record<string, string>;
}

/**
 * TVA RPC Client
 *
 * Provides type-safe access to the TVA JSON-RPC API.
 */
export class RpcClient {
  private url: string;
  private timeout: number;
  private headers: Record<string, string>;
  private requestId: number = 0;
  public readonly network: NetworkConfig;

  constructor(options: RpcClientOptions = {}) {
    const networkType = options.network || 'testnet';
    this.network = NETWORKS[networkType];
    this.url = options.url || this.network.rpcUrl;
    this.timeout = options.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Makes a JSON-RPC request to the TVA RPC server
   */
  private async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++this.requestId;

    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new TVAError(
          `HTTP error: ${response.status} ${response.statusText}`,
          TVAErrorCode.RPC_ERROR,
          { status: response.status }
        );
      }

      const json = (await response.json()) as JsonRpcResponse<T>;

      if (json.error) {
        throw new TVAError(
          json.error.message,
          TVAErrorCode.RPC_ERROR,
          { code: json.error.code, data: json.error.data }
        );
      }

      return json.result as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof TVAError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new TVAError(
          'Request timeout',
          TVAErrorCode.TIMEOUT,
          { timeout: this.timeout }
        );
      }

      throw new TVAError(
        `Network error: ${(error as Error).message}`,
        TVAErrorCode.NETWORK_ERROR,
        { originalError: error }
      );
    }
  }

  // ============================================================================
  // Chain Methods
  // ============================================================================

  /**
   * Returns the chain ID of the TVA network
   */
  async getChainId(): Promise<number> {
    const result = await this.request<string>('eth_chainId');
    return parseInt(result, 16);
  }

  /**
   * Returns the network version
   */
  async getNetworkVersion(): Promise<string> {
    return this.request<string>('net_version');
  }

  /**
   * Returns the client version
   */
  async getClientVersion(): Promise<string> {
    return this.request<string>('web3_clientVersion');
  }

  /**
   * Returns the current gas price in wei
   */
  async getGasPrice(): Promise<bigint> {
    const result = await this.request<string>('eth_gasPrice');
    return BigInt(result);
  }

  // ============================================================================
  // Block Methods
  // ============================================================================

  /**
   * Returns the current block number (Stellar ledger sequence)
   */
  async getBlockNumber(): Promise<number> {
    const result = await this.request<string>('eth_blockNumber');
    return parseInt(result, 16);
  }

  /**
   * Returns a block by number
   */
  async getBlockByNumber(
    blockNumber: number | 'latest' | 'earliest' | 'pending',
    includeTransactions: boolean = false
  ): Promise<EvmBlock | null> {
    const blockParam = typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber;

    return this.request<EvmBlock | null>('eth_getBlockByNumber', [
      blockParam,
      includeTransactions,
    ]);
  }

  /**
   * Returns a block by hash
   */
  async getBlockByHash(
    blockHash: string,
    includeTransactions: boolean = false
  ): Promise<EvmBlock | null> {
    return this.request<EvmBlock | null>('eth_getBlockByHash', [
      blockHash,
      includeTransactions,
    ]);
  }

  // ============================================================================
  // Account Methods
  // ============================================================================

  /**
   * Returns the balance of an account in wei (XLM converted to 18 decimals)
   */
  async getBalance(
    address: EvmAddress,
    blockNumber: number | 'latest' = 'latest'
  ): Promise<bigint> {
    const blockParam = typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber;

    const result = await this.request<string>('eth_getBalance', [
      address,
      blockParam,
    ]);
    return BigInt(result);
  }

  /**
   * Returns the transaction count (nonce) of an account
   */
  async getTransactionCount(
    address: EvmAddress,
    blockNumber: number | 'latest' | 'pending' = 'latest'
  ): Promise<number> {
    const blockParam = typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber;

    const result = await this.request<string>('eth_getTransactionCount', [
      address,
      blockParam,
    ]);
    return parseInt(result, 16);
  }

  /**
   * Returns the code at a given address (contract WASM hash)
   */
  async getCode(
    address: EvmAddress,
    blockNumber: number | 'latest' = 'latest'
  ): Promise<string> {
    const blockParam = typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber;

    return this.request<string>('eth_getCode', [address, blockParam]);
  }

  // ============================================================================
  // Transaction Methods
  // ============================================================================

  /**
   * Sends a signed raw transaction
   */
  async sendRawTransaction(signedTransaction: string): Promise<string> {
    return this.request<string>('eth_sendRawTransaction', [signedTransaction]);
  }

  /**
   * Returns a transaction by hash
   */
  async getTransactionByHash(txHash: string): Promise<any | null> {
    return this.request<any>('eth_getTransactionByHash', [txHash]);
  }

  /**
   * Returns a transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<EvmTransactionReceipt | null> {
    return this.request<EvmTransactionReceipt | null>('eth_getTransactionReceipt', [txHash]);
  }

  /**
   * Executes a call without creating a transaction (read-only)
   */
  async call(
    transaction: {
      from?: EvmAddress;
      to: EvmAddress;
      data?: string;
      value?: string;
      gas?: string;
      gasPrice?: string;
    },
    blockNumber: number | 'latest' = 'latest'
  ): Promise<string> {
    const blockParam = typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber;

    return this.request<string>('eth_call', [transaction, blockParam]);
  }

  /**
   * Estimates gas for a transaction
   */
  async estimateGas(transaction: {
    from?: EvmAddress;
    to?: EvmAddress;
    data?: string;
    value?: string;
  }): Promise<bigint> {
    const result = await this.request<string>('eth_estimateGas', [transaction]);
    return BigInt(result);
  }

  // ============================================================================
  // Log Methods
  // ============================================================================

  /**
   * Returns logs matching the given filter
   */
  async getLogs(filter: {
    fromBlock?: number | 'latest' | 'earliest';
    toBlock?: number | 'latest' | 'earliest';
    address?: EvmAddress | EvmAddress[];
    topics?: (string | string[] | null)[];
    blockHash?: string;
  }): Promise<EvmLog[]> {
    const formattedFilter: Record<string, unknown> = {};

    if (filter.fromBlock !== undefined) {
      formattedFilter.fromBlock = typeof filter.fromBlock === 'number'
        ? `0x${filter.fromBlock.toString(16)}`
        : filter.fromBlock;
    }

    if (filter.toBlock !== undefined) {
      formattedFilter.toBlock = typeof filter.toBlock === 'number'
        ? `0x${filter.toBlock.toString(16)}`
        : filter.toBlock;
    }

    if (filter.address) {
      formattedFilter.address = filter.address;
    }

    if (filter.topics) {
      formattedFilter.topics = filter.topics;
    }

    if (filter.blockHash) {
      formattedFilter.blockHash = filter.blockHash;
    }

    return this.request<EvmLog[]>('eth_getLogs', [formattedFilter]);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Computes keccak256 hash
   */
  async sha3(data: string): Promise<string> {
    return this.request<string>('web3_sha3', [data]);
  }

  /**
   * Waits for a transaction to be mined
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1,
    timeout: number = 60000
  ): Promise<EvmTransactionReceipt> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const receipt = await this.getTransactionReceipt(txHash);

      if (receipt) {
        // Check confirmations
        const currentBlock = await this.getBlockNumber();
        const txBlock = receipt.blockNumber;
        const currentConfirmations = currentBlock - txBlock + 1;

        if (currentConfirmations >= confirmations) {
          return receipt;
        }
      }

      // Wait before polling again (Stellar has ~5s block time)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new TVAError(
      `Transaction ${txHash} was not mined within ${timeout}ms`,
      TVAErrorCode.TIMEOUT,
      { txHash, timeout }
    );
  }

  /**
   * Checks if the RPC server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.getChainId();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Creates an RPC client for the specified network
 */
export function createRpcClient(
  networkOrUrl: NetworkType | string = 'testnet'
): RpcClient {
  if (networkOrUrl.startsWith('http')) {
    return new RpcClient({ url: networkOrUrl });
  }
  return new RpcClient({ network: networkOrUrl as NetworkType });
}
