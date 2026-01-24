import { K as KeyPair, E as EvmAddress, u as StellarAddress } from '../index-CpingBUy.mjs';
export { E as EvmSigner, S as StellarSigner, T as TVASigner } from '../signer-Qkg9ZtFR.mjs';
import '@stellar/stellar-sdk';

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

/**
 * Converts a secp256k1 public key to an EVM address
 */
declare function publicKeyToEvmAddress(publicKey: Uint8Array): EvmAddress;
/**
 * Converts an Ed25519 public key to a Stellar G-address
 */
declare function publicKeyToStellarAddress(publicKey: Uint8Array): StellarAddress;
/**
 * Generates a new mnemonic phrase
 */
declare function generateMnemonic(strength?: 128 | 256): string;
/**
 * Validates a mnemonic phrase
 */
declare function validateMnemonic(mnemonic: string): boolean;
/**
 * Derives a full TVA key pair from a mnemonic phrase
 * This creates both the EVM (secp256k1) and Stellar (Ed25519) key pairs
 */
declare function deriveKeyPairFromMnemonic(mnemonic: string, accountIndex?: number): Promise<KeyPair>;
/**
 * Derives a key pair from an existing EVM private key
 * Useful for importing existing Ethereum wallets
 */
declare function deriveKeyPairFromEvmPrivateKey(evmPrivateKey: string): KeyPair;
/**
 * Creates a random key pair (for testing or new accounts)
 */
declare function generateRandomKeyPair(): KeyPair;
/**
 * Gets the EVM address from a key pair
 */
declare function getEvmAddress(keyPair: KeyPair): EvmAddress;
/**
 * Gets the Stellar address from a key pair
 */
declare function getStellarAddress(keyPair: KeyPair): StellarAddress;
/**
 * Verifies that an EVM address matches a public key
 */
declare function verifyEvmAddress(address: EvmAddress, publicKey: string): boolean;
/**
 * Verifies that a Stellar address matches a public key
 */
declare function verifyStellarAddress(address: StellarAddress, publicKey: string): boolean;

export { deriveKeyPairFromEvmPrivateKey, deriveKeyPairFromMnemonic, generateMnemonic, generateRandomKeyPair, getEvmAddress, getStellarAddress, publicKeyToEvmAddress, publicKeyToStellarAddress, validateMnemonic, verifyEvmAddress, verifyStellarAddress };
