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

export { RpcClient, createRpcClient };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map