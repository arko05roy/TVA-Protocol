/**
 * TVA Wallet Key Derivation
 *
 * Handles deterministic derivation of Stellar Ed25519 keys from
 * EVM secp256k1 keys. This allows users to control both their
 * EVM and Stellar identities from a single wallet (MetaMask).
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import type { StellarAddress, EvmAddress } from '@tva-protocol/sdk';

/**
 * Domain separator for TVA key derivation
 * This ensures our derived keys don't collide with other protocols
 */
const TVA_KEY_DERIVATION_DOMAIN = 'TVA-STELLAR-KEY-DERIVATION-V1';

/**
 * Derives a Stellar keypair from an EVM private key or signature
 *
 * There are two modes:
 * 1. Direct derivation from private key (for server-side/testing)
 * 2. Signature-based derivation (for browser with MetaMask)
 */
export function deriveStellarKeypairFromEvmKey(
  evmPrivateKey: string
): Keypair {
  const privateKeyBytes = Buffer.from(
    evmPrivateKey.replace(/^0x/, ''),
    'hex'
  );

  // Create deterministic seed by hashing the private key with our domain
  const seed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode(TVA_KEY_DERIVATION_DOMAIN),
      ...privateKeyBytes,
    ])
  );

  return Keypair.fromRawEd25519Seed(Buffer.from(seed));
}

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
export function deriveStellarKeypairFromSignature(
  signature: string
): Keypair {
  const signatureBytes = Buffer.from(signature.replace(/^0x/, ''), 'hex');

  // Hash the signature to create a 32-byte seed
  const seed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode(TVA_KEY_DERIVATION_DOMAIN),
      ...signatureBytes,
    ])
  );

  return Keypair.fromRawEd25519Seed(Buffer.from(seed));
}

/**
 * Gets the deterministic message that should be signed for key derivation
 *
 * @param evmAddress - The user's EVM address
 * @param nonce - Optional nonce for key rotation (default 0)
 */
export function getKeyDerivationMessage(
  evmAddress: EvmAddress,
  nonce: number = 0
): string {
  return [
    'TVA Protocol Key Derivation',
    '',
    'This signature will be used to derive your Stellar keypair.',
    'This allows you to use your Ethereum wallet with Stellar/Soroban.',
    '',
    'EVM Address: ' + evmAddress,
    'Nonce: ' + nonce,
    '',
    'WARNING: Only sign this message on trusted TVA Protocol applications.',
    'This signature can derive your Stellar private key.',
  ].join('\n');
}

/**
 * Gets the EIP-712 typed data for key derivation
 * This is more secure and shows clear intent in MetaMask
 */
export function getKeyDerivationTypedData(
  evmAddress: EvmAddress,
  chainId: number,
  nonce: number = 0
) {
  return {
    domain: {
      name: 'TVA Protocol',
      version: '1',
      chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000', // No contract
    },
    types: {
      KeyDerivation: [
        { name: 'evmAddress', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'purpose', type: 'string' },
      ],
    },
    primaryType: 'KeyDerivation' as const,
    message: {
      evmAddress,
      nonce,
      purpose: 'Derive Stellar keypair for TVA Protocol',
    },
  };
}

/**
 * Converts an EVM address to a pseudo-Stellar address for display
 * This is NOT a real Stellar address - just for UI consistency
 */
export function evmAddressToDisplayAddress(evmAddress: EvmAddress): string {
  // Format EVM address as a TVA display address
  return `TVA:${evmAddress.slice(2, 10).toUpperCase()}...${evmAddress.slice(-8).toUpperCase()}`;
}

/**
 * Validates that a Stellar address was derived from an EVM address
 * by checking the derivation path
 */
export async function validateDerivedAddress(
  evmAddress: EvmAddress,
  stellarAddress: StellarAddress,
  signFunction: (message: string) => Promise<string>
): Promise<boolean> {
  // Sign the derivation message
  const message = getKeyDerivationMessage(evmAddress);
  const signature = await signFunction(message);

  // Derive the expected Stellar keypair
  const derivedKeypair = deriveStellarKeypairFromSignature(signature);

  // Compare addresses
  return derivedKeypair.publicKey() === stellarAddress;
}

/**
 * Gets the raw Ed25519 public key bytes from a Stellar address
 */
export function stellarAddressToPublicKeyBytes(
  address: StellarAddress
): Uint8Array {
  return StrKey.decodeEd25519PublicKey(address);
}

/**
 * Creates a Stellar address from Ed25519 public key bytes
 */
export function publicKeyBytesToStellarAddress(
  publicKey: Uint8Array
): StellarAddress {
  return StrKey.encodeEd25519PublicKey(Buffer.from(publicKey)) as StellarAddress;
}

/**
 * Computes the EVM address from a public key
 */
export function computeEvmAddress(publicKey: Uint8Array): EvmAddress {
  // Remove 0x04 prefix if present (uncompressed key marker)
  const key = publicKey.length === 65 ? publicKey.slice(1) : publicKey;

  // Keccak256 hash and take last 20 bytes
  const hash = keccak_256(key);
  const addressBytes = hash.slice(-20);

  return `0x${Buffer.from(addressBytes).toString('hex')}` as EvmAddress;
}
