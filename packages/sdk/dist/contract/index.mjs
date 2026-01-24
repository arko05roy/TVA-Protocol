import { rpc, Contract, TransactionBuilder, scValToNative, Operation, Address, xdr, nativeToScVal } from '@stellar/stellar-sdk';
import { keccak_256 } from '@noble/hashes/sha3';

// src/contract/contract.ts

// src/types/index.ts
var TVA_CHAIN_ID = 1414676736;
var NETWORKS = {
  testnet: {
    type: "testnet",
    rpcUrl: "http://localhost:8545",
    // TVA RPC server
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    chainId: TVA_CHAIN_ID,
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7
    }
  },
  mainnet: {
    type: "mainnet",
    rpcUrl: "http://localhost:8545",
    // TVA RPC server (production URL TBD)
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    chainId: TVA_CHAIN_ID,
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7
    }
  },
  local: {
    type: "local",
    rpcUrl: "http://localhost:8545",
    horizonUrl: "http://localhost:8000",
    sorobanRpcUrl: "http://localhost:8001",
    networkPassphrase: "Standalone Network ; February 2017",
    chainId: TVA_CHAIN_ID,
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7
    }
  }
};
var TVAError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "TVAError";
  }
};
function evmAddressToContractId(evmAddress) {
  const addressBytes = Buffer.from(evmAddress.slice(2), "hex");
  const padded = Buffer.alloc(32);
  addressBytes.copy(padded, 12);
  const encoded = padded.toString("hex");
  return `C${encoded.toUpperCase().slice(0, 55)}`;
}
function contractIdToEvmAddress(contractId) {
  const hex = contractId.slice(1).toLowerCase();
  const last40 = hex.slice(-40);
  return `0x${last40}`;
}
function getFunctionSelector(signature) {
  const hash = keccak_256(new TextEncoder().encode(signature));
  return "0x" + Buffer.from(hash.slice(0, 4)).toString("hex");
}
function getFunctionSignature(func) {
  const inputTypes = func.inputs.map((i) => i.type).join(",");
  return `${func.name}(${inputTypes})`;
}
function encodeFunctionCall(func, args) {
  const signature = getFunctionSignature(func);
  const selector = getFunctionSelector(signature);
  const encodedArgs = encodeArguments(func.inputs, args);
  return selector + encodedArgs.slice(2);
}
function encodeArguments(inputs, args) {
  const parts = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const arg = args[i];
    parts.push(encodeValue(input.type, arg));
  }
  return "0x" + parts.join("");
}
function encodeValue(type, value) {
  if (type === "address") {
    const addr = value.replace(/^0x/, "").toLowerCase();
    return addr.padStart(64, "0");
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    const num = BigInt(value);
    const hex = num.toString(16);
    return hex.padStart(64, "0");
  }
  if (type === "bool") {
    return (value ? "1" : "0").padStart(64, "0");
  }
  if (type === "bytes32") {
    const bytes = value.replace(/^0x/, "");
    return bytes.padEnd(64, "0");
  }
  if (type === "string") {
    const strBytes = new TextEncoder().encode(value);
    const length = strBytes.length.toString(16).padStart(64, "0");
    const data = Buffer.from(strBytes).toString("hex").padEnd(
      Math.ceil(strBytes.length / 32) * 64,
      "0"
    );
    return length + data;
  }
  throw new Error(`Unsupported ABI type: ${type}`);
}
function solidityTypeToScVal(type, value) {
  if (type === "address") {
    const addrStr = value;
    if (addrStr.startsWith("G")) {
      return Address.fromString(addrStr).toScVal();
    }
    return xdr.ScVal.scvBytes(Buffer.from(addrStr.replace(/^0x/, ""), "hex"));
  }
  if (type === "uint64" || type === "uint") {
    return nativeToScVal(BigInt(value), { type: "u64" });
  }
  if (type === "int64") {
    return nativeToScVal(BigInt(value), { type: "i64" });
  }
  if (type === "uint128") {
    return nativeToScVal(BigInt(value), { type: "u128" });
  }
  if (type === "int128") {
    return nativeToScVal(BigInt(value), { type: "i128" });
  }
  if (type === "uint32") {
    return nativeToScVal(Number(value), { type: "u32" });
  }
  if (type === "int32") {
    return nativeToScVal(Number(value), { type: "i32" });
  }
  if (type === "bool") {
    return nativeToScVal(Boolean(value), { type: "bool" });
  }
  if (type === "string") {
    return nativeToScVal(String(value), { type: "string" });
  }
  if (type === "bytes" || type.startsWith("bytes")) {
    const bytes = Buffer.from(value.replace(/^0x/, ""), "hex");
    return xdr.ScVal.scvBytes(bytes);
  }
  return nativeToScVal(String(value), { type: "string" });
}
var TVAContract = class {
  contractId;
  evmAddress;
  abi;
  network;
  sorobanClient;
  constructor(contractId, abi, network = "testnet") {
    this.contractId = contractId;
    this.evmAddress = contractIdToEvmAddress(contractId);
    this.abi = abi;
    this.network = NETWORKS[network];
    this.sorobanClient = new rpc.Server(this.network.sorobanRpcUrl);
  }
  /**
   * Gets a function from the ABI by name
   */
  getFunction(name) {
    return this.abi.functions.find((f) => f.name === name);
  }
  /**
   * Simulates a contract call (read-only, doesn't submit transaction)
   */
  async call(functionName, args = [], signer) {
    const func = this.getFunction(functionName);
    if (!func) {
      throw new TVAError(
        `Function ${functionName} not found in contract ABI`,
        4003 /* INVALID_ARGUMENTS */,
        { availableFunctions: this.abi.functions.map((f) => f.name) }
      );
    }
    const scArgs = func.inputs.map(
      (input, i) => solidityTypeToScVal(input.type, args[i])
    );
    const contract = new Contract(this.contractId);
    const operation = contract.call(functionName, ...scArgs);
    const sourcePublicKey = signer?.stellarAddress || "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    let account;
    try {
      account = await this.sorobanClient.getAccount(sourcePublicKey);
    } catch {
      account = {
        accountId: () => sourcePublicKey,
        sequenceNumber: () => "0",
        incrementSequenceNumber: () => {
        }
      };
    }
    const transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(operation).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Contract call simulation failed: ${simulation.error}`,
        4002 /* CONTRACT_REVERT */,
        { error: simulation.error }
      );
    }
    let result = void 0;
    if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
      result = scValToNative(simulation.result.retval);
    }
    const events = [];
    return {
      result,
      gasUsed: BigInt(simulation.minResourceFee || 0),
      events,
      simulated: true
    };
  }
  /**
   * Sends a transaction to the contract (state-changing)
   */
  async send(functionName, args = [], signer) {
    const func = this.getFunction(functionName);
    if (!func) {
      throw new TVAError(
        `Function ${functionName} not found in contract ABI`,
        4003 /* INVALID_ARGUMENTS */,
        { availableFunctions: this.abi.functions.map((f) => f.name) }
      );
    }
    const scArgs = func.inputs.map(
      (input, i) => solidityTypeToScVal(input.type, args[i])
    );
    const contract = new Contract(this.contractId);
    const operation = contract.call(functionName, ...scArgs);
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);
    let transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(operation).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Transaction simulation failed: ${simulation.error}`,
        4002 /* CONTRACT_REVERT */,
        { error: simulation.error }
      );
    }
    transaction = rpc.assembleTransaction(
      transaction,
      simulation
    ).build();
    const signedTx = signer.signStellarTransaction(transaction);
    const sendResponse = await this.sorobanClient.sendTransaction(signedTx);
    if (sendResponse.status === "ERROR") {
      throw new TVAError(
        `Transaction submission failed`,
        3001 /* TRANSACTION_FAILED */,
        { response: sendResponse }
      );
    }
    let txResult = await this.sorobanClient.getTransaction(sendResponse.hash);
    while (txResult.status === "NOT_FOUND") {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      txResult = await this.sorobanClient.getTransaction(sendResponse.hash);
    }
    if (txResult.status !== "SUCCESS") {
      throw new TVAError(
        `Transaction failed: ${txResult.status}`,
        3001 /* TRANSACTION_FAILED */,
        { result: txResult }
      );
    }
    let returnValue = void 0;
    if ("returnValue" in txResult && txResult.returnValue) {
      returnValue = scValToNative(txResult.returnValue);
    }
    return {
      result: returnValue,
      gasUsed: BigInt(0),
      // Fee info not directly available in GetTransactionResponse
      events: [],
      // TODO: Parse events from result
      simulated: false
    };
  }
  /**
   * Creates a typed contract interface with methods matching the ABI
   */
  connect(signer) {
    return new TypedContract(this, signer);
  }
};
var TypedContract = class {
  contract;
  signer;
  constructor(contract, signer) {
    this.contract = contract;
    this.signer = signer;
    for (const func of contract.abi.functions) {
      if (func.type === "constructor") continue;
      const isView = func.stateMutability === "view" || func.stateMutability === "pure";
      this[func.name] = async (...args) => {
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
  getContract() {
    return this.contract;
  }
};
var ContractDeployer = class {
  network;
  sorobanClient;
  constructor(network = "testnet") {
    this.network = NETWORKS[network];
    this.sorobanClient = new rpc.Server(this.network.sorobanRpcUrl);
  }
  /**
   * Deploys a compiled contract to the network
   */
  async deploy(contract, signer, constructorArgs = []) {
    const wasmHash = await this.uploadWasm(contract.wasm, signer);
    const contractId = await this.createInstance(
      wasmHash,
      signer,
      contract.abi,
      constructorArgs
    );
    const evmAddress = contractIdToEvmAddress(contractId);
    const ledgerSequence = await this.getCurrentLedgerSequence();
    return {
      contractId,
      evmAddress,
      stellarTxHash: wasmHash,
      // Using wasm hash as placeholder
      evmTxHash: `0x${wasmHash.slice(0, 64)}`,
      ledgerSequence
    };
  }
  /**
   * Uploads WASM to the network
   */
  async uploadWasm(wasm, signer) {
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);
    const uploadOp = Operation.uploadContractWasm({ wasm });
    let transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(uploadOp).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `WASM upload simulation failed: ${simulation.error}`,
        1001 /* COMPILATION_FAILED */,
        { error: simulation.error }
      );
    }
    transaction = rpc.assembleTransaction(transaction, simulation).build();
    const signedTx = signer.signStellarTransaction(transaction);
    const response = await this.sorobanClient.sendTransaction(signedTx);
    let result = response;
    while (result.status === "PENDING" || result.status === "NOT_FOUND") {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      result = await this.sorobanClient.getTransaction(response.hash);
    }
    if (result.status !== "SUCCESS") {
      throw new TVAError(
        `WASM upload failed: ${result.status}`,
        1001 /* COMPILATION_FAILED */,
        { result }
      );
    }
    const wasmHash = keccak_256(wasm);
    return Buffer.from(wasmHash).toString("hex");
  }
  /**
   * Creates a contract instance from uploaded WASM
   */
  async createInstance(wasmHash, signer, _abi, _constructorArgs) {
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);
    const createOp = Operation.createCustomContract({
      address: Address.fromString(signer.stellarAddress),
      wasmHash: Buffer.from(wasmHash, "hex"),
      salt: Buffer.from(keccak_256(new TextEncoder().encode(Date.now().toString())))
    });
    let transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(createOp).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Contract creation simulation failed: ${simulation.error}`,
        1001 /* COMPILATION_FAILED */,
        { error: simulation.error }
      );
    }
    transaction = rpc.assembleTransaction(transaction, simulation).build();
    const signedTx = signer.signStellarTransaction(transaction);
    const response = await this.sorobanClient.sendTransaction(signedTx);
    let result = response;
    while (result.status === "PENDING" || result.status === "NOT_FOUND") {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      result = await this.sorobanClient.getTransaction(response.hash);
    }
    if (result.status !== "SUCCESS") {
      throw new TVAError(
        `Contract creation failed: ${result.status}`,
        1001 /* COMPILATION_FAILED */,
        { result }
      );
    }
    const contractIdBytes = keccak_256(
      new Uint8Array([
        ...new TextEncoder().encode(signer.stellarAddress),
        ...Buffer.from(wasmHash, "hex")
      ])
    );
    return `C${Buffer.from(contractIdBytes).toString("hex").toUpperCase().slice(0, 55)}`;
  }
  /**
   * Gets the current ledger sequence number
   */
  async getCurrentLedgerSequence() {
    const latestLedger = await this.sorobanClient.getLatestLedger();
    return latestLedger.sequence;
  }
};

export { ContractDeployer, TVAContract, TypedContract, contractIdToEvmAddress, encodeFunctionCall, evmAddressToContractId, getFunctionSelector, getFunctionSignature };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map