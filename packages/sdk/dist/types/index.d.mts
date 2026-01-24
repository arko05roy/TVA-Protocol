/**
 * TVA Protocol Type Definitions
 *
 * These types define the core abstractions for the TVA Protocol,
 * bridging EVM and Stellar/Soroban concepts.
 */
type NetworkType = 'testnet' | 'mainnet' | 'local';
interface NetworkConfig {
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
/**
 * TVA Chain ID: "TVA\0" = 0x54564100 = 1414676736
 */
declare const TVA_CHAIN_ID = 1414676736;
declare const NETWORKS: Record<NetworkType, NetworkConfig>;
/** 20-byte EVM-compatible address (hex string with 0x prefix) */
type EvmAddress = `0x${string}`;
/** 56-character Stellar G-address (Ed25519 public key) */
type StellarAddress = `G${string}`;
/** Soroban contract ID (C-address, 56 characters) */
type SorobanContractId = `C${string}`;
/** Generic address that could be EVM or Stellar format */
type Address = EvmAddress | StellarAddress | SorobanContractId;
/** Mapping between EVM and Stellar addresses */
interface AddressMapping {
    evmAddress: EvmAddress;
    stellarAddress: StellarAddress;
    registeredAt: number;
}
interface EvmTransaction {
    from: EvmAddress;
    to?: EvmAddress;
    value: bigint;
    data: string;
    nonce: number;
    gasLimit: bigint;
    gasPrice: bigint;
    chainId: number;
}
interface EvmTransactionReceipt {
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
interface EvmLog {
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
interface EvmBlock {
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
interface CompilerInput {
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
interface CompilerOutput {
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
interface ContractABI {
    /** Contract name */
    name: string;
    /** ABI entries */
    functions: ABIFunction[];
    events: ABIEvent[];
    errors: ABIError[];
}
interface ABIFunction {
    name: string;
    inputs: ABIParameter[];
    outputs: ABIParameter[];
    stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
    type: 'function' | 'constructor' | 'fallback' | 'receive';
}
interface ABIEvent {
    name: string;
    inputs: ABIEventParameter[];
    anonymous: boolean;
}
interface ABIParameter {
    name: string;
    type: string;
    internalType?: string;
    components?: ABIParameter[];
}
interface ABIEventParameter extends ABIParameter {
    indexed: boolean;
}
interface ABIError {
    name: string;
    inputs: ABIParameter[];
}
interface SorobanSpec {
    type: 'function' | 'struct' | 'union' | 'enum' | 'error';
    name: string;
    doc?: string;
    inputs?: {
        name: string;
        type: ScValType;
    }[];
    outputs?: ScValType[];
}
type ScValType = 'bool' | 'void' | 'error' | 'u32' | 'i32' | 'u64' | 'i64' | 'timepoint' | 'duration' | 'u128' | 'i128' | 'u256' | 'i256' | 'bytes' | 'string' | 'symbol' | 'address' | {
    vec: ScValType;
} | {
    map: {
        key: ScValType;
        value: ScValType;
    };
} | {
    option: ScValType;
} | {
    result: {
        ok: ScValType;
        err: ScValType;
    };
} | {
    tuple: ScValType[];
} | {
    bytesN: number;
} | {
    struct: string;
} | {
    union: string;
} | {
    enum: string;
};
type StorageType = 'temporary' | 'instance' | 'persistent';
interface StorageEntry {
    key: string;
    value: unknown;
    type: StorageType;
    ttl: number;
}
interface DeploymentConfig {
    /** Compiled WASM binary (base64) */
    wasm: string;
    /** Constructor arguments */
    constructorArgs?: unknown[];
    /** Initial salt for address derivation */
    salt?: string;
    /** Network to deploy to */
    network: NetworkType;
}
interface DeploymentResult {
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
interface ContractCallConfig {
    /** Contract address (EVM or Soroban format) */
    contractAddress: Address;
    /** Function name to call */
    functionName: string;
    /** Function arguments */
    args?: unknown[];
    /** Caller address */
    from?: Address;
}
interface ContractCallResult<T = unknown> {
    /** Return value from the contract */
    result: T;
    /** Gas/resource consumption */
    gasUsed: bigint;
    /** Events emitted during call */
    events: EvmLog[];
    /** Whether the call was a simulation (view) or on-chain */
    simulated: boolean;
}
interface KeyPair {
    /** secp256k1 private key for EVM signing */
    evmPrivateKey: string;
    /** secp256k1 public key (uncompressed, 65 bytes) */
    evmPublicKey: string;
    /** Ed25519 secret key for Stellar signing */
    stellarSecretKey: string;
    /** Ed25519 public key for Stellar */
    stellarPublicKey: string;
}
interface Account {
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
interface Balance {
    /** Native XLM balance (in stroops, 1 XLM = 10^7 stroops) */
    xlm: bigint;
    /** Native XLM balance formatted (7 decimals) */
    xlmFormatted: string;
    /** Token balances keyed by contract address */
    tokens: Map<Address, TokenBalance>;
}
interface TokenBalance {
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
declare class TVAError extends Error {
    code: TVAErrorCode;
    details?: Record<string, unknown> | undefined;
    constructor(message: string, code: TVAErrorCode, details?: Record<string, unknown> | undefined);
}
declare enum TVAErrorCode {
    COMPILATION_FAILED = 1001,
    SOLANG_NOT_FOUND = 1002,
    INVALID_SOURCE = 1003,
    NETWORK_ERROR = 2001,
    RPC_ERROR = 2002,
    TIMEOUT = 2003,
    TRANSACTION_FAILED = 3001,
    INSUFFICIENT_BALANCE = 3002,
    INVALID_NONCE = 3003,
    GAS_ESTIMATION_FAILED = 3004,
    CONTRACT_NOT_FOUND = 4001,
    CONTRACT_REVERT = 4002,
    INVALID_ARGUMENTS = 4003,
    ACCOUNT_NOT_FOUND = 5001,
    ACCOUNT_NOT_REGISTERED = 5002,
    INVALID_SIGNATURE = 5003,
    STATE_ARCHIVED = 6001,
    TTL_EXPIRED = 6002,
    RESTORATION_FAILED = 6003
}

export { type ABIError, type ABIEvent, type ABIEventParameter, type ABIFunction, type ABIParameter, type Account, type Address, type AddressMapping, type Balance, type CompilerInput, type CompilerOutput, type ContractABI, type ContractCallConfig, type ContractCallResult, type DeploymentConfig, type DeploymentResult, type EvmAddress, type EvmBlock, type EvmLog, type EvmTransaction, type EvmTransactionReceipt, type KeyPair, NETWORKS, type NetworkConfig, type NetworkType, type ScValType, type SorobanContractId, type SorobanSpec, type StellarAddress, type StorageEntry, type StorageType, TVAError, TVAErrorCode, TVA_CHAIN_ID, type TokenBalance };
