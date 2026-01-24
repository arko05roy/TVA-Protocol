/**
 * TVA MetaMask Wallet Adapter
 *
 * Enables MetaMask and other EVM-compatible wallets to work with TVA Protocol.
 * Handles the dual-key challenge by deriving Stellar keys from MetaMask signatures.
 */

import { EventEmitter } from 'eventemitter3';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import {
  deriveStellarKeypairFromSignature,
  getKeyDerivationMessage,
} from '../keys/derivation.js';
import type { EvmAddress, StellarAddress, NetworkType, NetworkConfig } from '@tva-protocol/sdk';

/**
 * Ethereum provider interface (injected by MetaMask)
 */
interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  removeListener: (event: string, callback: (...args: any[]) => void) => void;
  selectedAddress: string | null;
  chainId: string;
}

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
export interface ConnectionState {
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
export class TVAWalletAdapter extends EventEmitter<TVAWalletAdapterEvents> {
  private provider: EthereumProvider | null = null;
  private stellarKeypair: Keypair | null = null;
  private evmAddress: EvmAddress | null = null;
  private chainId: number | null = null;
  private isRegistered: boolean = false;

  /**
   * TVA network configuration
   */
  private networkConfig: NetworkConfig;

  constructor(network: NetworkType = 'testnet') {
    super();
    // Import NETWORKS dynamically to avoid circular dependencies
    this.networkConfig = {
      type: network,
      rpcUrl: network === 'testnet'
        ? 'https://rpc.testnet.tva-protocol.io'
        : network === 'mainnet'
        ? 'https://rpc.tva-protocol.io'
        : 'http://localhost:8545',
      horizonUrl: network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'http://localhost:8000',
      sorobanRpcUrl: network === 'testnet'
        ? 'https://soroban-testnet.stellar.org'
        : network === 'mainnet'
        ? 'https://soroban.stellar.org'
        : 'http://localhost:8001',
      networkPassphrase: network === 'testnet'
        ? 'Test SDF Network ; September 2015'
        : network === 'mainnet'
        ? 'Public Global Stellar Network ; September 2015'
        : 'Standalone Network ; February 2017',
      chainId: network === 'testnet' ? 0x544541 : network === 'mainnet' ? 0x545641 : 0x545600,
      nativeCurrency: {
        name: 'Stellar Lumens',
        symbol: 'XLM',
        decimals: 7,
      },
    };
  }

  /**
   * Checks if MetaMask is available
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as any).ethereum;
  }

  /**
   * Gets the current connection state
   */
  getState(): ConnectionState {
    return {
      connected: !!this.evmAddress,
      evmAddress: this.evmAddress,
      stellarAddress: this.stellarKeypair?.publicKey() as StellarAddress | null,
      stellarKeypair: this.stellarKeypair,
      chainId: this.chainId,
      isRegistered: this.isRegistered,
    };
  }

  /**
   * Connects to MetaMask and derives Stellar keypair
   */
  async connect(): Promise<ConnectionState> {
    if (!this.isAvailable()) {
      throw new Error('MetaMask is not installed');
    }

    this.provider = (window as any).ethereum as EthereumProvider;

    try {
      // Request account access
      const accounts = await this.provider.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      this.evmAddress = accounts[0] as EvmAddress;
      this.chainId = parseInt(this.provider.chainId, 16);

      // Set up event listeners
      this.setupEventListeners();

      this.emit('connect', this.evmAddress);

      // Derive Stellar keypair
      await this.deriveAndStoreStellarKey();

      return this.getState();
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Disconnects from the wallet
   */
  async disconnect(): Promise<void> {
    this.evmAddress = null;
    this.stellarKeypair = null;
    this.chainId = null;
    this.isRegistered = false;

    if (this.provider) {
      this.removeEventListeners();
    }

    this.emit('disconnect');
  }

  /**
   * Derives the Stellar keypair by requesting a signature from MetaMask
   */
  async deriveAndStoreStellarKey(): Promise<Keypair> {
    if (!this.provider || !this.evmAddress) {
      throw new Error('Wallet not connected');
    }

    // Get the derivation message
    const message = getKeyDerivationMessage(this.evmAddress);

    // Request signature from MetaMask
    const signature = await this.signMessage(message);

    // Derive Stellar keypair from signature
    this.stellarKeypair = deriveStellarKeypairFromSignature(signature);

    this.emit('stellarKeyDerived', this.stellarKeypair.publicKey() as StellarAddress);

    return this.stellarKeypair;
  }

  /**
   * Signs a message with MetaMask (personal_sign)
   */
  async signMessage(message: string): Promise<string> {
    if (!this.provider || !this.evmAddress) {
      throw new Error('Wallet not connected');
    }

    return this.provider.request({
      method: 'personal_sign',
      params: [
        `0x${Buffer.from(message).toString('hex')}`,
        this.evmAddress,
      ],
    });
  }

  /**
   * Signs typed data with MetaMask (EIP-712)
   */
  async signTypedData(typedData: any): Promise<string> {
    if (!this.provider || !this.evmAddress) {
      throw new Error('Wallet not connected');
    }

    return this.provider.request({
      method: 'eth_signTypedData_v4',
      params: [this.evmAddress, JSON.stringify(typedData)],
    });
  }

  /**
   * Signs an EVM transaction
   */
  async signEvmTransaction(tx: any): Promise<string> {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }

    return this.provider.request({
      method: 'eth_sendTransaction',
      params: [tx],
    });
  }

  /**
   * Signs a Stellar transaction using the derived keypair
   */
  signStellarTransaction(transaction: Transaction): Transaction {
    if (!this.stellarKeypair) {
      throw new Error('Stellar keypair not derived. Call deriveAndStoreStellarKey() first.');
    }

    transaction.sign(this.stellarKeypair);
    return transaction;
  }

  /**
   * Signs arbitrary data with the Stellar keypair
   */
  signWithStellarKey(data: Uint8Array): Uint8Array {
    if (!this.stellarKeypair) {
      throw new Error('Stellar keypair not derived');
    }

    return this.stellarKeypair.sign(Buffer.from(data));
  }

  /**
   * Switches to the TVA network in MetaMask
   */
  async switchToTVANetwork(): Promise<void> {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }

    const chainIdHex = `0x${this.networkConfig.chainId.toString(16)}`;

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (error: any) {
      // Chain doesn't exist, add it
      if (error.code === 4902) {
        await this.addTVANetwork();
      } else {
        throw error;
      }
    }
  }

  /**
   * Adds the TVA network to MetaMask
   */
  async addTVANetwork(): Promise<void> {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }

    const chainIdHex = `0x${this.networkConfig.chainId.toString(16)}`;

    await this.provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainIdHex,
          chainName: `TVA Protocol ${this.networkConfig.type}`,
          nativeCurrency: this.networkConfig.nativeCurrency,
          rpcUrls: [this.networkConfig.rpcUrl],
          blockExplorerUrls: [`https://explorer.tva-protocol.io`],
        },
      ],
    });
  }

  /**
   * Gets the current chain ID
   */
  async getChainId(): Promise<number> {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }

    const chainId = await this.provider.request({ method: 'eth_chainId' });
    return parseInt(chainId, 16);
  }

  /**
   * Gets the connected accounts
   */
  async getAccounts(): Promise<EvmAddress[]> {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }

    return this.provider.request({ method: 'eth_accounts' });
  }

  /**
   * Gets the balance of the connected account
   */
  async getBalance(): Promise<bigint> {
    if (!this.provider || !this.evmAddress) {
      throw new Error('Wallet not connected');
    }

    const balance = await this.provider.request({
      method: 'eth_getBalance',
      params: [this.evmAddress, 'latest'],
    });

    return BigInt(balance);
  }

  /**
   * Sets up event listeners for MetaMask events
   */
  private setupEventListeners(): void {
    if (!this.provider) return;

    this.provider.on('accountsChanged', this.handleAccountsChanged);
    this.provider.on('chainChanged', this.handleChainChanged);
    this.provider.on('disconnect', this.handleDisconnect);
  }

  /**
   * Removes event listeners
   */
  private removeEventListeners(): void {
    if (!this.provider) return;

    this.provider.removeListener('accountsChanged', this.handleAccountsChanged);
    this.provider.removeListener('chainChanged', this.handleChainChanged);
    this.provider.removeListener('disconnect', this.handleDisconnect);
  }

  /**
   * Handles account changes
   */
  private handleAccountsChanged = (accounts: string[]): void => {
    if (accounts.length === 0) {
      this.disconnect();
    } else {
      this.evmAddress = accounts[0] as EvmAddress;
      this.stellarKeypair = null; // Need to re-derive for new account
      this.emit('accountsChanged', accounts as EvmAddress[]);
    }
  };

  /**
   * Handles chain changes
   */
  private handleChainChanged = (chainId: string): void => {
    this.chainId = parseInt(chainId, 16);
    this.emit('chainChanged', this.chainId);
  };

  /**
   * Handles disconnection
   */
  private handleDisconnect = (): void => {
    this.disconnect();
  };
}

/**
 * Singleton instance for easy access
 */
let walletAdapterInstance: TVAWalletAdapter | null = null;

/**
 * Gets or creates the wallet adapter instance
 */
export function getWalletAdapter(network: NetworkType = 'testnet'): TVAWalletAdapter {
  if (!walletAdapterInstance) {
    walletAdapterInstance = new TVAWalletAdapter(network);
  }
  return walletAdapterInstance;
}

/**
 * Resets the wallet adapter instance (for testing)
 */
export function resetWalletAdapter(): void {
  if (walletAdapterInstance) {
    walletAdapterInstance.disconnect();
    walletAdapterInstance = null;
  }
}
