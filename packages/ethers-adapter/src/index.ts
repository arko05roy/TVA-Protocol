/**
 * TVA Protocol ethers.js Adapter
 *
 * Provides ethers.js v6 compatibility for TVA Protocol,
 * enabling familiar Ethereum development patterns with Stellar/Soroban.
 *
 * @packageDocumentation
 */

// Provider
export {
  TVAProvider,
  TVA_NETWORK,
  createTVAProvider,
  getDefaultProvider,
  type TVAProviderOptions,
} from './provider.js';

// Signer
export {
  TVASigner,
  createTVASigner,
  createDualKeySigner,
  type TVASignerOptions,
} from './signer.js';

// Re-export useful ethers types for convenience
export {
  Contract,
  ContractFactory,
  Interface,
  formatEther,
  parseEther,
  formatUnits,
  parseUnits,
  isAddress,
  getAddress,
  keccak256,
  toUtf8Bytes,
  hexlify,
  type TransactionRequest,
  type TransactionResponse,
  type TransactionReceipt,
  type Block,
  type Log,
  type Filter,
} from 'ethers';
