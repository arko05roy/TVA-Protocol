/**
 * TVA Protocol Key Management
 *
 * Handles the dual-key architecture required for TVA Protocol:
 * - secp256k1 keys for EVM compatibility (MetaMask signing)
 * - Ed25519 keys for Stellar transaction submission
 *
 * Keys are derived deterministically so users can recover both
 * key types from a single mnemonic phrase.
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import * as secp256k1 from '@noble/secp256k1';
import * as ed25519 from '@noble/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import type { KeyPair, EvmAddress, StellarAddress } from '../types/index.js';

// Enable synchronous methods for ed25519 (required for node.js)
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/**
 * Derives a secp256k1 key from seed using BIP32 derivation
 */
function deriveSecp256k1KeyFromSeed(
  seed: Uint8Array,
  path: string
): Uint8Array {
  // Master key derivation for Bitcoin-style keys
  const I = hmac(sha512, new TextEncoder().encode('Bitcoin seed'), seed);
  let key = new Uint8Array(I.slice(0, 32));
  let chainCode = new Uint8Array(I.slice(32));

  // Parse path
  const segments = path
    .replace(/^m\//, '')
    .split('/')
    .map((s) => {
      const hardened = s.endsWith("'");
      const index = parseInt(s.replace("'", ''), 10);
      return { index, hardened };
    });

  for (const segment of segments) {
    const indexBuffer = new Uint8Array(4);
    const view = new DataView(indexBuffer.buffer);

    let data: Uint8Array;
    if (segment.hardened) {
      const hardenedIndex = segment.index | 0x80000000;
      view.setUint32(0, hardenedIndex, false);
      data = new Uint8Array(1 + 32 + 4);
      data[0] = 0x00;
      data.set(key, 1);
      data.set(indexBuffer, 33);
    } else {
      view.setUint32(0, segment.index, false);
      const publicKey = secp256k1.getPublicKey(key, true);
      data = new Uint8Array(33 + 4);
      data.set(publicKey, 0);
      data.set(indexBuffer, 33);
    }

    const I2 = hmac(sha512, chainCode, data);
    const IL = new Uint8Array(I2.slice(0, 32));
    chainCode = new Uint8Array(I2.slice(32));

    // Child key = parse256(IL) + parent key (mod n)
    const parentKeyBigInt = bytesToBigInt(key);
    const ILBigInt = bytesToBigInt(IL);
    const n = BigInt(
      '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'
    );
    const childKeyBigInt = (ILBigInt + parentKeyBigInt) % n;
    key = bigIntToBytes(childKeyBigInt, 32);
  }

  return key;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  return result;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(v & BigInt(0xff));
    v = v >> BigInt(8);
  }
  return result;
}

/**
 * Converts a secp256k1 public key to an EVM address
 */
export function publicKeyToEvmAddress(publicKey: Uint8Array): EvmAddress {
  // Remove the 0x04 prefix if present (uncompressed key marker)
  const keyWithoutPrefix =
    publicKey.length === 65 ? publicKey.slice(1) : publicKey;

  // Keccak256 hash of the public key (x,y coordinates)
  const hash = keccak_256(keyWithoutPrefix);

  // Take the last 20 bytes
  const addressBytes = new Uint8Array(hash.slice(-20));

  // Convert to hex string with 0x prefix
  const hex = Array.from(addressBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `0x${hex}` as EvmAddress;
}

/**
 * Converts an Ed25519 public key to a Stellar G-address
 */
export function publicKeyToStellarAddress(
  publicKey: Uint8Array
): StellarAddress {
  return StrKey.encodeEd25519PublicKey(Buffer.from(publicKey)) as StellarAddress;
}

/**
 * Converts an Ed25519 secret key to a Stellar S-address (secret)
 */
export function secretKeyToStellarSecret(secretKey: Uint8Array): string {
  return StrKey.encodeEd25519SecretSeed(Buffer.from(secretKey));
}

/**
 * Generates a new mnemonic phrase
 */
export function generateMnemonic(strength: 128 | 256 = 256): string {
  return bip39.generateMnemonic(strength);
}

/**
 * Validates a mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derives a full TVA key pair from a mnemonic phrase
 * This creates both the EVM (secp256k1) and Stellar (Ed25519) key pairs
 */
export async function deriveKeyPairFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0
): Promise<KeyPair> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Generate seed from mnemonic
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const seedArray = new Uint8Array(seed);

  // Derive secp256k1 key for EVM
  const evmPath = `m/44'/60'/0'/0/${accountIndex}`;
  const evmPrivateKey = deriveSecp256k1KeyFromSeed(seedArray, evmPath);
  const evmPublicKey = secp256k1.getPublicKey(evmPrivateKey, false); // uncompressed

  // Derive Ed25519 key for Stellar
  // Use a deterministic derivation from the EVM private key to ensure
  // users can always recover their Stellar key from their EVM key
  const stellarSeed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode('TVA-STELLAR-KEY'),
      ...evmPrivateKey,
    ])
  );
  const stellarKeypair = Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));

  return {
    evmPrivateKey: `0x${Buffer.from(evmPrivateKey).toString('hex')}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString('hex')}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey(),
  };
}

/**
 * Derives a key pair from an existing EVM private key
 * Useful for importing existing Ethereum wallets
 */
export function deriveKeyPairFromEvmPrivateKey(
  evmPrivateKey: string
): KeyPair {
  // Remove 0x prefix if present
  const privateKeyHex = evmPrivateKey.replace(/^0x/, '');
  const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');

  if (privateKeyBytes.length !== 32) {
    throw new Error('Invalid private key length');
  }

  // Get EVM public key
  const evmPublicKey = secp256k1.getPublicKey(privateKeyBytes, false);

  // Derive Stellar key deterministically from EVM private key
  const stellarSeed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode('TVA-STELLAR-KEY'),
      ...privateKeyBytes,
    ])
  );
  const stellarKeypair = Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));

  return {
    evmPrivateKey: `0x${privateKeyHex}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString('hex')}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey(),
  };
}

/**
 * Creates a random key pair (for testing or new accounts)
 */
export function generateRandomKeyPair(): KeyPair {
  const mnemonic = generateMnemonic();
  // Use synchronous version for random generation
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const seedArray = new Uint8Array(seed);

  const evmPath = `m/44'/60'/0'/0/0`;
  const evmPrivateKey = deriveSecp256k1KeyFromSeed(seedArray, evmPath);
  const evmPublicKey = secp256k1.getPublicKey(evmPrivateKey, false);

  const stellarSeed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode('TVA-STELLAR-KEY'),
      ...evmPrivateKey,
    ])
  );
  const stellarKeypair = Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));

  return {
    evmPrivateKey: `0x${Buffer.from(evmPrivateKey).toString('hex')}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString('hex')}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey(),
  };
}

/**
 * Gets the EVM address from a key pair
 */
export function getEvmAddress(keyPair: KeyPair): EvmAddress {
  const publicKeyBytes = Buffer.from(keyPair.evmPublicKey.replace(/^0x/, ''), 'hex');
  return publicKeyToEvmAddress(publicKeyBytes);
}

/**
 * Gets the Stellar address from a key pair
 */
export function getStellarAddress(keyPair: KeyPair): StellarAddress {
  return keyPair.stellarPublicKey as StellarAddress;
}

/**
 * Verifies that an EVM address matches a public key
 */
export function verifyEvmAddress(
  address: EvmAddress,
  publicKey: string
): boolean {
  const publicKeyBytes = Buffer.from(publicKey.replace(/^0x/, ''), 'hex');
  const derivedAddress = publicKeyToEvmAddress(publicKeyBytes);
  return derivedAddress.toLowerCase() === address.toLowerCase();
}

/**
 * Verifies that a Stellar address matches a public key
 */
export function verifyStellarAddress(
  address: StellarAddress,
  publicKey: string
): boolean {
  return address === publicKey;
}
