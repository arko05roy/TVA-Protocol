import { JsonRpcProvider, BlockTag, Block, TransactionReceipt, TransactionRequest, Network, AbstractSigner, TypedDataDomain, TypedDataField, TransactionResponse, SigningKey } from 'ethers';
export { Block, Contract, ContractFactory, Filter, Interface, Log, TransactionReceipt, TransactionRequest, TransactionResponse, formatEther, formatUnits, getAddress, hexlify, isAddress, keccak256, parseEther, parseUnits, toUtf8Bytes } from 'ethers';
import { NetworkType } from '@tva-protocol/sdk';

/**
 * TVA Protocol ethers.js Provider
 *
 * A custom JsonRpcProvider that connects to the TVA RPC server,
 * enabling standard ethers.js patterns to work with Stellar/Soroban.
 */

/**
 * TVA Network configuration for ethers.js
 */
declare const TVA_NETWORK: Network;
/**
 * TVA Provider Options
 */
interface TVAProviderOptions {
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
declare class TVAProvider extends JsonRpcProvider {
    private readonly tvaNetwork;
    constructor(options?: TVAProviderOptions);
    /**
     * Gets the TVA network type
     */
    getTVANetwork(): NetworkType;
    /**
     * Gets the Stellar/Soroban RPC URL for direct access if needed
     */
    getSorobanRpcUrl(): string;
    /**
     * Override to handle TVA-specific block formatting
     */
    getBlock(blockHashOrBlockTag: BlockTag | string, prefetchTxs?: boolean): Promise<Block | null>;
    /**
     * Override to handle TVA-specific transaction receipt formatting
     */
    getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>;
    /**
     * Override to handle TVA-specific gas estimation
     * TVA converts Soroban resources to gas units
     */
    estimateGas(tx: TransactionRequest): Promise<bigint>;
    /**
     * Gets the native XLM balance of an address
     * Note: Returns balance in wei-equivalent (18 decimals) for ethers.js compatibility
     */
    getXlmBalance(address: string): Promise<bigint>;
    /**
     * Waits for a transaction to be included in a block
     * Override to use TVA's faster block times (~5 seconds)
     */
    waitForTransaction(hash: string, _confirms?: number, timeout?: number): Promise<TransactionReceipt | null>;
    /**
     * Checks if the provider is connected to the TVA RPC
     */
    isConnected(): Promise<boolean>;
    /**
     * Gets TVA-specific network information
     */
    getTVANetworkInfo(): Promise<{
        chainId: number;
        networkType: NetworkType;
        blockNumber: number;
        gasPrice: bigint;
    }>;
}
/**
 * Creates a TVA provider for the specified network
 */
declare function createTVAProvider(networkOrUrl?: NetworkType | string, options?: Omit<TVAProviderOptions, 'network'>): TVAProvider;
/**
 * Connects to the default TVA testnet
 */
declare function getDefaultProvider(): TVAProvider;

/**
 * TVA Protocol ethers.js Signer
 *
 * Custom signer that handles TVA's dual-key architecture (EVM + Stellar)
 * while providing a standard ethers.js Signer interface.
 */

/**
 * TVA Signer Options
 */
interface TVASignerOptions {
    /** EVM private key (hex string with or without 0x prefix) */
    privateKey: string;
    /** Optional Stellar secret key for direct Stellar operations */
    stellarSecretKey?: string;
}
/**
 * TVA Signer
 *
 * Extends ethers.js signing capabilities for TVA Protocol.
 * Uses the EVM private key for transaction signing while maintaining
 * compatibility with TVA's RPC translation layer.
 */
declare class TVASigner extends AbstractSigner<TVAProvider> {
    private readonly evmWallet;
    private readonly stellarSecretKey?;
    constructor(options: TVASignerOptions, provider?: TVAProvider);
    /**
     * Gets the EVM address of this signer
     */
    getAddress(): Promise<string>;
    /**
     * Connects this signer to a provider
     */
    connect(provider: TVAProvider): TVASigner;
    /**
     * Signs a message using the EVM private key
     */
    signMessage(message: string | Uint8Array): Promise<string>;
    /**
     * Signs typed data (EIP-712)
     */
    signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string>;
    /**
     * Signs a transaction
     */
    signTransaction(tx: TransactionRequest): Promise<string>;
    /**
     * Sends a transaction
     */
    sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
    /**
     * Gets the Stellar secret key if available
     */
    getStellarSecretKey(): string | undefined;
    /**
     * Gets the underlying signing key
     */
    get signingKey(): SigningKey;
}
/**
 * Creates a TVA signer from a private key
 */
declare function createTVASigner(privateKey: string, provider?: TVAProvider): TVASigner;
/**
 * Creates a TVA signer with both EVM and Stellar keys
 */
declare function createDualKeySigner(evmPrivateKey: string, stellarSecretKey: string, provider?: TVAProvider): TVASigner;

export { TVAProvider, type TVAProviderOptions, TVASigner, type TVASignerOptions, TVA_NETWORK, createDualKeySigner, createTVAProvider, createTVASigner, getDefaultProvider };
