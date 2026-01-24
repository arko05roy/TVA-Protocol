/**
 * TVA Protocol Type Definitions
 *
 * These types define the core abstractions for the TVA Protocol,
 * bridging EVM and Stellar/Soroban concepts.
 */

// ============================================================================
// Network Configuration
// ============================================================================

export type NetworkType = 'testnet' | 'mainnet' | 'local';

export interface NetworkConfig {
  /** Network identifier */
  type: NetworkType;
  /** TVA RPC endpoint URL */
  rpcUrl: string;
  /** Stellar Horizon URL */
  horizonUrl: string;
  /** Stellar Soroban RPC URL */
  sorobanRpcUrl: string;
  /** Network passphrase for Stellar */
  networkPassphrase: string;
  /** Chain ID for EVM compatibility */
  chainId: number;
  /** Native currency symbol (XLM) */
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const NETWORKS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    type: 'testnet',
    rpcUrl: 'https://rpc.testnet.tva-protocol.io',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    chainId: 0x544541, // "TVA" in hex (test)
    nativeCurrency: {
      name: 'Stellar Lumens',
      symbol: 'XLM',
      decimals: 7,
    },
  },
  mainnet: {
    type: 'mainnet',
    rpcUrl: 'https://rpc.tva-protocol.io',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    chainId: 0x545641, // "TVA" in hex
    nativeCurrency: {
      name: 'Stellar Lumens',
      symbol: 'XLM',
      decimals: 7,
    },
  },
  local: {
    type: 'local',
    rpcUrl: 'http://localhost:8545',
    horizonUrl: 'http://localhost:8000',
    sorobanRpcUrl: 'http://localhost:8001',
    networkPassphrase: 'Standalone Network ; February 2017',
    chainId: 0x545600, // "TV" + 0x00
    nativeCurrency: {
      name: 'Stellar Lumens',
      symbol: 'XLM',
      decimals: 7,
    },
  },
};

// ============================================================================
// Address Types
// ============================================================================

/** 20-byte EVM-compatible address (hex string with 0x prefix) */
export type EvmAddress = `0x${string}`;

/** 56-character Stellar G-address (Ed25519 public key) */
export type StellarAddress = `G${string}`;

/** Soroban contract ID (C-address, 56 characters) */
export type SorobanContractId = `C${string}`;

/** Generic address that could be EVM or Stellar format */
export type Address = EvmAddress | StellarAddress | SorobanContractId;

/** Mapping between EVM and Stellar addresses */
export interface AddressMapping {
  evmAddress: EvmAddress;
  stellarAddress: StellarAddress;
  registeredAt: number; // ledger sequence
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface EvmTransaction {
  from: EvmAddress;
  to?: EvmAddress; // undefined for contract deployment
  value: bigint;
  data: string;
  nonce: number;
  gasLimit: bigint;
  gasPrice: bigint;
  chainId: number;
}

export interface EvmTransactionReceipt {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: EvmAddress;
  to: EvmAddress | null;
  contractAddress: EvmAddress | null;
  cumulativeGasUsed: bigint;
  gasUsed: bigint;
  status: 0 | 1;
  logs: EvmLog[];
}

export interface EvmLog {
  address: EvmAddress;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
}

export interface EvmBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  miner: EvmAddress;
  difficulty: bigint;
  totalDifficulty: bigint;
  gasLimit: bigint;
  gasUsed: bigint;
  transactions: string[];
  transactionsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  logsBloom: string;
  nonce: string;
  extraData: string;
}

// ============================================================================
// Compilation Types
// ============================================================================

export interface CompilerInput {
  /** Solidity source code */
  source: string;
  /** Contract file name */
  fileName: string;
  /** Compiler optimization settings */
  optimization?: {
    enabled: boolean;
    runs?: number;
  };
}

export interface CompilerOutput {
  /** Compiled WASM binary (base64 encoded) */
  wasm: string;
  /** Contract ABI in JSON format */
  abi: ContractABI;
  /** Soroban contract spec entries */
  spec: SorobanSpec[];
  /** Compilation warnings */
  warnings: string[];
  /** Source map for debugging */
  sourceMap?: string;
}

export interface ContractABI {
  /** Contract name */
  name: string;
  /** ABI entries */
  functions: ABIFunction[];
  events: ABIEvent[];
  errors: ABIError[];
}

export interface ABIFunction {
  name: string;
  inputs: ABIParameter[];
  outputs: ABIParameter[];
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
  type: 'function' | 'constructor' | 'fallback' | 'receive';
}

export interface ABIEvent {
  name: string;
  inputs: ABIEventParameter[];
  anonymous: boolean;
}

export interface ABIParameter {
  name: string;
  type: string;
  internalType?: string;
  components?: ABIParameter[];
}

export interface ABIEventParameter extends ABIParameter {
  indexed: boolean;
}

export interface ABIError {
  name: string;
  inputs: ABIParameter[];
}

export interface SorobanSpec {
  type: 'function' | 'struct' | 'union' | 'enum' | 'error';
  name: string;
  doc?: string;
  inputs?: { name: string; type: ScValType }[];
  outputs?: ScValType[];
}

// ============================================================================
// Soroban-Specific Types
// ============================================================================

export type ScValType =
  | 'bool'
  | 'void'
  | 'error'
  | 'u32'
  | 'i32'
  | 'u64'
  | 'i64'
  | 'timepoint'
  | 'duration'
  | 'u128'
  | 'i128'
  | 'u256'
  | 'i256'
  | 'bytes'
  | 'string'
  | 'symbol'
  | 'address'
  | { vec: ScValType }
  | { map: { key: ScValType; value: ScValType } }
  | { option: ScValType }
  | { result: { ok: ScValType; err: ScValType } }
  | { tuple: ScValType[] }
  | { bytesN: number }
  | { struct: string }
  | { union: string }
  | { enum: string };

export type StorageType = 'temporary' | 'instance' | 'persistent';

export interface StorageEntry {
  key: string;
  value: unknown;
  type: StorageType;
  ttl: number; // ledger sequence when entry expires
}

// ============================================================================
// Contract Interaction Types
// ============================================================================

export interface DeploymentConfig {
  /** Compiled WASM binary (base64) */
  wasm: string;
  /** Constructor arguments */
  constructorArgs?: unknown[];
  /** Initial salt for address derivation */
  salt?: string;
  /** Network to deploy to */
  network: NetworkType;
}

export interface DeploymentResult {
  /** Soroban contract ID */
  contractId: SorobanContractId;
  /** EVM-compatible contract address */
  evmAddress: EvmAddress;
  /** Deployment transaction hash (Stellar format) */
  stellarTxHash: string;
  /** Deployment transaction hash (EVM format) */
  evmTxHash: string;
  /** Ledger sequence of deployment */
  ledgerSequence: number;
}

export interface ContractCallConfig {
  /** Contract address (EVM or Soroban format) */
  contractAddress: Address;
  /** Function name to call */
  functionName: string;
  /** Function arguments */
  args?: unknown[];
  /** Caller address */
  from?: Address;
}

export interface ContractCallResult<T = unknown> {
  /** Return value from the contract */
  result: T;
  /** Gas/resource consumption */
  gasUsed: bigint;
  /** Events emitted during call */
  events: EvmLog[];
  /** Whether the call was a simulation (view) or on-chain */
  simulated: boolean;
}

// ============================================================================
// Wallet Types
// ============================================================================

export interface KeyPair {
  /** secp256k1 private key for EVM signing */
  evmPrivateKey: string;
  /** secp256k1 public key (uncompressed, 65 bytes) */
  evmPublicKey: string;
  /** Ed25519 secret key for Stellar signing */
  stellarSecretKey: string;
  /** Ed25519 public key for Stellar */
  stellarPublicKey: string;
}

export interface Account {
  /** EVM-format address */
  evmAddress: EvmAddress;
  /** Stellar G-address */
  stellarAddress: StellarAddress;
  /** Whether this account is registered in the AccountRegistry */
  isRegistered: boolean;
  /** Account sequence number (Stellar) */
  sequenceNumber?: string;
  /** Account nonce (EVM) */
  nonce?: number;
}

export interface Balance {
  /** Native XLM balance (in stroops, 1 XLM = 10^7 stroops) */
  xlm: bigint;
  /** Native XLM balance formatted (7 decimals) */
  xlmFormatted: string;
  /** Token balances keyed by contract address */
  tokens: Map<Address, TokenBalance>;
}

export interface TokenBalance {
  /** Token contract address */
  address: Address;
  /** Token symbol */
  symbol: string;
  /** Token decimals */
  decimals: number;
  /** Raw balance */
  balance: bigint;
  /** Formatted balance */
  balanceFormatted: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class TVAError extends Error {
  constructor(
    message: string,
    public code: TVAErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TVAError';
  }
}

export enum TVAErrorCode {
  // Compilation errors (1xxx)
  COMPILATION_FAILED = 1001,
  SOLANG_NOT_FOUND = 1002,
  INVALID_SOURCE = 1003,

  // Network errors (2xxx)
  NETWORK_ERROR = 2001,
  RPC_ERROR = 2002,
  TIMEOUT = 2003,

  // Transaction errors (3xxx)
  TRANSACTION_FAILED = 3001,
  INSUFFICIENT_BALANCE = 3002,
  INVALID_NONCE = 3003,
  GAS_ESTIMATION_FAILED = 3004,

  // Contract errors (4xxx)
  CONTRACT_NOT_FOUND = 4001,
  CONTRACT_REVERT = 4002,
  INVALID_ARGUMENTS = 4003,

  // Account errors (5xxx)
  ACCOUNT_NOT_FOUND = 5001,
  ACCOUNT_NOT_REGISTERED = 5002,
  INVALID_SIGNATURE = 5003,

  // Storage errors (6xxx)
  STATE_ARCHIVED = 6001,
  TTL_EXPIRED = 6002,
  RESTORATION_FAILED = 6003,
}
