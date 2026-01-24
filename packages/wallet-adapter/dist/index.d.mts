import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { EvmAddress, StellarAddress, NetworkType } from '@tva-protocol/sdk';
export { EvmAddress, NetworkType, StellarAddress } from '@tva-protocol/sdk';
import { EventEmitter } from 'eventemitter3';

/**
 * TVA Wallet Key Derivation
 *
 * Handles deterministic derivation of Stellar Ed25519 keys from
 * EVM secp256k1 keys. This allows users to control both their
 * EVM and Stellar identities from a single wallet (MetaMask).
 */

/**
 * Derives a Stellar keypair from an EVM private key or signature
 *
 * There are two modes:
 * 1. Direct derivation from private key (for server-side/testing)
 * 2. Signature-based derivation (for browser with MetaMask)
 */
declare function deriveStellarKeypairFromEvmKey(evmPrivateKey: string): Keypair;
/**
 * Derives a Stellar keypair from a signed message
 *
 * This is the browser-compatible method where:
 * 1. User signs a deterministic message with MetaMask
 * 2. The signature is used as entropy to derive the Stellar key
 *
 * The message is deterministic so the same wallet always derives
 * the same Stellar keypair.
 */
declare function deriveStellarKeypairFromSignature(signature: string): Keypair;
/**
 * Gets the deterministic message that should be signed for key derivation
 *
 * @param evmAddress - The user's EVM address
 * @param nonce - Optional nonce for key rotation (default 0)
 */
declare function getKeyDerivationMessage(evmAddress: EvmAddress, nonce?: number): string;
/**
 * Gets the EIP-712 typed data for key derivation
 * This is more secure and shows clear intent in MetaMask
 */
declare function getKeyDerivationTypedData(evmAddress: EvmAddress, chainId: number, nonce?: number): {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
    };
    types: {
        KeyDerivation: {
            name: string;
            type: string;
        }[];
    };
    primaryType: "KeyDerivation";
    message: {
        evmAddress: `0x${string}`;
        nonce: number;
        purpose: string;
    };
};
/**
 * Converts an EVM address to a pseudo-Stellar address for display
 * This is NOT a real Stellar address - just for UI consistency
 */
declare function evmAddressToDisplayAddress(evmAddress: EvmAddress): string;
/**
 * Validates that a Stellar address was derived from an EVM address
 * by checking the derivation path
 */
declare function validateDerivedAddress(evmAddress: EvmAddress, stellarAddress: StellarAddress, signFunction: (message: string) => Promise<string>): Promise<boolean>;
/**
 * Gets the raw Ed25519 public key bytes from a Stellar address
 */
declare function stellarAddressToPublicKeyBytes(address: StellarAddress): Uint8Array;
/**
 * Creates a Stellar address from Ed25519 public key bytes
 */
declare function publicKeyBytesToStellarAddress(publicKey: Uint8Array): StellarAddress;
/**
 * Computes the EVM address from a public key
 */
declare function computeEvmAddress(publicKey: Uint8Array): EvmAddress;

/**
 * TVA MetaMask Wallet Adapter
 *
 * Enables MetaMask and other EVM-compatible wallets to work with TVA Protocol.
 * Handles the dual-key challenge by deriving Stellar keys from MetaMask signatures.
 */

/**
 * Adapter events
 */
interface TVAWalletAdapterEvents {
    connect: (address: EvmAddress) => void;
    disconnect: () => void;
    accountsChanged: (accounts: EvmAddress[]) => void;
    chainChanged: (chainId: number) => void;
    stellarKeyDerived: (address: StellarAddress) => void;
    error: (error: Error) => void;
}
/**
 * Connection state
 */
interface ConnectionState {
    connected: boolean;
    evmAddress: EvmAddress | null;
    stellarAddress: StellarAddress | null;
    stellarKeypair: Keypair | null;
    chainId: number | null;
    isRegistered: boolean;
}
/**
 * TVA MetaMask Wallet Adapter
 */
declare class TVAWalletAdapter extends EventEmitter<TVAWalletAdapterEvents> {
    private provider;
    private stellarKeypair;
    private evmAddress;
    private chainId;
    private isRegistered;
    /**
     * TVA network configuration
     */
    private networkConfig;
    constructor(network?: NetworkType);
    /**
     * Checks if MetaMask is available
     */
    isAvailable(): boolean;
    /**
     * Gets the current connection state
     */
    getState(): ConnectionState;
    /**
     * Connects to MetaMask and derives Stellar keypair
     */
    connect(): Promise<ConnectionState>;
    /**
     * Disconnects from the wallet
     */
    disconnect(): Promise<void>;
    /**
     * Derives the Stellar keypair by requesting a signature from MetaMask
     */
    deriveAndStoreStellarKey(): Promise<Keypair>;
    /**
     * Signs a message with MetaMask (personal_sign)
     */
    signMessage(message: string): Promise<string>;
    /**
     * Signs typed data with MetaMask (EIP-712)
     */
    signTypedData(typedData: any): Promise<string>;
    /**
     * Signs an EVM transaction
     */
    signEvmTransaction(tx: any): Promise<string>;
    /**
     * Signs a Stellar transaction using the derived keypair
     */
    signStellarTransaction(transaction: Transaction): Transaction;
    /**
     * Signs arbitrary data with the Stellar keypair
     */
    signWithStellarKey(data: Uint8Array): Uint8Array;
    /**
     * Switches to the TVA network in MetaMask
     */
    switchToTVANetwork(): Promise<void>;
    /**
     * Adds the TVA network to MetaMask
     */
    addTVANetwork(): Promise<void>;
    /**
     * Gets the current chain ID
     */
    getChainId(): Promise<number>;
    /**
     * Gets the connected accounts
     */
    getAccounts(): Promise<EvmAddress[]>;
    /**
     * Gets the balance of the connected account
     */
    getBalance(): Promise<bigint>;
    /**
     * Sets up event listeners for MetaMask events
     */
    private setupEventListeners;
    /**
     * Removes event listeners
     */
    private removeEventListeners;
    /**
     * Handles account changes
     */
    private handleAccountsChanged;
    /**
     * Handles chain changes
     */
    private handleChainChanged;
    /**
     * Handles disconnection
     */
    private handleDisconnect;
}
/**
 * Gets or creates the wallet adapter instance
 */
declare function getWalletAdapter(network?: NetworkType): TVAWalletAdapter;
/**
 * Resets the wallet adapter instance (for testing)
 */
declare function resetWalletAdapter(): void;

export { type ConnectionState, TVAWalletAdapter, computeEvmAddress, deriveStellarKeypairFromEvmKey, deriveStellarKeypairFromSignature, evmAddressToDisplayAddress, getKeyDerivationMessage, getKeyDerivationTypedData, getWalletAdapter, publicKeyBytesToStellarAddress, resetWalletAdapter, stellarAddressToPublicKeyBytes, validateDerivedAddress };
