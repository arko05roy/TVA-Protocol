/**
 * TVA Protocol ethers.js Signer
 *
 * Custom signer that handles TVA's dual-key architecture (EVM + Stellar)
 * while providing a standard ethers.js Signer interface.
 */

import {
  AbstractSigner,
  TransactionRequest,
  TransactionResponse,
  TypedDataDomain,
  TypedDataField,
  Transaction,
  resolveAddress,
  type SigningKey,
  type TransactionLike,
} from 'ethers';
import { Wallet } from 'ethers';
import type { TVAProvider } from './provider.js';

/**
 * TVA Signer Options
 */
export interface TVASignerOptions {
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
export class TVASigner extends AbstractSigner<TVAProvider> {
  private readonly evmWallet: Wallet;
  private readonly stellarSecretKey?: string;

  constructor(options: TVASignerOptions, provider?: TVAProvider) {
    super(provider);

    // Normalize private key
    const privateKey = options.privateKey.startsWith('0x')
      ? options.privateKey
      : `0x${options.privateKey}`;

    // Create underlying ethers wallet for EVM signing
    this.evmWallet = new Wallet(privateKey);
    this.stellarSecretKey = options.stellarSecretKey;
  }

  /**
   * Gets the EVM address of this signer
   */
  async getAddress(): Promise<string> {
    return this.evmWallet.address;
  }

  /**
   * Connects this signer to a provider
   */
  connect(provider: TVAProvider): TVASigner {
    return new TVASigner(
      {
        privateKey: this.evmWallet.privateKey,
        stellarSecretKey: this.stellarSecretKey,
      },
      provider
    );
  }

  /**
   * Signs a message using the EVM private key
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    return this.evmWallet.signMessage(message);
  }

  /**
   * Signs typed data (EIP-712)
   */
  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.evmWallet.signTypedData(domain, types, value);
  }

  /**
   * Signs a transaction
   */
  async signTransaction(tx: TransactionRequest): Promise<string> {
    // Build transaction-like object with resolved values
    const txLike: TransactionLike = {
      type: tx.type ?? 0,
      chainId: tx.chainId ?? undefined,
      nonce: tx.nonce ?? undefined,
      gasLimit: tx.gasLimit ?? undefined,
      gasPrice: tx.gasPrice ?? undefined,
      maxFeePerGas: tx.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? undefined,
      to: tx.to ? await resolveAddress(tx.to, this.provider) : null,
      value: tx.value ?? 0n,
      data: tx.data ?? '0x',
      accessList: tx.accessList ?? undefined,
    };

    // Get chain ID from provider if not specified
    if (txLike.chainId === undefined && this.provider) {
      const network = await this.provider.getNetwork();
      txLike.chainId = network.chainId;
    }

    // Get nonce if not specified
    if (txLike.nonce === undefined && this.provider) {
      txLike.nonce = await this.provider.getTransactionCount(
        await this.getAddress()
      );
    }

    // Get gas price if not specified
    if (!txLike.gasPrice && !txLike.maxFeePerGas && this.provider) {
      const feeData = await this.provider.getFeeData();
      if (feeData.gasPrice) {
        txLike.gasPrice = feeData.gasPrice;
      }
    }

    // Estimate gas if not specified
    if (!txLike.gasLimit && this.provider) {
      txLike.gasLimit = await this.provider.estimateGas({
        from: await this.getAddress(),
        to: txLike.to ?? undefined,
        data: txLike.data,
        value: txLike.value,
      });
    }

    // Create and sign transaction
    const transaction = Transaction.from(txLike);
    const signature = this.evmWallet.signingKey.sign(transaction.unsignedHash);
    transaction.signature = signature;

    return transaction.serialized;
  }

  /**
   * Sends a transaction
   */
  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    if (!this.provider) {
      throw new Error('No provider connected');
    }

    // Sign the transaction (this populates missing fields)
    const signedTx = await this.signTransaction(tx);

    // Broadcast via provider
    return this.provider.broadcastTransaction(signedTx);
  }

  /**
   * Gets the Stellar secret key if available
   */
  getStellarSecretKey(): string | undefined {
    return this.stellarSecretKey;
  }

  /**
   * Gets the underlying signing key
   */
  get signingKey(): SigningKey {
    return this.evmWallet.signingKey;
  }
}

/**
 * Creates a TVA signer from a private key
 */
export function createTVASigner(
  privateKey: string,
  provider?: TVAProvider
): TVASigner {
  return new TVASigner({ privateKey }, provider);
}

/**
 * Creates a TVA signer with both EVM and Stellar keys
 */
export function createDualKeySigner(
  evmPrivateKey: string,
  stellarSecretKey: string,
  provider?: TVAProvider
): TVASigner {
  return new TVASigner(
    {
      privateKey: evmPrivateKey,
      stellarSecretKey,
    },
    provider
  );
}
