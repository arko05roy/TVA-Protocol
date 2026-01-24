/**
 * TVA Protocol Contract Interaction
 *
 * Provides high-level APIs for deploying and interacting with
 * Solidity contracts compiled to Soroban WASM.
 */

import {
  Contract,
  TransactionBuilder,
  Operation,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
} from '@stellar/stellar-sdk';
import type {
  ContractABI,
  ABIFunction,
  EvmAddress,
  SorobanContractId,
  NetworkType,
  NetworkConfig,
  DeploymentResult,
  ContractCallResult,
  EvmLog,
} from '../types/index.js';
import { NETWORKS, TVAError, TVAErrorCode } from '../types/index.js';
import type { TVASigner } from '../wallet/signer.js';
import type { CompiledContract } from '../compiler/solang.js';
import { keccak_256 } from '@noble/hashes/sha3';

/**
 * Converts an EVM address to a Soroban contract ID format
 * This is deterministic based on the deployment parameters
 */
export function evmAddressToContractId(evmAddress: EvmAddress): SorobanContractId {
  // The contract ID is derived from the deployment transaction
  // For now, return a placeholder - real implementation needs AccountRegistry lookup
  const addressBytes = Buffer.from(evmAddress.slice(2), 'hex');
  // Pad to 32 bytes and encode as Soroban C-address
  const padded = Buffer.alloc(32);
  addressBytes.copy(padded, 12);

  // This is a simplified version - real implementation uses Stellar's address encoding
  const encoded = padded.toString('hex');
  return `C${encoded.toUpperCase().slice(0, 55)}` as SorobanContractId;
}

/**
 * Converts a Soroban contract ID to an EVM address format
 */
export function contractIdToEvmAddress(contractId: SorobanContractId): EvmAddress {
  // Extract bytes from contract ID and take last 20 bytes
  // Real implementation needs proper C-address decoding
  const hex = contractId.slice(1).toLowerCase();
  const last40 = hex.slice(-40);
  return `0x${last40}` as EvmAddress;
}

/**
 * Calculates the EVM function selector (first 4 bytes of keccak256 hash)
 */
export function getFunctionSelector(signature: string): string {
  const hash = keccak_256(new TextEncoder().encode(signature));
  return '0x' + Buffer.from(hash.slice(0, 4)).toString('hex');
}

/**
 * Gets the function signature from ABI
 */
export function getFunctionSignature(func: ABIFunction): string {
  const inputTypes = func.inputs.map((i) => i.type).join(',');
  return `${func.name}(${inputTypes})`;
}

/**
 * Encodes function call data in EVM ABI format
 */
export function encodeFunctionCall(
  func: ABIFunction,
  args: unknown[]
): string {
  const signature = getFunctionSignature(func);
  const selector = getFunctionSelector(signature);

  // Encode arguments (simplified - use ethers.js AbiCoder for full support)
  const encodedArgs = encodeArguments(func.inputs, args);

  return selector + encodedArgs.slice(2);
}

/**
 * Encodes arguments for ABI
 */
function encodeArguments(
  inputs: { name: string; type: string }[],
  args: unknown[]
): string {
  const parts: string[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const arg = args[i];
    parts.push(encodeValue(input.type, arg));
  }

  return '0x' + parts.join('');
}

/**
 * Encodes a single value for ABI
 */
function encodeValue(type: string, value: unknown): string {
  // Handle basic types
  if (type === 'address') {
    const addr = (value as string).replace(/^0x/, '').toLowerCase();
    return addr.padStart(64, '0');
  }

  if (type.startsWith('uint') || type.startsWith('int')) {
    const num = BigInt(value as string | number | bigint);
    const hex = num.toString(16);
    return hex.padStart(64, '0');
  }

  if (type === 'bool') {
    return (value ? '1' : '0').padStart(64, '0');
  }

  if (type === 'bytes32') {
    const bytes = (value as string).replace(/^0x/, '');
    return bytes.padEnd(64, '0');
  }

  if (type === 'string') {
    const strBytes = new TextEncoder().encode(value as string);
    const length = strBytes.length.toString(16).padStart(64, '0');
    const data = Buffer.from(strBytes).toString('hex').padEnd(
      Math.ceil(strBytes.length / 32) * 64,
      '0'
    );
    // For dynamic types, we need offset + length + data
    // Simplified: just encode inline for now
    return length + data;
  }

  throw new Error(`Unsupported ABI type: ${type}`);
}

/**
 * Converts Solidity type to ScVal type
 */
function solidityTypeToScVal(type: string, value: unknown): xdr.ScVal {
  if (type === 'address') {
    const addrStr = value as string;
    // If it's a Stellar address (starts with G), use it directly
    // Otherwise, convert from EVM address
    if (addrStr.startsWith('G')) {
      return Address.fromString(addrStr).toScVal();
    }
    // For EVM addresses, we'd need to look up the registry
    // For now, create a bytes representation
    return xdr.ScVal.scvBytes(Buffer.from(addrStr.replace(/^0x/, ''), 'hex'));
  }

  if (type === 'uint64' || type === 'uint') {
    return nativeToScVal(BigInt(value as string | number), { type: 'u64' });
  }

  if (type === 'int64') {
    return nativeToScVal(BigInt(value as string | number), { type: 'i64' });
  }

  if (type === 'uint128') {
    return nativeToScVal(BigInt(value as string | number), { type: 'u128' });
  }

  if (type === 'int128') {
    return nativeToScVal(BigInt(value as string | number), { type: 'i128' });
  }

  if (type === 'uint32') {
    return nativeToScVal(Number(value), { type: 'u32' });
  }

  if (type === 'int32') {
    return nativeToScVal(Number(value), { type: 'i32' });
  }

  if (type === 'bool') {
    return nativeToScVal(Boolean(value), { type: 'bool' });
  }

  if (type === 'string') {
    return nativeToScVal(String(value), { type: 'string' });
  }

  if (type === 'bytes' || type.startsWith('bytes')) {
    const bytes = Buffer.from((value as string).replace(/^0x/, ''), 'hex');
    return xdr.ScVal.scvBytes(bytes);
  }

  // Default to string conversion
  return nativeToScVal(String(value), { type: 'string' });
}

/**
 * TVA Contract instance for interacting with deployed contracts
 */
export class TVAContract {
  public readonly contractId: SorobanContractId;
  public readonly evmAddress: EvmAddress;
  public readonly abi: ContractABI;
  private readonly network: NetworkConfig;
  private readonly sorobanClient: rpc.Server;

  constructor(
    contractId: SorobanContractId,
    abi: ContractABI,
    network: NetworkType = 'testnet'
  ) {
    this.contractId = contractId;
    this.evmAddress = contractIdToEvmAddress(contractId);
    this.abi = abi;
    this.network = NETWORKS[network];
    this.sorobanClient = new rpc.Server(this.network.sorobanRpcUrl);
  }

  /**
   * Gets a function from the ABI by name
   */
  getFunction(name: string): ABIFunction | undefined {
    return this.abi.functions.find((f) => f.name === name);
  }

  /**
   * Simulates a contract call (read-only, doesn't submit transaction)
   */
  async call<T = unknown>(
    functionName: string,
    args: unknown[] = [],
    signer?: TVASigner
  ): Promise<ContractCallResult<T>> {
    const func = this.getFunction(functionName);
    if (!func) {
      throw new TVAError(
        `Function ${functionName} not found in contract ABI`,
        TVAErrorCode.INVALID_ARGUMENTS,
        { availableFunctions: this.abi.functions.map((f) => f.name) }
      );
    }

    // Convert arguments to ScVal format
    const scArgs = func.inputs.map((input, i) =>
      solidityTypeToScVal(input.type, args[i])
    );

    // Build the contract call
    const contract = new Contract(this.contractId);
    const operation = contract.call(functionName, ...scArgs);

    // If no signer, we need a source account for simulation
    // Use a placeholder public key - simulation doesn't require real signature
    const sourcePublicKey = signer?.stellarAddress ||
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

    // Get account info
    let account;
    try {
      account = await this.sorobanClient.getAccount(sourcePublicKey);
    } catch {
      // For simulation, we can use a mock account
      account = {
        accountId: () => sourcePublicKey,
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => {},
      };
    }

    // Build transaction
    const transaction = new TransactionBuilder(account as any, {
      fee: '100',
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // Simulate the transaction
    const simulation = await this.sorobanClient.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Contract call simulation failed: ${simulation.error}`,
        TVAErrorCode.CONTRACT_REVERT,
        { error: simulation.error }
      );
    }

    // Extract result
    let result: T = undefined as T;
    if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
      result = scValToNative(simulation.result.retval) as T;
    }

    // Extract events/logs
    const events: EvmLog[] = [];
    // Events would be extracted from simulation.events when available

    return {
      result,
      gasUsed: BigInt(simulation.minResourceFee || 0),
      events,
      simulated: true,
    };
  }

  /**
   * Sends a transaction to the contract (state-changing)
   */
  async send(
    functionName: string,
    args: unknown[] = [],
    signer: TVASigner
  ): Promise<ContractCallResult<unknown>> {
    const func = this.getFunction(functionName);
    if (!func) {
      throw new TVAError(
        `Function ${functionName} not found in contract ABI`,
        TVAErrorCode.INVALID_ARGUMENTS,
        { availableFunctions: this.abi.functions.map((f) => f.name) }
      );
    }

    // Convert arguments to ScVal format
    const scArgs = func.inputs.map((input, i) =>
      solidityTypeToScVal(input.type, args[i])
    );

    // Build the contract call
    const contract = new Contract(this.contractId);
    const operation = contract.call(functionName, ...scArgs);

    // Get account
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);

    // Build transaction
    let transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // Simulate to get resource requirements
    const simulation = await this.sorobanClient.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Transaction simulation failed: ${simulation.error}`,
        TVAErrorCode.CONTRACT_REVERT,
        { error: simulation.error }
      );
    }

    // Prepare transaction with simulation results
    transaction = rpc.assembleTransaction(
      transaction,
      simulation
    ).build();

    // Sign with Stellar key
    const signedTx = signer.signStellarTransaction(transaction);

    // Submit transaction
    const sendResponse = await this.sorobanClient.sendTransaction(signedTx);

    if (sendResponse.status === 'ERROR') {
      throw new TVAError(
        `Transaction submission failed`,
        TVAErrorCode.TRANSACTION_FAILED,
        { response: sendResponse }
      );
    }

    // Wait for confirmation
    let txResult = await this.sorobanClient.getTransaction(sendResponse.hash);
    while (txResult.status === 'NOT_FOUND') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      txResult = await this.sorobanClient.getTransaction(sendResponse.hash);
    }

    if (txResult.status !== 'SUCCESS') {
      throw new TVAError(
        `Transaction failed: ${txResult.status}`,
        TVAErrorCode.TRANSACTION_FAILED,
        { result: txResult }
      );
    }

    // Extract return value
    let returnValue: unknown = undefined;
    if ('returnValue' in txResult && txResult.returnValue) {
      returnValue = scValToNative(txResult.returnValue as xdr.ScVal);
    }

    return {
      result: returnValue,
      gasUsed: BigInt(0), // Fee info not directly available in GetTransactionResponse
      events: [], // TODO: Parse events from result
      simulated: false,
    };
  }

  /**
   * Creates a typed contract interface with methods matching the ABI
   */
  connect(signer: TVASigner): TypedContract {
    return new TypedContract(this, signer);
  }
}

/**
 * Typed contract wrapper that provides method-based access
 */
export class TypedContract {
  private contract: TVAContract;
  private signer: TVASigner;

  constructor(contract: TVAContract, signer: TVASigner) {
    this.contract = contract;
    this.signer = signer;

    // Create dynamic methods for each function in the ABI
    for (const func of contract.abi.functions) {
      if (func.type === 'constructor') continue;

      const isView =
        func.stateMutability === 'view' || func.stateMutability === 'pure';

      (this as any)[func.name] = async (...args: unknown[]) => {
        if (isView) {
          return this.contract.call(func.name, args, this.signer);
        } else {
          return this.contract.send(func.name, args, this.signer);
        }
      };
    }
  }

  /**
   * Gets the underlying contract instance
   */
  getContract(): TVAContract {
    return this.contract;
  }
}

/**
 * Contract deployer for deploying new contracts
 */
export class ContractDeployer {
  private network: NetworkConfig;
  private sorobanClient: rpc.Server;

  constructor(network: NetworkType = 'testnet') {
    this.network = NETWORKS[network];
    this.sorobanClient = new rpc.Server(this.network.sorobanRpcUrl);
  }

  /**
   * Deploys a compiled contract to the network
   */
  async deploy(
    contract: CompiledContract,
    signer: TVASigner,
    constructorArgs: unknown[] = []
  ): Promise<DeploymentResult> {
    // Step 1: Upload the WASM
    const wasmHash = await this.uploadWasm(contract.wasm, signer);

    // Step 2: Create the contract instance
    const contractId = await this.createInstance(
      wasmHash,
      signer,
      contract.abi,
      constructorArgs
    );

    // Calculate EVM address from contract ID
    const evmAddress = contractIdToEvmAddress(contractId);

    // Get deployment transaction info
    const ledgerSequence = await this.getCurrentLedgerSequence();

    return {
      contractId,
      evmAddress,
      stellarTxHash: wasmHash, // Using wasm hash as placeholder
      evmTxHash: `0x${wasmHash.slice(0, 64)}`,
      ledgerSequence,
    };
  }

  /**
   * Uploads WASM to the network
   */
  private async uploadWasm(wasm: Buffer, signer: TVASigner): Promise<string> {
    // Get account
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);

    // Build upload transaction
    const uploadOp = Operation.uploadContractWasm({ wasm });

    let transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(uploadOp)
      .setTimeout(30)
      .build();

    // Simulate
    const simulation = await this.sorobanClient.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `WASM upload simulation failed: ${simulation.error}`,
        TVAErrorCode.COMPILATION_FAILED,
        { error: simulation.error }
      );
    }

    // Prepare and sign
    transaction = rpc.assembleTransaction(transaction, simulation).build();
    const signedTx = signer.signStellarTransaction(transaction);

    // Submit
    const response = await this.sorobanClient.sendTransaction(signedTx);

    // Wait for confirmation
    let result: any = response;
    while (result.status === 'PENDING' || result.status === 'NOT_FOUND') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await this.sorobanClient.getTransaction(response.hash);
    }

    if (result.status !== 'SUCCESS') {
      throw new TVAError(
        `WASM upload failed: ${result.status}`,
        TVAErrorCode.COMPILATION_FAILED,
        { result }
      );
    }

    // Extract WASM hash from result
    // The hash is returned in the transaction result
    const wasmHash = keccak_256(wasm);
    return Buffer.from(wasmHash).toString('hex');
  }

  /**
   * Creates a contract instance from uploaded WASM
   */
  private async createInstance(
    wasmHash: string,
    signer: TVASigner,
    _abi: ContractABI,
    _constructorArgs: unknown[]
  ): Promise<SorobanContractId> {
    // Get account
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);

    // Build create contract operation
    const createOp = Operation.createCustomContract({
      address: Address.fromString(signer.stellarAddress),
      wasmHash: Buffer.from(wasmHash, 'hex'),
      salt: Buffer.from(keccak_256(new TextEncoder().encode(Date.now().toString()))),
    });

    let transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(createOp)
      .setTimeout(30)
      .build();

    // Simulate
    const simulation = await this.sorobanClient.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Contract creation simulation failed: ${simulation.error}`,
        TVAErrorCode.COMPILATION_FAILED,
        { error: simulation.error }
      );
    }

    // Prepare and sign
    transaction = rpc.assembleTransaction(transaction, simulation).build();
    const signedTx = signer.signStellarTransaction(transaction);

    // Submit
    const response = await this.sorobanClient.sendTransaction(signedTx);

    // Wait for confirmation
    let result: any = response;
    while (result.status === 'PENDING' || result.status === 'NOT_FOUND') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await this.sorobanClient.getTransaction(response.hash);
    }

    if (result.status !== 'SUCCESS') {
      throw new TVAError(
        `Contract creation failed: ${result.status}`,
        TVAErrorCode.COMPILATION_FAILED,
        { result }
      );
    }

    // Extract contract ID from result
    // The contract ID is derived from the creator address and salt
    const contractIdBytes = keccak_256(
      new Uint8Array([
        ...new TextEncoder().encode(signer.stellarAddress),
        ...Buffer.from(wasmHash, 'hex'),
      ])
    );

    return `C${Buffer.from(contractIdBytes).toString('hex').toUpperCase().slice(0, 55)}` as SorobanContractId;
  }

  /**
   * Gets the current ledger sequence number
   */
  private async getCurrentLedgerSequence(): Promise<number> {
    const latestLedger = await this.sorobanClient.getLatestLedger();
    return latestLedger.sequence;
  }
}
