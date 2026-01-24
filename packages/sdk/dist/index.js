'use strict';

var stellarSdk = require('@stellar/stellar-sdk');
var bip39 = require('bip39');
var sha256 = require('@noble/hashes/sha256');
var sha3 = require('@noble/hashes/sha3');
var secp256k1 = require('@noble/secp256k1');
var ed25519 = require('@noble/ed25519');
var hmac = require('@noble/hashes/hmac');
var sha512 = require('@noble/hashes/sha512');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var os = require('os');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var bip39__namespace = /*#__PURE__*/_interopNamespace(bip39);
var secp256k1__namespace = /*#__PURE__*/_interopNamespace(secp256k1);
var ed25519__namespace = /*#__PURE__*/_interopNamespace(ed25519);
var path__namespace = /*#__PURE__*/_interopNamespace(path);
var os__namespace = /*#__PURE__*/_interopNamespace(os);

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
var TVAErrorCode = /* @__PURE__ */ ((TVAErrorCode2) => {
  TVAErrorCode2[TVAErrorCode2["COMPILATION_FAILED"] = 1001] = "COMPILATION_FAILED";
  TVAErrorCode2[TVAErrorCode2["SOLANG_NOT_FOUND"] = 1002] = "SOLANG_NOT_FOUND";
  TVAErrorCode2[TVAErrorCode2["INVALID_SOURCE"] = 1003] = "INVALID_SOURCE";
  TVAErrorCode2[TVAErrorCode2["NETWORK_ERROR"] = 2001] = "NETWORK_ERROR";
  TVAErrorCode2[TVAErrorCode2["RPC_ERROR"] = 2002] = "RPC_ERROR";
  TVAErrorCode2[TVAErrorCode2["TIMEOUT"] = 2003] = "TIMEOUT";
  TVAErrorCode2[TVAErrorCode2["TRANSACTION_FAILED"] = 3001] = "TRANSACTION_FAILED";
  TVAErrorCode2[TVAErrorCode2["INSUFFICIENT_BALANCE"] = 3002] = "INSUFFICIENT_BALANCE";
  TVAErrorCode2[TVAErrorCode2["INVALID_NONCE"] = 3003] = "INVALID_NONCE";
  TVAErrorCode2[TVAErrorCode2["GAS_ESTIMATION_FAILED"] = 3004] = "GAS_ESTIMATION_FAILED";
  TVAErrorCode2[TVAErrorCode2["CONTRACT_NOT_FOUND"] = 4001] = "CONTRACT_NOT_FOUND";
  TVAErrorCode2[TVAErrorCode2["CONTRACT_REVERT"] = 4002] = "CONTRACT_REVERT";
  TVAErrorCode2[TVAErrorCode2["INVALID_ARGUMENTS"] = 4003] = "INVALID_ARGUMENTS";
  TVAErrorCode2[TVAErrorCode2["ACCOUNT_NOT_FOUND"] = 5001] = "ACCOUNT_NOT_FOUND";
  TVAErrorCode2[TVAErrorCode2["ACCOUNT_NOT_REGISTERED"] = 5002] = "ACCOUNT_NOT_REGISTERED";
  TVAErrorCode2[TVAErrorCode2["INVALID_SIGNATURE"] = 5003] = "INVALID_SIGNATURE";
  TVAErrorCode2[TVAErrorCode2["STATE_ARCHIVED"] = 6001] = "STATE_ARCHIVED";
  TVAErrorCode2[TVAErrorCode2["TTL_EXPIRED"] = 6002] = "TTL_EXPIRED";
  TVAErrorCode2[TVAErrorCode2["RESTORATION_FAILED"] = 6003] = "RESTORATION_FAILED";
  return TVAErrorCode2;
})(TVAErrorCode || {});

// src/rpc/client.ts
var RpcClient = class {
  url;
  timeout;
  headers;
  requestId = 0;
  network;
  constructor(options = {}) {
    const networkType = options.network || "testnet";
    this.network = NETWORKS[networkType];
    this.url = options.url || this.network.rpcUrl;
    this.timeout = options.timeout || 3e4;
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers
    };
  }
  /**
   * Makes a JSON-RPC request to the TVA RPC server
   */
  async request(method, params = []) {
    const id = ++this.requestId;
    const body = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new TVAError(
          `HTTP error: ${response.status} ${response.statusText}`,
          2002 /* RPC_ERROR */,
          { status: response.status }
        );
      }
      const json = await response.json();
      if (json.error) {
        throw new TVAError(
          json.error.message,
          2002 /* RPC_ERROR */,
          { code: json.error.code, data: json.error.data }
        );
      }
      return json.result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof TVAError) {
        throw error;
      }
      if (error.name === "AbortError") {
        throw new TVAError(
          "Request timeout",
          2003 /* TIMEOUT */,
          { timeout: this.timeout }
        );
      }
      throw new TVAError(
        `Network error: ${error.message}`,
        2001 /* NETWORK_ERROR */,
        { originalError: error }
      );
    }
  }
  // ============================================================================
  // Chain Methods
  // ============================================================================
  /**
   * Returns the chain ID of the TVA network
   */
  async getChainId() {
    const result = await this.request("eth_chainId");
    return parseInt(result, 16);
  }
  /**
   * Returns the network version
   */
  async getNetworkVersion() {
    return this.request("net_version");
  }
  /**
   * Returns the client version
   */
  async getClientVersion() {
    return this.request("web3_clientVersion");
  }
  /**
   * Returns the current gas price in wei
   */
  async getGasPrice() {
    const result = await this.request("eth_gasPrice");
    return BigInt(result);
  }
  // ============================================================================
  // Block Methods
  // ============================================================================
  /**
   * Returns the current block number (Stellar ledger sequence)
   */
  async getBlockNumber() {
    const result = await this.request("eth_blockNumber");
    return parseInt(result, 16);
  }
  /**
   * Returns a block by number
   */
  async getBlockByNumber(blockNumber, includeTransactions = false) {
    const blockParam = typeof blockNumber === "number" ? `0x${blockNumber.toString(16)}` : blockNumber;
    return this.request("eth_getBlockByNumber", [
      blockParam,
      includeTransactions
    ]);
  }
  /**
   * Returns a block by hash
   */
  async getBlockByHash(blockHash, includeTransactions = false) {
    return this.request("eth_getBlockByHash", [
      blockHash,
      includeTransactions
    ]);
  }
  // ============================================================================
  // Account Methods
  // ============================================================================
  /**
   * Returns the balance of an account in wei (XLM converted to 18 decimals)
   */
  async getBalance(address, blockNumber = "latest") {
    const blockParam = typeof blockNumber === "number" ? `0x${blockNumber.toString(16)}` : blockNumber;
    const result = await this.request("eth_getBalance", [
      address,
      blockParam
    ]);
    return BigInt(result);
  }
  /**
   * Returns the transaction count (nonce) of an account
   */
  async getTransactionCount(address, blockNumber = "latest") {
    const blockParam = typeof blockNumber === "number" ? `0x${blockNumber.toString(16)}` : blockNumber;
    const result = await this.request("eth_getTransactionCount", [
      address,
      blockParam
    ]);
    return parseInt(result, 16);
  }
  /**
   * Returns the code at a given address (contract WASM hash)
   */
  async getCode(address, blockNumber = "latest") {
    const blockParam = typeof blockNumber === "number" ? `0x${blockNumber.toString(16)}` : blockNumber;
    return this.request("eth_getCode", [address, blockParam]);
  }
  // ============================================================================
  // Transaction Methods
  // ============================================================================
  /**
   * Sends a signed raw transaction
   */
  async sendRawTransaction(signedTransaction) {
    return this.request("eth_sendRawTransaction", [signedTransaction]);
  }
  /**
   * Returns a transaction by hash
   */
  async getTransactionByHash(txHash) {
    return this.request("eth_getTransactionByHash", [txHash]);
  }
  /**
   * Returns a transaction receipt
   */
  async getTransactionReceipt(txHash) {
    return this.request("eth_getTransactionReceipt", [txHash]);
  }
  /**
   * Executes a call without creating a transaction (read-only)
   */
  async call(transaction, blockNumber = "latest") {
    const blockParam = typeof blockNumber === "number" ? `0x${blockNumber.toString(16)}` : blockNumber;
    return this.request("eth_call", [transaction, blockParam]);
  }
  /**
   * Estimates gas for a transaction
   */
  async estimateGas(transaction) {
    const result = await this.request("eth_estimateGas", [transaction]);
    return BigInt(result);
  }
  // ============================================================================
  // Log Methods
  // ============================================================================
  /**
   * Returns logs matching the given filter
   */
  async getLogs(filter) {
    const formattedFilter = {};
    if (filter.fromBlock !== void 0) {
      formattedFilter.fromBlock = typeof filter.fromBlock === "number" ? `0x${filter.fromBlock.toString(16)}` : filter.fromBlock;
    }
    if (filter.toBlock !== void 0) {
      formattedFilter.toBlock = typeof filter.toBlock === "number" ? `0x${filter.toBlock.toString(16)}` : filter.toBlock;
    }
    if (filter.address) {
      formattedFilter.address = filter.address;
    }
    if (filter.topics) {
      formattedFilter.topics = filter.topics;
    }
    if (filter.blockHash) {
      formattedFilter.blockHash = filter.blockHash;
    }
    return this.request("eth_getLogs", [formattedFilter]);
  }
  // ============================================================================
  // Utility Methods
  // ============================================================================
  /**
   * Computes keccak256 hash
   */
  async sha3(data) {
    return this.request("web3_sha3", [data]);
  }
  /**
   * Waits for a transaction to be mined
   */
  async waitForTransaction(txHash, confirmations = 1, timeout = 6e4) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (receipt) {
        const currentBlock = await this.getBlockNumber();
        const txBlock = receipt.blockNumber;
        const currentConfirmations = currentBlock - txBlock + 1;
        if (currentConfirmations >= confirmations) {
          return receipt;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }
    throw new TVAError(
      `Transaction ${txHash} was not mined within ${timeout}ms`,
      2003 /* TIMEOUT */,
      { txHash, timeout }
    );
  }
  /**
   * Checks if the RPC server is healthy
   */
  async isHealthy() {
    try {
      await this.getChainId();
      return true;
    } catch {
      return false;
    }
  }
};
function createRpcClient(networkOrUrl = "testnet") {
  if (networkOrUrl.startsWith("http")) {
    return new RpcClient({ url: networkOrUrl });
  }
  return new RpcClient({ network: networkOrUrl });
}
ed25519__namespace.etc.sha512Sync = (...m) => sha512.sha512(ed25519__namespace.etc.concatBytes(...m));
function deriveSecp256k1KeyFromSeed(seed, path2) {
  const I = hmac.hmac(sha512.sha512, new TextEncoder().encode("Bitcoin seed"), seed);
  let key = new Uint8Array(I.slice(0, 32));
  let chainCode = new Uint8Array(I.slice(32));
  const segments = path2.replace(/^m\//, "").split("/").map((s) => {
    const hardened = s.endsWith("'");
    const index = parseInt(s.replace("'", ""), 10);
    return { index, hardened };
  });
  for (const segment of segments) {
    const indexBuffer = new Uint8Array(4);
    const view = new DataView(indexBuffer.buffer);
    let data;
    if (segment.hardened) {
      const hardenedIndex = segment.index | 2147483648;
      view.setUint32(0, hardenedIndex, false);
      data = new Uint8Array(1 + 32 + 4);
      data[0] = 0;
      data.set(key, 1);
      data.set(indexBuffer, 33);
    } else {
      view.setUint32(0, segment.index, false);
      const publicKey = secp256k1__namespace.getPublicKey(key, true);
      data = new Uint8Array(33 + 4);
      data.set(publicKey, 0);
      data.set(indexBuffer, 33);
    }
    const I2 = hmac.hmac(sha512.sha512, chainCode, data);
    const IL = new Uint8Array(I2.slice(0, 32));
    chainCode = new Uint8Array(I2.slice(32));
    const parentKeyBigInt = bytesToBigInt(key);
    const ILBigInt = bytesToBigInt(IL);
    const n = BigInt(
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
    );
    const childKeyBigInt = (ILBigInt + parentKeyBigInt) % n;
    key = bigIntToBytes(childKeyBigInt, 32);
  }
  return key;
}
function bytesToBigInt(bytes) {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = result << BigInt(8) | BigInt(bytes[i]);
  }
  return result;
}
function bigIntToBytes(value, length) {
  const result = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(v & BigInt(255));
    v = v >> BigInt(8);
  }
  return result;
}
function publicKeyToEvmAddress(publicKey) {
  const keyWithoutPrefix = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
  const hash = sha3.keccak_256(keyWithoutPrefix);
  const addressBytes = new Uint8Array(hash.slice(-20));
  const hex = Array.from(addressBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}
function publicKeyToStellarAddress(publicKey) {
  return stellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(publicKey));
}
function generateMnemonic2(strength = 256) {
  return bip39__namespace.generateMnemonic(strength);
}
function validateMnemonic2(mnemonic) {
  return bip39__namespace.validateMnemonic(mnemonic);
}
async function deriveKeyPairFromMnemonic(mnemonic, accountIndex = 0) {
  if (!validateMnemonic2(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }
  const seed = await bip39__namespace.mnemonicToSeed(mnemonic);
  const seedArray = new Uint8Array(seed);
  const evmPath = `m/44'/60'/0'/0/${accountIndex}`;
  const evmPrivateKey = deriveSecp256k1KeyFromSeed(seedArray, evmPath);
  const evmPublicKey = secp256k1__namespace.getPublicKey(evmPrivateKey, false);
  const stellarSeed = sha256.sha256(
    new Uint8Array([
      ...new TextEncoder().encode("TVA-STELLAR-KEY"),
      ...evmPrivateKey
    ])
  );
  const stellarKeypair = stellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));
  return {
    evmPrivateKey: `0x${Buffer.from(evmPrivateKey).toString("hex")}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString("hex")}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey()
  };
}
function deriveKeyPairFromEvmPrivateKey(evmPrivateKey) {
  const privateKeyHex = evmPrivateKey.replace(/^0x/, "");
  const privateKeyBytes = Buffer.from(privateKeyHex, "hex");
  if (privateKeyBytes.length !== 32) {
    throw new Error("Invalid private key length");
  }
  const evmPublicKey = secp256k1__namespace.getPublicKey(privateKeyBytes, false);
  const stellarSeed = sha256.sha256(
    new Uint8Array([
      ...new TextEncoder().encode("TVA-STELLAR-KEY"),
      ...privateKeyBytes
    ])
  );
  const stellarKeypair = stellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));
  return {
    evmPrivateKey: `0x${privateKeyHex}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString("hex")}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey()
  };
}
function generateRandomKeyPair() {
  const mnemonic = generateMnemonic2();
  const seed = bip39__namespace.mnemonicToSeedSync(mnemonic);
  const seedArray = new Uint8Array(seed);
  const evmPath = `m/44'/60'/0'/0/0`;
  const evmPrivateKey = deriveSecp256k1KeyFromSeed(seedArray, evmPath);
  const evmPublicKey = secp256k1__namespace.getPublicKey(evmPrivateKey, false);
  const stellarSeed = sha256.sha256(
    new Uint8Array([
      ...new TextEncoder().encode("TVA-STELLAR-KEY"),
      ...evmPrivateKey
    ])
  );
  const stellarKeypair = stellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));
  return {
    evmPrivateKey: `0x${Buffer.from(evmPrivateKey).toString("hex")}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString("hex")}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey()
  };
}
function getEvmAddress(keyPair) {
  const publicKeyBytes = Buffer.from(keyPair.evmPublicKey.replace(/^0x/, ""), "hex");
  return publicKeyToEvmAddress(publicKeyBytes);
}
function getStellarAddress(keyPair) {
  return keyPair.stellarPublicKey;
}
function verifyEvmAddress(address, publicKey) {
  const publicKeyBytes = Buffer.from(publicKey.replace(/^0x/, ""), "hex");
  const derivedAddress = publicKeyToEvmAddress(publicKeyBytes);
  return derivedAddress.toLowerCase() === address.toLowerCase();
}
function verifyStellarAddress(address, publicKey) {
  return address === publicKey;
}
secp256k1__namespace.etc.hmacSha256Sync = (k, ...m) => hmac.hmac(sha256.sha256, k, secp256k1__namespace.etc.concatBytes(...m));
var EvmSigner = class {
  privateKey;
  address;
  constructor(keyPair) {
    this.privateKey = Buffer.from(
      keyPair.evmPrivateKey.replace(/^0x/, ""),
      "hex"
    );
    this.address = getEvmAddress(keyPair);
  }
  /**
   * Signs a message hash using secp256k1
   */
  signHash(hash) {
    const signature = secp256k1__namespace.sign(hash, this.privateKey);
    const r = signature.r.toString(16).padStart(64, "0");
    const s = signature.s.toString(16).padStart(64, "0");
    const v = signature.recovery + 27;
    return { r: `0x${r}`, s: `0x${s}`, v };
  }
  /**
   * Signs a personal message (EIP-191)
   */
  signMessage(message) {
    const messageBytes = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(
      `Ethereum Signed Message:
${messageBytes.length}`
    );
    const prefixedMessage = new Uint8Array([...prefix, ...messageBytes]);
    const hash = sha3.keccak_256(prefixedMessage);
    const { r, s, v } = this.signHash(hash);
    return `${r}${s.slice(2)}${v.toString(16).padStart(2, "0")}`;
  }
  /**
   * Signs typed data (EIP-712)
   */
  signTypedData(domain, types, value) {
    const domainSeparator = this.hashStruct("EIP712Domain", domain, {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ]
    });
    const primaryType = Object.keys(types).find((t) => t !== "EIP712Domain");
    if (!primaryType) {
      throw new Error("No primary type found");
    }
    const structHash = this.hashStruct(primaryType, value, types);
    const messageHash = sha3.keccak_256(
      new Uint8Array([25, 1, ...domainSeparator, ...structHash])
    );
    const { r, s, v } = this.signHash(messageHash);
    return `${r}${s.slice(2)}${v.toString(16).padStart(2, "0")}`;
  }
  hashStruct(typeName, data, types) {
    const typeHash = sha3.keccak_256(
      new TextEncoder().encode(this.encodeType(typeName, types))
    );
    const encodedData = this.encodeData(typeName, data, types);
    return sha3.keccak_256(new Uint8Array([...typeHash, ...encodedData]));
  }
  encodeType(primaryType, types) {
    const fields = types[primaryType];
    if (!fields) {
      return primaryType;
    }
    const fieldDefs = fields.map((f) => `${f.type} ${f.name}`).join(",");
    return `${primaryType}(${fieldDefs})`;
  }
  encodeData(typeName, data, types) {
    const fields = types[typeName];
    if (!fields) {
      throw new Error(`Unknown type: ${typeName}`);
    }
    const parts = [];
    for (const field of fields) {
      const value = data[field.name];
      parts.push(this.encodeValue(field.type, value, types));
    }
    return new Uint8Array(parts.flatMap((p) => [...p]));
  }
  encodeValue(type, value, types) {
    if (type === "string") {
      return sha3.keccak_256(new TextEncoder().encode(value));
    }
    if (type === "bytes") {
      const bytes = Buffer.from(value.replace(/^0x/, ""), "hex");
      return sha3.keccak_256(bytes);
    }
    if (type === "address") {
      const addr = value.replace(/^0x/, "").toLowerCase();
      const padded = new Uint8Array(32);
      const addrBytes = Buffer.from(addr, "hex");
      padded.set(addrBytes, 32 - addrBytes.length);
      return padded;
    }
    if (type.startsWith("uint") || type.startsWith("int")) {
      const num = BigInt(value);
      const bytes = new Uint8Array(32);
      let val = num;
      for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(val & BigInt(255));
        val = val >> BigInt(8);
      }
      return bytes;
    }
    if (type === "bool") {
      const bytes = new Uint8Array(32);
      bytes[31] = value ? 1 : 0;
      return bytes;
    }
    if (types[type]) {
      return this.hashStruct(type, value, types);
    }
    throw new Error(`Unsupported type: ${type}`);
  }
  /**
   * Signs an EVM transaction and returns the signed raw transaction
   */
  signTransaction(tx) {
    const encodedTx = this.rlpEncodeTransaction(tx);
    const hash = sha3.keccak_256(encodedTx);
    const signature = this.signHash(hash);
    const v = tx.chainId * 2 + 35 + (signature.v - 27);
    return this.rlpEncodeSignedTransaction(tx, {
      r: signature.r,
      s: signature.s,
      v
    });
  }
  rlpEncodeTransaction(tx) {
    const items = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to || "",
      tx.value,
      tx.data,
      tx.chainId,
      0,
      0
    ];
    return this.rlpEncode(items);
  }
  rlpEncodeSignedTransaction(tx, sig) {
    const items = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to || "",
      tx.value,
      tx.data,
      sig.v,
      sig.r,
      sig.s
    ];
    const encoded = this.rlpEncode(items);
    return "0x" + Buffer.from(encoded).toString("hex");
  }
  rlpEncode(input) {
    if (Array.isArray(input)) {
      const encodedItems = input.map((item) => this.rlpEncode(item));
      const totalLength = encodedItems.reduce((sum, item) => sum + item.length, 0);
      const flatItems = encodedItems.flatMap((item) => Array.from(item));
      if (totalLength < 56) {
        return new Uint8Array([192 + totalLength, ...flatItems]);
      } else {
        const lengthBytes2 = this.encodeBigEndian(totalLength);
        return new Uint8Array([
          247 + lengthBytes2.length,
          ...Array.from(lengthBytes2),
          ...flatItems
        ]);
      }
    }
    const bytes = this.toBytes(input);
    if (bytes.length === 1 && bytes[0] < 128) {
      return bytes;
    }
    if (bytes.length < 56) {
      return new Uint8Array([128 + bytes.length, ...Array.from(bytes)]);
    }
    const lengthBytes = this.encodeBigEndian(bytes.length);
    return new Uint8Array([183 + lengthBytes.length, ...Array.from(lengthBytes), ...Array.from(bytes)]);
  }
  toBytes(input) {
    if (input === null || input === "" || input === 0 || input === BigInt(0)) {
      return new Uint8Array(0);
    }
    if (input instanceof Uint8Array) {
      return input;
    }
    if (typeof input === "string") {
      if (input.startsWith("0x")) {
        const hex = input.slice(2);
        if (hex.length === 0) {
          return new Uint8Array(0);
        }
        return Buffer.from(hex.padStart(hex.length + hex.length % 2, "0"), "hex");
      }
      return new TextEncoder().encode(input);
    }
    if (typeof input === "number" || typeof input === "bigint") {
      return this.encodeBigEndian(input);
    }
    throw new Error(`Cannot encode: ${input}`);
  }
  encodeBigEndian(value) {
    if (value === 0 || value === BigInt(0)) {
      return new Uint8Array(0);
    }
    const bytes = [];
    let v = BigInt(value);
    while (v > 0) {
      bytes.unshift(Number(v & BigInt(255)));
      v = v >> BigInt(8);
    }
    return new Uint8Array(bytes);
  }
};
var StellarSigner = class {
  keypair;
  publicKey;
  constructor(keyPair) {
    this.keypair = stellarSdk.Keypair.fromSecret(keyPair.stellarSecretKey);
    this.publicKey = this.keypair.publicKey();
  }
  /**
   * Signs a Stellar transaction
   */
  signTransaction(transaction, _networkPassphrase) {
    transaction.sign(this.keypair);
    return transaction;
  }
  /**
   * Signs arbitrary data
   */
  signData(data) {
    return this.keypair.sign(Buffer.from(data));
  }
  /**
   * Verifies a signature
   */
  verifySignature(data, signature) {
    return this.keypair.verify(Buffer.from(data), Buffer.from(signature));
  }
  /**
   * Signs a Soroban authorization entry
   */
  signAuthEntry(entry, networkPassphrase, validUntilLedger) {
    const signedEntry = stellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
    const credentials = signedEntry.credentials();
    if (credentials.switch().value === 0) {
      return signedEntry;
    }
    const addressCredentials = credentials.address();
    const preimage = stellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new stellarSdk.xdr.HashIdPreimageSorobanAuthorization({
        networkId: Buffer.from(sha256.sha256(new TextEncoder().encode(networkPassphrase))),
        nonce: addressCredentials.nonce(),
        signatureExpirationLedger: validUntilLedger,
        invocation: signedEntry.rootInvocation()
      })
    );
    const preimageHash = sha256.sha256(preimage.toXDR());
    const signature = this.keypair.sign(Buffer.from(preimageHash));
    const newCredentials = new stellarSdk.xdr.SorobanAddressCredentials({
      address: addressCredentials.address(),
      nonce: addressCredentials.nonce(),
      signatureExpirationLedger: validUntilLedger,
      signature: stellarSdk.xdr.ScVal.scvVec([
        stellarSdk.xdr.ScVal.scvMap([
          new stellarSdk.xdr.ScMapEntry({
            key: stellarSdk.xdr.ScVal.scvSymbol("public_key"),
            val: stellarSdk.xdr.ScVal.scvBytes(this.keypair.rawPublicKey())
          }),
          new stellarSdk.xdr.ScMapEntry({
            key: stellarSdk.xdr.ScVal.scvSymbol("signature"),
            val: stellarSdk.xdr.ScVal.scvBytes(signature)
          })
        ])
      ])
    });
    signedEntry.credentials(stellarSdk.xdr.SorobanCredentials.sorobanCredentialsAddress(newCredentials));
    return signedEntry;
  }
};
var TVASigner = class {
  evmSigner;
  stellarSigner;
  keyPair;
  network;
  constructor(keyPair, network = "testnet") {
    this.keyPair = keyPair;
    this.network = NETWORKS[network];
    this.evmSigner = new EvmSigner(keyPair);
    this.stellarSigner = new StellarSigner(keyPair);
  }
  get evmAddress() {
    return this.evmSigner.address;
  }
  get stellarAddress() {
    return this.stellarSigner.publicKey;
  }
  /**
   * Signs an EVM-format transaction
   */
  signEvmTransaction(tx) {
    return this.evmSigner.signTransaction(tx);
  }
  /**
   * Signs a Stellar transaction
   */
  signStellarTransaction(transaction) {
    return this.stellarSigner.signTransaction(
      transaction,
      this.network.networkPassphrase
    );
  }
  /**
   * Signs a personal message (for wallet connect / dapp signatures)
   */
  signMessage(message) {
    return this.evmSigner.signMessage(message);
  }
};
var SOLANG_BINARY_PATHS = [
  // User-specified path via environment variable
  process.env.TVA_SOLANG_PATH,
  // Local project path
  path__namespace.join(process.cwd(), "solang"),
  path__namespace.join(process.cwd(), "bin", "solang"),
  // TVA tooling path
  path__namespace.join(process.cwd(), "tooling", "solang", "target", "release", "solang"),
  // Global installations
  "/usr/local/bin/solang",
  "/usr/bin/solang",
  // Homebrew (macOS)
  "/opt/homebrew/bin/solang",
  // Cargo installation
  path__namespace.join(os__namespace.homedir(), ".cargo", "bin", "solang")
].filter(Boolean);
async function findSolangBinary() {
  for (const binaryPath of SOLANG_BINARY_PATHS) {
    try {
      await fs.promises.access(binaryPath, fs.promises.constants.X_OK);
      return binaryPath;
    } catch {
    }
  }
  throw new TVAError(
    "Solang compiler not found. Please install Solang or set TVA_SOLANG_PATH environment variable.",
    1002 /* SOLANG_NOT_FOUND */,
    {
      searchedPaths: SOLANG_BINARY_PATHS
    }
  );
}
var SolangCompiler = class {
  solangPath = null;
  options;
  constructor(options = {}) {
    this.options = {
      optimizationLevel: 2,
      ...options
    };
  }
  /**
   * Initializes the compiler by finding the Solang binary
   */
  async initialize() {
    if (this.options.solangPath) {
      this.solangPath = this.options.solangPath;
    } else {
      this.solangPath = await findSolangBinary();
    }
  }
  /**
   * Gets the Solang version
   */
  async getVersion() {
    if (!this.solangPath) {
      await this.initialize();
    }
    return new Promise((resolve, reject) => {
      const proc = child_process.spawn(this.solangPath, ["--version"]);
      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.on("close", (code) => {
        if (code === 0) {
          const match = output.match(/solang version v?([\d.]+)/i);
          resolve(match ? match[1] : output.trim());
        } else {
          reject(new Error("Failed to get Solang version"));
        }
      });
    });
  }
  /**
   * Compiles a Solidity source file to Soroban WASM
   */
  async compile(input) {
    if (!this.solangPath) {
      await this.initialize();
    }
    const tempDir = await fs.promises.mkdtemp(path__namespace.join(os__namespace.tmpdir(), "tva-compile-"));
    const sourceFile = path__namespace.join(tempDir, input.fileName);
    const outputDir = this.options.outputDir || tempDir;
    try {
      await fs.promises.writeFile(sourceFile, input.source);
      const args = [
        "compile",
        sourceFile,
        "--target",
        "soroban",
        "-o",
        outputDir
      ];
      if (this.options.optimizationLevel !== void 0) {
        args.push(`-O${this.options.optimizationLevel}`);
      }
      if (this.options.importPaths) {
        for (const importPath of this.options.importPaths) {
          args.push("-I", importPath);
        }
      }
      if (this.options.additionalFlags) {
        args.push(...this.options.additionalFlags);
      }
      const result = await this.runSolang(args);
      if (result.exitCode !== 0 && !result.stdout.includes(".wasm")) {
        throw new TVAError(
          `Compilation failed: ${result.stderr || result.stdout}`,
          1001 /* COMPILATION_FAILED */,
          {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          }
        );
      }
      const files = await fs.promises.readdir(outputDir);
      const wasmFile = files.find((f) => f.endsWith(".wasm"));
      const abiFile = files.find((f) => f.endsWith(".abi") || f.endsWith(".json"));
      if (!wasmFile) {
        throw new TVAError(
          "No WASM file produced by compilation",
          1001 /* COMPILATION_FAILED */,
          {
            outputFiles: files,
            stdout: result.stdout,
            stderr: result.stderr
          }
        );
      }
      const wasmPath = path__namespace.join(outputDir, wasmFile);
      const wasmBuffer = await fs.promises.readFile(wasmPath);
      let abi = {
        name: input.fileName.replace(".sol", ""),
        functions: [],
        events: [],
        errors: []
      };
      if (abiFile) {
        const abiPath = path__namespace.join(outputDir, abiFile);
        const abiContent = await fs.promises.readFile(abiPath, "utf-8");
        abi = this.parseABI(abiContent, input.fileName);
      }
      const spec = this.extractSorobanSpec(wasmBuffer);
      const warnings = this.parseWarnings(result.stdout + result.stderr);
      return {
        wasm: wasmBuffer.toString("base64"),
        abi,
        spec,
        warnings
      };
    } finally {
      if (!this.options.outputDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {
        });
      }
    }
  }
  /**
   * Compiles a Solidity source file and returns detailed artifacts
   */
  async compileFile(filePath) {
    const source = await fs.promises.readFile(filePath, "utf-8");
    const fileName = path__namespace.basename(filePath);
    const output = await this.compile({
      source,
      fileName
    });
    return [
      {
        name: output.abi.name,
        wasm: Buffer.from(output.wasm, "base64"),
        abi: output.abi,
        spec: output.spec,
        sourcePath: filePath,
        warnings: output.warnings
      }
    ];
  }
  /**
   * Compiles multiple Solidity files
   */
  async compileFiles(filePaths) {
    const results = [];
    for (const filePath of filePaths) {
      const contracts = await this.compileFile(filePath);
      results.push(...contracts);
    }
    return results;
  }
  /**
   * Runs Solang with the given arguments
   */
  runSolang(args) {
    return new Promise((resolve) => {
      const proc = child_process.spawn(this.solangPath, args);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr
        });
      });
      proc.on("error", (error) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + error.message
        });
      });
    });
  }
  /**
   * Parses Solang ABI output
   */
  parseABI(abiContent, fileName) {
    try {
      const parsed = JSON.parse(abiContent);
      const entries = Array.isArray(parsed) ? parsed : parsed.abi || [];
      const functions = [];
      const events = [];
      const errors = [];
      for (const entry of entries) {
        if (entry.type === "function" || !entry.type) {
          functions.push({
            name: entry.name,
            inputs: entry.inputs || [],
            outputs: entry.outputs || [],
            stateMutability: entry.stateMutability || "nonpayable",
            type: "function"
          });
        } else if (entry.type === "constructor") {
          functions.push({
            name: "constructor",
            inputs: entry.inputs || [],
            outputs: [],
            stateMutability: entry.stateMutability || "nonpayable",
            type: "constructor"
          });
        } else if (entry.type === "event") {
          events.push({
            name: entry.name,
            inputs: entry.inputs || [],
            anonymous: entry.anonymous || false
          });
        } else if (entry.type === "error") {
          errors.push({
            name: entry.name,
            inputs: entry.inputs || []
          });
        }
      }
      return {
        name: parsed.name || fileName.replace(".sol", ""),
        functions,
        events,
        errors
      };
    } catch (error) {
      return {
        name: fileName.replace(".sol", ""),
        functions: [],
        events: [],
        errors: []
      };
    }
  }
  /**
   * Extracts Soroban spec from WASM custom section
   */
  extractSorobanSpec(wasmBuffer) {
    try {
      const specs = [];
      let offset = 8;
      while (offset < wasmBuffer.length) {
        const sectionId = wasmBuffer[offset++];
        const sectionSize = this.readLEB128(wasmBuffer, offset);
        offset = sectionSize.offset;
        if (sectionId === 0) {
          const nameLen = this.readLEB128(wasmBuffer, offset);
          offset = nameLen.offset;
          const name = wasmBuffer.slice(offset, offset + nameLen.value).toString("utf-8");
          offset += nameLen.value;
          if (name === "contractspecv0") {
            specs.push({
              type: "function",
              name: "_spec_found",
              doc: "Soroban spec section found in WASM"
            });
          }
        }
        offset += sectionSize.value - (offset - sectionSize.offset);
      }
      return specs;
    } catch {
      return [];
    }
  }
  /**
   * Reads a LEB128 encoded integer from a buffer
   */
  readLEB128(buffer, offset) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = buffer[offset++];
      result |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return { value: result, offset };
  }
  /**
   * Parses compilation warnings from Solang output
   */
  parseWarnings(output) {
    const warnings = [];
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("warning:") || line.includes("Warning:")) {
        warnings.push(line.trim());
      }
    }
    return warnings;
  }
};
async function compileSource(source, fileName = "Contract.sol", options) {
  const compiler = new SolangCompiler(options);
  return compiler.compile({ source, fileName });
}
async function compileFile(filePath, options) {
  const compiler = new SolangCompiler(options);
  return compiler.compileFile(filePath);
}
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
  const hash = sha3.keccak_256(new TextEncoder().encode(signature));
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
      return stellarSdk.Address.fromString(addrStr).toScVal();
    }
    return stellarSdk.xdr.ScVal.scvBytes(Buffer.from(addrStr.replace(/^0x/, ""), "hex"));
  }
  if (type === "uint64" || type === "uint") {
    return stellarSdk.nativeToScVal(BigInt(value), { type: "u64" });
  }
  if (type === "int64") {
    return stellarSdk.nativeToScVal(BigInt(value), { type: "i64" });
  }
  if (type === "uint128") {
    return stellarSdk.nativeToScVal(BigInt(value), { type: "u128" });
  }
  if (type === "int128") {
    return stellarSdk.nativeToScVal(BigInt(value), { type: "i128" });
  }
  if (type === "uint32") {
    return stellarSdk.nativeToScVal(Number(value), { type: "u32" });
  }
  if (type === "int32") {
    return stellarSdk.nativeToScVal(Number(value), { type: "i32" });
  }
  if (type === "bool") {
    return stellarSdk.nativeToScVal(Boolean(value), { type: "bool" });
  }
  if (type === "string") {
    return stellarSdk.nativeToScVal(String(value), { type: "string" });
  }
  if (type === "bytes" || type.startsWith("bytes")) {
    const bytes = Buffer.from(value.replace(/^0x/, ""), "hex");
    return stellarSdk.xdr.ScVal.scvBytes(bytes);
  }
  return stellarSdk.nativeToScVal(String(value), { type: "string" });
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
    this.sorobanClient = new stellarSdk.rpc.Server(this.network.sorobanRpcUrl);
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
    const contract = new stellarSdk.Contract(this.contractId);
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
    const transaction = new stellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(operation).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (stellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Contract call simulation failed: ${simulation.error}`,
        4002 /* CONTRACT_REVERT */,
        { error: simulation.error }
      );
    }
    let result = void 0;
    if (stellarSdk.rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
      result = stellarSdk.scValToNative(simulation.result.retval);
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
    const contract = new stellarSdk.Contract(this.contractId);
    const operation = contract.call(functionName, ...scArgs);
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);
    let transaction = new stellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(operation).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (stellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Transaction simulation failed: ${simulation.error}`,
        4002 /* CONTRACT_REVERT */,
        { error: simulation.error }
      );
    }
    transaction = stellarSdk.rpc.assembleTransaction(
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
      returnValue = stellarSdk.scValToNative(txResult.returnValue);
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
    this.sorobanClient = new stellarSdk.rpc.Server(this.network.sorobanRpcUrl);
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
    const uploadOp = stellarSdk.Operation.uploadContractWasm({ wasm });
    let transaction = new stellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(uploadOp).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (stellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `WASM upload simulation failed: ${simulation.error}`,
        1001 /* COMPILATION_FAILED */,
        { error: simulation.error }
      );
    }
    transaction = stellarSdk.rpc.assembleTransaction(transaction, simulation).build();
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
    const wasmHash = sha3.keccak_256(wasm);
    return Buffer.from(wasmHash).toString("hex");
  }
  /**
   * Creates a contract instance from uploaded WASM
   */
  async createInstance(wasmHash, signer, _abi, _constructorArgs) {
    const account = await this.sorobanClient.getAccount(signer.stellarAddress);
    const createOp = stellarSdk.Operation.createCustomContract({
      address: stellarSdk.Address.fromString(signer.stellarAddress),
      wasmHash: Buffer.from(wasmHash, "hex"),
      salt: Buffer.from(sha3.keccak_256(new TextEncoder().encode(Date.now().toString())))
    });
    let transaction = new stellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.network.networkPassphrase
    }).addOperation(createOp).setTimeout(30).build();
    const simulation = await this.sorobanClient.simulateTransaction(transaction);
    if (stellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new TVAError(
        `Contract creation simulation failed: ${simulation.error}`,
        1001 /* COMPILATION_FAILED */,
        { error: simulation.error }
      );
    }
    transaction = stellarSdk.rpc.assembleTransaction(transaction, simulation).build();
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
    const contractIdBytes = sha3.keccak_256(
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
function hexToBytes(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes, prefix = true) {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return prefix ? `0x${hex}` : hex;
}
function keccak256(data) {
  const input = typeof data === "string" ? hexToBytes(data) : data;
  const hash = sha3.keccak_256(input);
  return bytesToHex(hash);
}
function padHex(hex, length, side = "left") {
  const cleanHex = hex.replace(/^0x/, "");
  const padded = side === "left" ? cleanHex.padStart(length, "0") : cleanHex.padEnd(length, "0");
  return `0x${padded}`;
}
function formatUnits(value, decimals) {
  const negative = value < 0n;
  const absValue = negative ? -value : value;
  const str = absValue.toString().padStart(decimals + 1, "0");
  const integerPart = str.slice(0, -decimals) || "0";
  const decimalPart = str.slice(-decimals);
  const trimmedDecimal = decimalPart.replace(/0+$/, "");
  const result = trimmedDecimal ? `${integerPart}.${trimmedDecimal}` : integerPart;
  return negative ? `-${result}` : result;
}
function parseUnits(value, decimals) {
  const negative = value.startsWith("-");
  const cleanValue = negative ? value.slice(1) : value;
  const [integerPart, decimalPart = ""] = cleanValue.split(".");
  const paddedDecimal = decimalPart.padEnd(decimals, "0").slice(0, decimals);
  const combined = integerPart + paddedDecimal;
  const result = BigInt(combined);
  return negative ? -result : result;
}
function formatXlm(stroops) {
  return formatUnits(stroops, 7);
}
function parseXlm(xlm) {
  return parseUnits(xlm, 7);
}
function formatEth(wei) {
  return formatUnits(wei, 18);
}
function parseEth(eth) {
  return parseUnits(eth, 18);
}
function isValidEvmAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}
function isValidStellarAddress(address) {
  return /^G[A-Z2-7]{55}$/.test(address);
}
function isValidContractId(address) {
  return /^C[A-Z2-7]{55}$/.test(address);
}
function checksumAddress(address) {
  const addr = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak256(new TextEncoder().encode(addr)).replace(/^0x/, "");
  let checksummed = "0x";
  for (let i = 0; i < addr.length; i++) {
    if (parseInt(hash[i], 16) >= 8) {
      checksummed += addr[i].toUpperCase();
    } else {
      checksummed += addr[i];
    }
  }
  return checksummed;
}
function isValidChecksumAddress(address) {
  if (!isValidEvmAddress(address)) return false;
  return address === checksumAddress(address);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1e3,
    maxDelay = 3e4,
    shouldRetry = () => true
  } = options;
  let lastError;
  let delay = initialDelay;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }
      await sleep(delay);
      delay = Math.min(delay * 2, maxDelay);
    }
  }
  throw lastError;
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

exports.ContractDeployer = ContractDeployer;
exports.EvmSigner = EvmSigner;
exports.NETWORKS = NETWORKS;
exports.RpcClient = RpcClient;
exports.SolangCompiler = SolangCompiler;
exports.StellarSigner = StellarSigner;
exports.TVAContract = TVAContract;
exports.TVAError = TVAError;
exports.TVAErrorCode = TVAErrorCode;
exports.TVASigner = TVASigner;
exports.TVA_CHAIN_ID = TVA_CHAIN_ID;
exports.TypedContract = TypedContract;
exports.bytesToHex = bytesToHex;
exports.checksumAddress = checksumAddress;
exports.chunk = chunk;
exports.compileFile = compileFile;
exports.compileSource = compileSource;
exports.contractIdToEvmAddress = contractIdToEvmAddress;
exports.createRpcClient = createRpcClient;
exports.deferred = deferred;
exports.deriveKeyPairFromEvmPrivateKey = deriveKeyPairFromEvmPrivateKey;
exports.deriveKeyPairFromMnemonic = deriveKeyPairFromMnemonic;
exports.encodeFunctionCall = encodeFunctionCall;
exports.evmAddressToContractId = evmAddressToContractId;
exports.formatEth = formatEth;
exports.formatUnits = formatUnits;
exports.formatXlm = formatXlm;
exports.generateMnemonic = generateMnemonic2;
exports.generateRandomKeyPair = generateRandomKeyPair;
exports.getEvmAddress = getEvmAddress;
exports.getFunctionSelector = getFunctionSelector;
exports.getFunctionSignature = getFunctionSignature;
exports.getStellarAddress = getStellarAddress;
exports.hexToBytes = hexToBytes;
exports.isValidChecksumAddress = isValidChecksumAddress;
exports.isValidContractId = isValidContractId;
exports.isValidEvmAddress = isValidEvmAddress;
exports.isValidStellarAddress = isValidStellarAddress;
exports.keccak256 = keccak256;
exports.padHex = padHex;
exports.parseEth = parseEth;
exports.parseUnits = parseUnits;
exports.parseXlm = parseXlm;
exports.publicKeyToEvmAddress = publicKeyToEvmAddress;
exports.publicKeyToStellarAddress = publicKeyToStellarAddress;
exports.retry = retry;
exports.sleep = sleep;
exports.validateMnemonic = validateMnemonic2;
exports.verifyEvmAddress = verifyEvmAddress;
exports.verifyStellarAddress = verifyStellarAddress;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map