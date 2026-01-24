'use strict';

var ethers = require('ethers');
var sdk = require('@tva-protocol/sdk');

// src/provider.ts
var TVA_NETWORK = new ethers.Network("TVA Protocol", sdk.TVA_CHAIN_ID);
var TVAProvider = class extends ethers.JsonRpcProvider {
  tvaNetwork;
  constructor(options = {}) {
    const networkType = typeof options.network === "string" && options.network.startsWith("http") ? "testnet" : options.network || "testnet";
    const rpcUrl = typeof options.network === "string" && options.network.startsWith("http") ? options.network : sdk.NETWORKS[networkType].rpcUrl;
    const network = new ethers.Network("TVA Protocol", sdk.TVA_CHAIN_ID);
    super(rpcUrl, network, {
      staticNetwork: options.staticNetwork !== false ? network : void 0,
      polling: true,
      pollingInterval: options.pollingInterval || 5e3
    });
    this.tvaNetwork = networkType;
  }
  /**
   * Gets the TVA network type
   */
  getTVANetwork() {
    return this.tvaNetwork;
  }
  /**
   * Gets the Stellar/Soroban RPC URL for direct access if needed
   */
  getSorobanRpcUrl() {
    return sdk.NETWORKS[this.tvaNetwork].sorobanRpcUrl;
  }
  /**
   * Override to handle TVA-specific block formatting
   */
  async getBlock(blockHashOrBlockTag, prefetchTxs) {
    const block = await super.getBlock(blockHashOrBlockTag, prefetchTxs);
    if (!block) {
      return null;
    }
    return block;
  }
  /**
   * Override to handle TVA-specific transaction receipt formatting
   */
  async getTransactionReceipt(hash) {
    const receipt = await super.getTransactionReceipt(hash);
    return receipt;
  }
  /**
   * Override to handle TVA-specific gas estimation
   * TVA converts Soroban resources to gas units
   */
  async estimateGas(tx) {
    const gas = await super.estimateGas(tx);
    return gas;
  }
  /**
   * Gets the native XLM balance of an address
   * Note: Returns balance in wei-equivalent (18 decimals) for ethers.js compatibility
   */
  async getXlmBalance(address) {
    return this.getBalance(address);
  }
  /**
   * Waits for a transaction to be included in a block
   * Override to use TVA's faster block times (~5 seconds)
   */
  async waitForTransaction(hash, _confirms, timeout) {
    const timeoutMs = timeout || 6e4;
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const receipt = await this.getTransactionReceipt(hash);
      if (receipt) {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }
    return null;
  }
  /**
   * Checks if the provider is connected to the TVA RPC
   */
  async isConnected() {
    try {
      await this.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Gets TVA-specific network information
   */
  async getTVANetworkInfo() {
    const [chainId, blockNumber, gasPrice] = await Promise.all([
      this.send("eth_chainId", []),
      this.getBlockNumber(),
      this.getFeeData()
    ]);
    return {
      chainId: parseInt(chainId, 16),
      networkType: this.tvaNetwork,
      blockNumber,
      gasPrice: gasPrice.gasPrice || BigInt(0)
    };
  }
};
function createTVAProvider(networkOrUrl = "testnet", options = {}) {
  return new TVAProvider({
    ...options,
    network: networkOrUrl
  });
}
function getDefaultProvider() {
  return createTVAProvider("testnet");
}
var TVASigner = class _TVASigner extends ethers.AbstractSigner {
  evmWallet;
  stellarSecretKey;
  constructor(options, provider) {
    super(provider);
    const privateKey = options.privateKey.startsWith("0x") ? options.privateKey : `0x${options.privateKey}`;
    this.evmWallet = new ethers.Wallet(privateKey);
    this.stellarSecretKey = options.stellarSecretKey;
  }
  /**
   * Gets the EVM address of this signer
   */
  async getAddress() {
    return this.evmWallet.address;
  }
  /**
   * Connects this signer to a provider
   */
  connect(provider) {
    return new _TVASigner(
      {
        privateKey: this.evmWallet.privateKey,
        stellarSecretKey: this.stellarSecretKey
      },
      provider
    );
  }
  /**
   * Signs a message using the EVM private key
   */
  async signMessage(message) {
    return this.evmWallet.signMessage(message);
  }
  /**
   * Signs typed data (EIP-712)
   */
  async signTypedData(domain, types, value) {
    return this.evmWallet.signTypedData(domain, types, value);
  }
  /**
   * Signs a transaction
   */
  async signTransaction(tx) {
    const txLike = {
      type: tx.type ?? 0,
      chainId: tx.chainId ?? void 0,
      nonce: tx.nonce ?? void 0,
      gasLimit: tx.gasLimit ?? void 0,
      gasPrice: tx.gasPrice ?? void 0,
      maxFeePerGas: tx.maxFeePerGas ?? void 0,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? void 0,
      to: tx.to ? await ethers.resolveAddress(tx.to, this.provider) : null,
      value: tx.value ?? 0n,
      data: tx.data ?? "0x",
      accessList: tx.accessList ?? void 0
    };
    if (txLike.chainId === void 0 && this.provider) {
      const network = await this.provider.getNetwork();
      txLike.chainId = network.chainId;
    }
    if (txLike.nonce === void 0 && this.provider) {
      txLike.nonce = await this.provider.getTransactionCount(
        await this.getAddress()
      );
    }
    if (!txLike.gasPrice && !txLike.maxFeePerGas && this.provider) {
      const feeData = await this.provider.getFeeData();
      if (feeData.gasPrice) {
        txLike.gasPrice = feeData.gasPrice;
      }
    }
    if (!txLike.gasLimit && this.provider) {
      txLike.gasLimit = await this.provider.estimateGas({
        from: await this.getAddress(),
        to: txLike.to ?? void 0,
        data: txLike.data,
        value: txLike.value
      });
    }
    const transaction = ethers.Transaction.from(txLike);
    const signature = this.evmWallet.signingKey.sign(transaction.unsignedHash);
    transaction.signature = signature;
    return transaction.serialized;
  }
  /**
   * Sends a transaction
   */
  async sendTransaction(tx) {
    if (!this.provider) {
      throw new Error("No provider connected");
    }
    const signedTx = await this.signTransaction(tx);
    return this.provider.broadcastTransaction(signedTx);
  }
  /**
   * Gets the Stellar secret key if available
   */
  getStellarSecretKey() {
    return this.stellarSecretKey;
  }
  /**
   * Gets the underlying signing key
   */
  get signingKey() {
    return this.evmWallet.signingKey;
  }
};
function createTVASigner(privateKey, provider) {
  return new TVASigner({ privateKey }, provider);
}
function createDualKeySigner(evmPrivateKey, stellarSecretKey, provider) {
  return new TVASigner(
    {
      privateKey: evmPrivateKey,
      stellarSecretKey
    },
    provider
  );
}

Object.defineProperty(exports, "Contract", {
  enumerable: true,
  get: function () { return ethers.Contract; }
});
Object.defineProperty(exports, "ContractFactory", {
  enumerable: true,
  get: function () { return ethers.ContractFactory; }
});
Object.defineProperty(exports, "Interface", {
  enumerable: true,
  get: function () { return ethers.Interface; }
});
Object.defineProperty(exports, "formatEther", {
  enumerable: true,
  get: function () { return ethers.formatEther; }
});
Object.defineProperty(exports, "formatUnits", {
  enumerable: true,
  get: function () { return ethers.formatUnits; }
});
Object.defineProperty(exports, "getAddress", {
  enumerable: true,
  get: function () { return ethers.getAddress; }
});
Object.defineProperty(exports, "hexlify", {
  enumerable: true,
  get: function () { return ethers.hexlify; }
});
Object.defineProperty(exports, "isAddress", {
  enumerable: true,
  get: function () { return ethers.isAddress; }
});
Object.defineProperty(exports, "keccak256", {
  enumerable: true,
  get: function () { return ethers.keccak256; }
});
Object.defineProperty(exports, "parseEther", {
  enumerable: true,
  get: function () { return ethers.parseEther; }
});
Object.defineProperty(exports, "parseUnits", {
  enumerable: true,
  get: function () { return ethers.parseUnits; }
});
Object.defineProperty(exports, "toUtf8Bytes", {
  enumerable: true,
  get: function () { return ethers.toUtf8Bytes; }
});
exports.TVAProvider = TVAProvider;
exports.TVASigner = TVASigner;
exports.TVA_NETWORK = TVA_NETWORK;
exports.createDualKeySigner = createDualKeySigner;
exports.createTVAProvider = createTVAProvider;
exports.createTVASigner = createTVASigner;
exports.getDefaultProvider = getDefaultProvider;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map