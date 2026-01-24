import { q as NetworkConfig, r as NetworkType, m as EvmBlock, E as EvmAddress, p as EvmTransactionReceipt, n as EvmLog } from '../index-CpingBUy.js';

/**
 * TVA Protocol RPC Client
 *
 * Communicates with the TVA RPC server which translates
 * Ethereum JSON-RPC calls to Stellar/Soroban operations.
 */

/**
 * RPC Client options
 */
interface RpcClientOptions {
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
declare class RpcClient {
    private url;
    private timeout;
    private headers;
    private requestId;
    readonly network: NetworkConfig;
    constructor(options?: RpcClientOptions);
    /**
     * Makes a JSON-RPC request to the TVA RPC server
     */
    private request;
    /**
     * Returns the chain ID of the TVA network
     */
    getChainId(): Promise<number>;
    /**
     * Returns the network version
     */
    getNetworkVersion(): Promise<string>;
    /**
     * Returns the client version
     */
    getClientVersion(): Promise<string>;
    /**
     * Returns the current gas price in wei
     */
    getGasPrice(): Promise<bigint>;
    /**
     * Returns the current block number (Stellar ledger sequence)
     */
    getBlockNumber(): Promise<number>;
    /**
     * Returns a block by number
     */
    getBlockByNumber(blockNumber: number | 'latest' | 'earliest' | 'pending', includeTransactions?: boolean): Promise<EvmBlock | null>;
    /**
     * Returns a block by hash
     */
    getBlockByHash(blockHash: string, includeTransactions?: boolean): Promise<EvmBlock | null>;
    /**
     * Returns the balance of an account in wei (XLM converted to 18 decimals)
     */
    getBalance(address: EvmAddress, blockNumber?: number | 'latest'): Promise<bigint>;
    /**
     * Returns the transaction count (nonce) of an account
     */
    getTransactionCount(address: EvmAddress, blockNumber?: number | 'latest' | 'pending'): Promise<number>;
    /**
     * Returns the code at a given address (contract WASM hash)
     */
    getCode(address: EvmAddress, blockNumber?: number | 'latest'): Promise<string>;
    /**
     * Sends a signed raw transaction
     */
    sendRawTransaction(signedTransaction: string): Promise<string>;
    /**
     * Returns a transaction by hash
     */
    getTransactionByHash(txHash: string): Promise<any | null>;
    /**
     * Returns a transaction receipt
     */
    getTransactionReceipt(txHash: string): Promise<EvmTransactionReceipt | null>;
    /**
     * Executes a call without creating a transaction (read-only)
     */
    call(transaction: {
        from?: EvmAddress;
        to: EvmAddress;
        data?: string;
        value?: string;
        gas?: string;
        gasPrice?: string;
    }, blockNumber?: number | 'latest'): Promise<string>;
    /**
     * Estimates gas for a transaction
     */
    estimateGas(transaction: {
        from?: EvmAddress;
        to?: EvmAddress;
        data?: string;
        value?: string;
    }): Promise<bigint>;
    /**
     * Returns logs matching the given filter
     */
    getLogs(filter: {
        fromBlock?: number | 'latest' | 'earliest';
        toBlock?: number | 'latest' | 'earliest';
        address?: EvmAddress | EvmAddress[];
        topics?: (string | string[] | null)[];
        blockHash?: string;
    }): Promise<EvmLog[]>;
    /**
     * Computes keccak256 hash
     */
    sha3(data: string): Promise<string>;
    /**
     * Waits for a transaction to be mined
     */
    waitForTransaction(txHash: string, confirmations?: number, timeout?: number): Promise<EvmTransactionReceipt>;
    /**
     * Checks if the RPC server is healthy
     */
    isHealthy(): Promise<boolean>;
}
/**
 * Creates an RPC client for the specified network
 */
declare function createRpcClient(networkOrUrl?: NetworkType | string): RpcClient;

export { RpcClient, type RpcClientOptions, createRpcClient };
