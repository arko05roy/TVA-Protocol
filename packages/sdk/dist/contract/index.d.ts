import { r as NetworkType, l as DeploymentResult, s as SorobanContractId, E as EvmAddress, i as ContractABI, c as ABIFunction, k as ContractCallResult } from '../index-CpingBUy.js';
import { T as TVASigner } from '../signer-BMBJBGt5.js';
import { CompiledContract } from '../compiler/index.js';
import '@stellar/stellar-sdk';

/**
 * TVA Protocol Contract Interaction
 *
 * Provides high-level APIs for deploying and interacting with
 * Solidity contracts compiled to Soroban WASM.
 */

/**
 * Converts an EVM address to a Soroban contract ID format
 * This is deterministic based on the deployment parameters
 */
declare function evmAddressToContractId(evmAddress: EvmAddress): SorobanContractId;
/**
 * Converts a Soroban contract ID to an EVM address format
 */
declare function contractIdToEvmAddress(contractId: SorobanContractId): EvmAddress;
/**
 * Calculates the EVM function selector (first 4 bytes of keccak256 hash)
 */
declare function getFunctionSelector(signature: string): string;
/**
 * Gets the function signature from ABI
 */
declare function getFunctionSignature(func: ABIFunction): string;
/**
 * Encodes function call data in EVM ABI format
 */
declare function encodeFunctionCall(func: ABIFunction, args: unknown[]): string;
/**
 * TVA Contract instance for interacting with deployed contracts
 */
declare class TVAContract {
    readonly contractId: SorobanContractId;
    readonly evmAddress: EvmAddress;
    readonly abi: ContractABI;
    private readonly network;
    private readonly sorobanClient;
    constructor(contractId: SorobanContractId, abi: ContractABI, network?: NetworkType);
    /**
     * Gets a function from the ABI by name
     */
    getFunction(name: string): ABIFunction | undefined;
    /**
     * Simulates a contract call (read-only, doesn't submit transaction)
     */
    call<T = unknown>(functionName: string, args?: unknown[], signer?: TVASigner): Promise<ContractCallResult<T>>;
    /**
     * Sends a transaction to the contract (state-changing)
     */
    send(functionName: string, args: unknown[] | undefined, signer: TVASigner): Promise<ContractCallResult<unknown>>;
    /**
     * Creates a typed contract interface with methods matching the ABI
     */
    connect(signer: TVASigner): TypedContract;
}
/**
 * Typed contract wrapper that provides method-based access
 */
declare class TypedContract {
    private contract;
    private signer;
    constructor(contract: TVAContract, signer: TVASigner);
    /**
     * Gets the underlying contract instance
     */
    getContract(): TVAContract;
}
/**
 * Contract deployer for deploying new contracts
 */
declare class ContractDeployer {
    private network;
    private sorobanClient;
    constructor(network?: NetworkType);
    /**
     * Deploys a compiled contract to the network
     */
    deploy(contract: CompiledContract, signer: TVASigner, constructorArgs?: unknown[]): Promise<DeploymentResult>;
    /**
     * Uploads WASM to the network
     */
    private uploadWasm;
    /**
     * Creates a contract instance from uploaded WASM
     */
    private createInstance;
    /**
     * Gets the current ledger sequence number
     */
    private getCurrentLedgerSequence;
}

export { ContractDeployer, TVAContract, TypedContract, contractIdToEvmAddress, encodeFunctionCall, evmAddressToContractId, getFunctionSelector, getFunctionSignature };
