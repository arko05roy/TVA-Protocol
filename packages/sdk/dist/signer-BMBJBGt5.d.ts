import { Transaction, xdr } from '@stellar/stellar-sdk';
import { E as EvmAddress, K as KeyPair, o as EvmTransaction, q as NetworkConfig, r as NetworkType } from './index-CpingBUy.js';

/**
 * TVA Protocol Transaction Signer
 *
 * Handles signing for both EVM-format and Stellar-format transactions.
 * This is critical for the TVA dual-key architecture where:
 * - Users sign with their EVM wallet (MetaMask)
 * - The signed transaction is translated and re-signed for Stellar submission
 */

/**
 * EVM Transaction Signer
 * Signs transactions using secp256k1 (Ethereum-compatible)
 */
declare class EvmSigner {
    private privateKey;
    readonly address: EvmAddress;
    constructor(keyPair: KeyPair);
    /**
     * Signs a message hash using secp256k1
     */
    signHash(hash: Uint8Array): {
        r: string;
        s: string;
        v: number;
    };
    /**
     * Signs a personal message (EIP-191)
     */
    signMessage(message: string): string;
    /**
     * Signs typed data (EIP-712)
     */
    signTypedData(domain: Record<string, unknown>, types: Record<string, Array<{
        name: string;
        type: string;
    }>>, value: Record<string, unknown>): string;
    private hashStruct;
    private encodeType;
    private encodeData;
    private encodeValue;
    /**
     * Signs an EVM transaction and returns the signed raw transaction
     */
    signTransaction(tx: EvmTransaction): string;
    private rlpEncodeTransaction;
    private rlpEncodeSignedTransaction;
    private rlpEncode;
    private toBytes;
    private encodeBigEndian;
}
/**
 * Stellar Transaction Signer
 * Signs transactions using Ed25519 (Stellar-compatible)
 */
declare class StellarSigner {
    private keypair;
    readonly publicKey: string;
    constructor(keyPair: KeyPair);
    /**
     * Signs a Stellar transaction
     */
    signTransaction(transaction: Transaction, _networkPassphrase?: string): Transaction;
    /**
     * Signs arbitrary data
     */
    signData(data: Uint8Array): Uint8Array;
    /**
     * Verifies a signature
     */
    verifySignature(data: Uint8Array, signature: Uint8Array): boolean;
    /**
     * Signs a Soroban authorization entry
     */
    signAuthEntry(entry: xdr.SorobanAuthorizationEntry, networkPassphrase: string, validUntilLedger: number): xdr.SorobanAuthorizationEntry;
}
/**
 * Combined TVA Signer that handles both EVM and Stellar signing
 */
declare class TVASigner {
    readonly evmSigner: EvmSigner;
    readonly stellarSigner: StellarSigner;
    readonly keyPair: KeyPair;
    readonly network: NetworkConfig;
    constructor(keyPair: KeyPair, network?: NetworkType);
    get evmAddress(): EvmAddress;
    get stellarAddress(): string;
    /**
     * Signs an EVM-format transaction
     */
    signEvmTransaction(tx: EvmTransaction): string;
    /**
     * Signs a Stellar transaction
     */
    signStellarTransaction(transaction: Transaction): Transaction;
    /**
     * Signs a personal message (for wallet connect / dapp signatures)
     */
    signMessage(message: string): string;
}

export { EvmSigner as E, StellarSigner as S, TVASigner as T };
