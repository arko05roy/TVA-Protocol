/**
 * TVA Protocol Wallet Adapter
 *
 * Enables EVM wallets (MetaMask, WalletConnect) to work with TVA Protocol
 * by handling the dual-key architecture (EVM secp256k1 + Stellar Ed25519).
 *
 * @packageDocumentation
 */

// Key derivation utilities
export * from './keys/index.js';

// Wallet adapters
export * from './adapter/index.js';

// Re-export commonly used types
export type {
  EvmAddress,
  StellarAddress,
  NetworkType,
} from '@tva-protocol/sdk';
