/**
 * TVA Protocol SDK
 *
 * TypeScript SDK for interacting with TVA Protocol - an EVM compatibility
 * layer on Stellar that enables Solidity smart contracts to run on Soroban.
 *
 * @packageDocumentation
 */

// Types
export * from './types/index.js';

// RPC Client (JSON-RPC communication)
export * from './rpc/index.js';

// Wallet (Key management and signing)
export * from './wallet/index.js';

// Compiler (Solang wrapper)
export * from './compiler/index.js';

// Contract (Deployment and interaction)
export * from './contract/index.js';

// Utilities
export * from './utils/index.js';

// Re-export commonly used types at top level for convenience
export type {
  NetworkType,
  NetworkConfig,
  EvmAddress,
  StellarAddress,
  SorobanContractId,
  KeyPair,
  Account,
  Balance,
  ContractABI,
  CompilerOutput,
  DeploymentResult,
} from './types/index.js';
