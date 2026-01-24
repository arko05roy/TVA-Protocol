/**
 * TVA Protocol ethers.js Provider
 *
 * A custom JsonRpcProvider that connects to the TVA RPC server,
 * enabling standard ethers.js patterns to work with Stellar/Soroban.
 */

import {
  JsonRpcProvider,
  Network,
  Block,
  TransactionReceipt,
  type BlockTag,
  type TransactionRequest,
} from 'ethers';
import {
  NETWORKS,
  TVA_CHAIN_ID,
  type NetworkType,
} from '@tva-protocol/sdk';

/**
 * TVA Network configuration for ethers.js
 */
export const TVA_NETWORK = new Network('TVA Protocol', TVA_CHAIN_ID);

/**
 * TVA Provider Options
 */
export interface TVAProviderOptions {
  /** Network type or custom RPC URL */
  network?: NetworkType | string;
  /** Polling interval in milliseconds (default: 5000 for Stellar's ~5s blocks) */
  pollingInterval?: number;
  /** Static network to skip network detection */
  staticNetwork?: boolean;
}

/**
 * TVA JSON-RPC Provider
 *
 * Extends ethers.js JsonRpcProvider to work with TVA Protocol's RPC layer.
 * Handles TVA-specific quirks while maintaining full ethers.js compatibility.
 */
export class TVAProvider extends JsonRpcProvider {
  private readonly tvaNetwork: NetworkType;

  constructor(options: TVAProviderOptions = {}) {
    const networkType = typeof options.network === 'string' && options.network.startsWith('http')
      ? 'testnet'
      : (options.network as NetworkType) || 'testnet';

    const rpcUrl = typeof options.network === 'string' && options.network.startsWith('http')
      ? options.network
      : NETWORKS[networkType].rpcUrl;

    // Create the TVA network
    const network = new Network('TVA Protocol', TVA_CHAIN_ID);

    super(rpcUrl, network, {
      staticNetwork: options.staticNetwork !== false ? network : undefined,
      polling: true,
      pollingInterval: options.pollingInterval || 5000,
    });

    this.tvaNetwork = networkType;
  }

  /**
   * Gets the TVA network type
   */
  getTVANetwork(): NetworkType {
    return this.tvaNetwork;
  }

  /**
   * Gets the Stellar/Soroban RPC URL for direct access if needed
   */
  getSorobanRpcUrl(): string {
    return NETWORKS[this.tvaNetwork].sorobanRpcUrl;
  }

  /**
   * Override to handle TVA-specific block formatting
   */
  async getBlock(
    blockHashOrBlockTag: BlockTag | string,
    prefetchTxs?: boolean
  ): Promise<Block | null> {
    const block = await super.getBlock(blockHashOrBlockTag, prefetchTxs);

    if (!block) {
      return null;
    }

    return block;
  }

  /**
   * Override to handle TVA-specific transaction receipt formatting
   */
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
    const receipt = await super.getTransactionReceipt(hash);
    return receipt;
  }

  /**
   * Override to handle TVA-specific gas estimation
   * TVA converts Soroban resources to gas units
   */
  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    const gas = await super.estimateGas(tx);
    // TVA RPC already returns gas in EVM-compatible units
    return gas;
  }

  /**
   * Gets the native XLM balance of an address
   * Note: Returns balance in wei-equivalent (18 decimals) for ethers.js compatibility
   */
  async getXlmBalance(address: string): Promise<bigint> {
    return this.getBalance(address);
  }

  /**
   * Waits for a transaction to be included in a block
   * Override to use TVA's faster block times (~5 seconds)
   */
  async waitForTransaction(
    hash: string,
    _confirms?: number,
    timeout?: number
  ): Promise<TransactionReceipt | null> {
    const timeoutMs = timeout || 60000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const receipt = await this.getTransactionReceipt(hash);
      if (receipt) {
        return receipt;
      }
      // Wait 2 seconds between polls (Stellar has ~5s block time)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  }

  /**
   * Checks if the provider is connected to the TVA RPC
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets TVA-specific network information
   */
  async getTVANetworkInfo(): Promise<{
    chainId: number;
    networkType: NetworkType;
    blockNumber: number;
    gasPrice: bigint;
  }> {
    const [chainId, blockNumber, gasPrice] = await Promise.all([
      this.send('eth_chainId', []),
      this.getBlockNumber(),
      this.getFeeData(),
    ]);

    return {
      chainId: parseInt(chainId, 16),
      networkType: this.tvaNetwork,
      blockNumber,
      gasPrice: gasPrice.gasPrice || BigInt(0),
    };
  }
}

/**
 * Creates a TVA provider for the specified network
 */
export function createTVAProvider(
  networkOrUrl: NetworkType | string = 'testnet',
  options: Omit<TVAProviderOptions, 'network'> = {}
): TVAProvider {
  return new TVAProvider({
    ...options,
    network: networkOrUrl,
  });
}

/**
 * Connects to the default TVA testnet
 */
export function getDefaultProvider(): TVAProvider {
  return createTVAProvider('testnet');
}
