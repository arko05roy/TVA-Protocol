/**
 * TVA Protocol Transaction Signer
 *
 * Handles signing for both EVM-format and Stellar-format transactions.
 * This is critical for the TVA dual-key architecture where:
 * - Users sign with their EVM wallet (MetaMask)
 * - The signed transaction is translated and re-signed for Stellar submission
 */

import {
  Keypair,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';
import { keccak_256 } from '@noble/hashes/sha3';
import * as secp256k1 from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import type {
  KeyPair,
  EvmTransaction,
  EvmAddress,
  NetworkType,
  NetworkConfig,
} from '../types/index.js';
import { NETWORKS } from '../types/index.js';
import { getEvmAddress } from './keys.js';

// RFC6979 deterministic k generation for secp256k1 signing
secp256k1.etc.hmacSha256Sync = (k, ...m) =>
  hmac(sha256, k, secp256k1.etc.concatBytes(...m));

/**
 * EVM Transaction Signer
 * Signs transactions using secp256k1 (Ethereum-compatible)
 */
export class EvmSigner {
  private privateKey: Uint8Array;
  public readonly address: EvmAddress;

  constructor(keyPair: KeyPair) {
    this.privateKey = Buffer.from(
      keyPair.evmPrivateKey.replace(/^0x/, ''),
      'hex'
    );
    this.address = getEvmAddress(keyPair);
  }

  /**
   * Signs a message hash using secp256k1
   */
  signHash(hash: Uint8Array): { r: string; s: string; v: number } {
    const signature = secp256k1.sign(hash, this.privateKey);
    const r = signature.r.toString(16).padStart(64, '0');
    const s = signature.s.toString(16).padStart(64, '0');

    // Calculate recovery id (v)
    // For EIP-155 transactions: v = chainId * 2 + 35 + recovery_id
    // For legacy: v = 27 + recovery_id
    const v = signature.recovery + 27;

    return { r: `0x${r}`, s: `0x${s}`, v };
  }

  /**
   * Signs a personal message (EIP-191)
   */
  signMessage(message: string): string {
    const messageBytes = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(
      `\x19Ethereum Signed Message:\n${messageBytes.length}`
    );
    const prefixedMessage = new Uint8Array([...prefix, ...messageBytes]);
    const hash = keccak_256(prefixedMessage);

    const { r, s, v } = this.signHash(hash);
    return `${r}${s.slice(2)}${v.toString(16).padStart(2, '0')}`;
  }

  /**
   * Signs typed data (EIP-712)
   */
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): string {
    // Simplified EIP-712 implementation
    // In production, use a full implementation from ethers.js
    const domainSeparator = this.hashStruct('EIP712Domain', domain, {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
    });

    const primaryType = Object.keys(types).find((t) => t !== 'EIP712Domain');
    if (!primaryType) {
      throw new Error('No primary type found');
    }

    const structHash = this.hashStruct(primaryType, value, types);

    const messageHash = keccak_256(
      new Uint8Array([0x19, 0x01, ...domainSeparator, ...structHash])
    );

    const { r, s, v } = this.signHash(messageHash);
    return `${r}${s.slice(2)}${v.toString(16).padStart(2, '0')}`;
  }

  private hashStruct(
    typeName: string,
    data: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>
  ): Uint8Array {
    const typeHash = keccak_256(
      new TextEncoder().encode(this.encodeType(typeName, types))
    );
    const encodedData = this.encodeData(typeName, data, types);
    return keccak_256(new Uint8Array([...typeHash, ...encodedData]));
  }

  private encodeType(
    primaryType: string,
    types: Record<string, Array<{ name: string; type: string }>>
  ): string {
    const fields = types[primaryType];
    if (!fields) {
      return primaryType;
    }

    const fieldDefs = fields.map((f) => `${f.type} ${f.name}`).join(',');
    return `${primaryType}(${fieldDefs})`;
  }

  private encodeData(
    typeName: string,
    data: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>
  ): Uint8Array {
    const fields = types[typeName];
    if (!fields) {
      throw new Error(`Unknown type: ${typeName}`);
    }

    const parts: Uint8Array[] = [];

    for (const field of fields) {
      const value = data[field.name];
      parts.push(this.encodeValue(field.type, value, types));
    }

    return new Uint8Array(parts.flatMap((p) => [...p]));
  }

  private encodeValue(
    type: string,
    value: unknown,
    types: Record<string, Array<{ name: string; type: string }>>
  ): Uint8Array {
    if (type === 'string') {
      return keccak_256(new TextEncoder().encode(value as string));
    }

    if (type === 'bytes') {
      const bytes = Buffer.from((value as string).replace(/^0x/, ''), 'hex');
      return keccak_256(bytes);
    }

    if (type === 'address') {
      const addr = (value as string).replace(/^0x/, '').toLowerCase();
      const padded = new Uint8Array(32);
      const addrBytes = Buffer.from(addr, 'hex');
      padded.set(addrBytes, 32 - addrBytes.length);
      return padded;
    }

    if (type.startsWith('uint') || type.startsWith('int')) {
      const num = BigInt(value as string | number | bigint);
      const bytes = new Uint8Array(32);
      let val = num;
      for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(val & BigInt(0xff));
        val = val >> BigInt(8);
      }
      return bytes;
    }

    if (type === 'bool') {
      const bytes = new Uint8Array(32);
      bytes[31] = value ? 1 : 0;
      return bytes;
    }

    if (types[type]) {
      return this.hashStruct(type, value as Record<string, unknown>, types);
    }

    throw new Error(`Unsupported type: ${type}`);
  }

  /**
   * Signs an EVM transaction and returns the signed raw transaction
   */
  signTransaction(tx: EvmTransaction): string {
    // Encode transaction for signing (RLP encoding)
    const encodedTx = this.rlpEncodeTransaction(tx);
    const hash = keccak_256(encodedTx);

    const signature = this.signHash(hash);

    // Calculate v with EIP-155 chain ID
    const v = tx.chainId * 2 + 35 + (signature.v - 27);

    // Encode signed transaction
    return this.rlpEncodeSignedTransaction(tx, {
      r: signature.r,
      s: signature.s,
      v,
    });
  }

  private rlpEncodeTransaction(tx: EvmTransaction): Uint8Array {
    // Simplified RLP encoding for EIP-155 transactions
    // Format: [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
    const items: (Uint8Array | string | number | bigint | null)[] = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to || '',
      tx.value,
      tx.data,
      tx.chainId,
      0,
      0,
    ];

    return this.rlpEncode(items);
  }

  private rlpEncodeSignedTransaction(
    tx: EvmTransaction,
    sig: { r: string; s: string; v: number }
  ): string {
    const items: (Uint8Array | string | number | bigint | null)[] = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to || '',
      tx.value,
      tx.data,
      sig.v,
      sig.r,
      sig.s,
    ];

    const encoded = this.rlpEncode(items);
    return '0x' + Buffer.from(encoded).toString('hex');
  }

  private rlpEncode(
    input: (Uint8Array | string | number | bigint | null)[] | Uint8Array | string | number | bigint | null
  ): Uint8Array {
    if (Array.isArray(input)) {
      const encodedItems = input.map((item) => this.rlpEncode(item));
      const totalLength = encodedItems.reduce((sum, item) => sum + item.length, 0);
      const flatItems = encodedItems.flatMap((item) => Array.from(item));

      if (totalLength < 56) {
        return new Uint8Array([0xc0 + totalLength, ...flatItems]);
      } else {
        const lengthBytes = this.encodeBigEndian(totalLength);
        return new Uint8Array([
          0xf7 + lengthBytes.length,
          ...Array.from(lengthBytes),
          ...flatItems,
        ]);
      }
    }

    const bytes = this.toBytes(input);

    if (bytes.length === 1 && bytes[0] < 0x80) {
      return bytes;
    }

    if (bytes.length < 56) {
      return new Uint8Array([0x80 + bytes.length, ...Array.from(bytes)]);
    }

    const lengthBytes = this.encodeBigEndian(bytes.length);
    return new Uint8Array([0xb7 + lengthBytes.length, ...Array.from(lengthBytes), ...Array.from(bytes)]);
  }

  private toBytes(
    input: Uint8Array | string | number | bigint | null
  ): Uint8Array {
    if (input === null || input === '' || input === 0 || input === BigInt(0)) {
      return new Uint8Array(0);
    }

    if (input instanceof Uint8Array) {
      return input;
    }

    if (typeof input === 'string') {
      if (input.startsWith('0x')) {
        const hex = input.slice(2);
        if (hex.length === 0) {
          return new Uint8Array(0);
        }
        return Buffer.from(hex.padStart(hex.length + (hex.length % 2), '0'), 'hex');
      }
      return new TextEncoder().encode(input);
    }

    if (typeof input === 'number' || typeof input === 'bigint') {
      return this.encodeBigEndian(input);
    }

    throw new Error(`Cannot encode: ${input}`);
  }

  private encodeBigEndian(value: number | bigint): Uint8Array {
    if (value === 0 || value === BigInt(0)) {
      return new Uint8Array(0);
    }

    const bytes: number[] = [];
    let v = BigInt(value);

    while (v > 0) {
      bytes.unshift(Number(v & BigInt(0xff)));
      v = v >> BigInt(8);
    }

    return new Uint8Array(bytes);
  }
}

/**
 * Stellar Transaction Signer
 * Signs transactions using Ed25519 (Stellar-compatible)
 */
export class StellarSigner {
  private keypair: Keypair;
  public readonly publicKey: string;

  constructor(keyPair: KeyPair) {
    this.keypair = Keypair.fromSecret(keyPair.stellarSecretKey);
    this.publicKey = this.keypair.publicKey();
  }

  /**
   * Signs a Stellar transaction
   */
  signTransaction(
    transaction: Transaction,
    _networkPassphrase?: string
  ): Transaction {
    transaction.sign(this.keypair);
    return transaction;
  }

  /**
   * Signs arbitrary data
   */
  signData(data: Uint8Array): Uint8Array {
    return this.keypair.sign(Buffer.from(data));
  }

  /**
   * Verifies a signature
   */
  verifySignature(data: Uint8Array, signature: Uint8Array): boolean {
    return this.keypair.verify(Buffer.from(data), Buffer.from(signature));
  }

  /**
   * Signs a Soroban authorization entry
   */
  signAuthEntry(
    entry: xdr.SorobanAuthorizationEntry,
    networkPassphrase: string,
    validUntilLedger: number
  ): xdr.SorobanAuthorizationEntry {
    // Clone the entry to avoid mutation
    const signedEntry = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());

    // Get the credentials
    const credentials = signedEntry.credentials();

    if (credentials.switch().value === 0) {
      // Source account credentials - no signature needed
      return signedEntry;
    }

    // Address credentials - need to sign
    const addressCredentials = credentials.address();

    // Create the preimage for signing
    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: Buffer.from(sha256(new TextEncoder().encode(networkPassphrase))),
        nonce: addressCredentials.nonce(),
        signatureExpirationLedger: validUntilLedger,
        invocation: signedEntry.rootInvocation(),
      })
    );

    const preimageHash = sha256(preimage.toXDR());
    const signature = this.keypair.sign(Buffer.from(preimageHash));

    // Set the signature
    const newCredentials = new xdr.SorobanAddressCredentials({
      address: addressCredentials.address(),
      nonce: addressCredentials.nonce(),
      signatureExpirationLedger: validUntilLedger,
      signature: xdr.ScVal.scvVec([
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('public_key'),
            val: xdr.ScVal.scvBytes(this.keypair.rawPublicKey()),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('signature'),
            val: xdr.ScVal.scvBytes(signature),
          }),
        ]),
      ]),
    });

    signedEntry.credentials(xdr.SorobanCredentials.sorobanCredentialsAddress(newCredentials));

    return signedEntry;
  }
}

/**
 * Combined TVA Signer that handles both EVM and Stellar signing
 */
export class TVASigner {
  public readonly evmSigner: EvmSigner;
  public readonly stellarSigner: StellarSigner;
  public readonly keyPair: KeyPair;
  public readonly network: NetworkConfig;

  constructor(keyPair: KeyPair, network: NetworkType = 'testnet') {
    this.keyPair = keyPair;
    this.network = NETWORKS[network];
    this.evmSigner = new EvmSigner(keyPair);
    this.stellarSigner = new StellarSigner(keyPair);
  }

  get evmAddress(): EvmAddress {
    return this.evmSigner.address;
  }

  get stellarAddress(): string {
    return this.stellarSigner.publicKey;
  }

  /**
   * Signs an EVM-format transaction
   */
  signEvmTransaction(tx: EvmTransaction): string {
    return this.evmSigner.signTransaction(tx);
  }

  /**
   * Signs a Stellar transaction
   */
  signStellarTransaction(transaction: Transaction): Transaction {
    return this.stellarSigner.signTransaction(
      transaction,
      this.network.networkPassphrase
    );
  }

  /**
   * Signs a personal message (for wallet connect / dapp signatures)
   */
  signMessage(message: string): string {
    return this.evmSigner.signMessage(message);
  }
}
