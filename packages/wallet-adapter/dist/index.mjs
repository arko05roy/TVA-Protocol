import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { EventEmitter } from 'eventemitter3';

// src/keys/derivation.ts
var TVA_KEY_DERIVATION_DOMAIN = "TVA-STELLAR-KEY-DERIVATION-V1";
function deriveStellarKeypairFromEvmKey(evmPrivateKey) {
  const privateKeyBytes = Buffer.from(
    evmPrivateKey.replace(/^0x/, ""),
    "hex"
  );
  const seed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode(TVA_KEY_DERIVATION_DOMAIN),
      ...privateKeyBytes
    ])
  );
  return Keypair.fromRawEd25519Seed(Buffer.from(seed));
}
function deriveStellarKeypairFromSignature(signature) {
  const signatureBytes = Buffer.from(signature.replace(/^0x/, ""), "hex");
  const seed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode(TVA_KEY_DERIVATION_DOMAIN),
      ...signatureBytes
    ])
  );
  return Keypair.fromRawEd25519Seed(Buffer.from(seed));
}
function getKeyDerivationMessage(evmAddress, nonce = 0) {
  return [
    "TVA Protocol Key Derivation",
    "",
    "This signature will be used to derive your Stellar keypair.",
    "This allows you to use your Ethereum wallet with Stellar/Soroban.",
    "",
    "EVM Address: " + evmAddress,
    "Nonce: " + nonce,
    "",
    "WARNING: Only sign this message on trusted TVA Protocol applications.",
    "This signature can derive your Stellar private key."
  ].join("\n");
}
function getKeyDerivationTypedData(evmAddress, chainId, nonce = 0) {
  return {
    domain: {
      name: "TVA Protocol",
      version: "1",
      chainId,
      verifyingContract: "0x0000000000000000000000000000000000000000"
      // No contract
    },
    types: {
      KeyDerivation: [
        { name: "evmAddress", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "purpose", type: "string" }
      ]
    },
    primaryType: "KeyDerivation",
    message: {
      evmAddress,
      nonce,
      purpose: "Derive Stellar keypair for TVA Protocol"
    }
  };
}
function evmAddressToDisplayAddress(evmAddress) {
  return `TVA:${evmAddress.slice(2, 10).toUpperCase()}...${evmAddress.slice(-8).toUpperCase()}`;
}
async function validateDerivedAddress(evmAddress, stellarAddress, signFunction) {
  const message = getKeyDerivationMessage(evmAddress);
  const signature = await signFunction(message);
  const derivedKeypair = deriveStellarKeypairFromSignature(signature);
  return derivedKeypair.publicKey() === stellarAddress;
}
function stellarAddressToPublicKeyBytes(address) {
  return StrKey.decodeEd25519PublicKey(address);
}
function publicKeyBytesToStellarAddress(publicKey) {
  return StrKey.encodeEd25519PublicKey(Buffer.from(publicKey));
}
function computeEvmAddress(publicKey) {
  const key = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
  const hash = keccak_256(key);
  const addressBytes = hash.slice(-20);
  return `0x${Buffer.from(addressBytes).toString("hex")}`;
}
var TVAWalletAdapter = class extends EventEmitter {
  provider = null;
  stellarKeypair = null;
  evmAddress = null;
  chainId = null;
  isRegistered = false;
  /**
   * TVA network configuration
   */
  networkConfig;
  constructor(network = "testnet") {
    super();
    this.networkConfig = {
      type: network,
      rpcUrl: network === "testnet" ? "https://rpc.testnet.tva-protocol.io" : network === "mainnet" ? "https://rpc.tva-protocol.io" : "http://localhost:8545",
      horizonUrl: network === "testnet" ? "https://horizon-testnet.stellar.org" : network === "mainnet" ? "https://horizon.stellar.org" : "http://localhost:8000",
      sorobanRpcUrl: network === "testnet" ? "https://soroban-testnet.stellar.org" : network === "mainnet" ? "https://soroban.stellar.org" : "http://localhost:8001",
      networkPassphrase: network === "testnet" ? "Test SDF Network ; September 2015" : network === "mainnet" ? "Public Global Stellar Network ; September 2015" : "Standalone Network ; February 2017",
      chainId: network === "testnet" ? 5522753 : network === "mainnet" ? 5527105 : 5527040,
      nativeCurrency: {
        name: "Stellar Lumens",
        symbol: "XLM",
        decimals: 7
      }
    };
  }
  /**
   * Checks if MetaMask is available
   */
  isAvailable() {
    return typeof window !== "undefined" && !!window.ethereum;
  }
  /**
   * Gets the current connection state
   */
  getState() {
    return {
      connected: !!this.evmAddress,
      evmAddress: this.evmAddress,
      stellarAddress: this.stellarKeypair?.publicKey(),
      stellarKeypair: this.stellarKeypair,
      chainId: this.chainId,
      isRegistered: this.isRegistered
    };
  }
  /**
   * Connects to MetaMask and derives Stellar keypair
   */
  async connect() {
    if (!this.isAvailable()) {
      throw new Error("MetaMask is not installed");
    }
    this.provider = window.ethereum;
    try {
      const accounts = await this.provider.request({
        method: "eth_requestAccounts"
      });
      if (accounts.length === 0) {
        throw new Error("No accounts found");
      }
      this.evmAddress = accounts[0];
      this.chainId = parseInt(this.provider.chainId, 16);
      this.setupEventListeners();
      this.emit("connect", this.evmAddress);
      await this.deriveAndStoreStellarKey();
      return this.getState();
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }
  /**
   * Disconnects from the wallet
   */
  async disconnect() {
    this.evmAddress = null;
    this.stellarKeypair = null;
    this.chainId = null;
    this.isRegistered = false;
    if (this.provider) {
      this.removeEventListeners();
    }
    this.emit("disconnect");
  }
  /**
   * Derives the Stellar keypair by requesting a signature from MetaMask
   */
  async deriveAndStoreStellarKey() {
    if (!this.provider || !this.evmAddress) {
      throw new Error("Wallet not connected");
    }
    const message = getKeyDerivationMessage(this.evmAddress);
    const signature = await this.signMessage(message);
    this.stellarKeypair = deriveStellarKeypairFromSignature(signature);
    this.emit("stellarKeyDerived", this.stellarKeypair.publicKey());
    return this.stellarKeypair;
  }
  /**
   * Signs a message with MetaMask (personal_sign)
   */
  async signMessage(message) {
    if (!this.provider || !this.evmAddress) {
      throw new Error("Wallet not connected");
    }
    return this.provider.request({
      method: "personal_sign",
      params: [
        `0x${Buffer.from(message).toString("hex")}`,
        this.evmAddress
      ]
    });
  }
  /**
   * Signs typed data with MetaMask (EIP-712)
   */
  async signTypedData(typedData) {
    if (!this.provider || !this.evmAddress) {
      throw new Error("Wallet not connected");
    }
    return this.provider.request({
      method: "eth_signTypedData_v4",
      params: [this.evmAddress, JSON.stringify(typedData)]
    });
  }
  /**
   * Signs an EVM transaction
   */
  async signEvmTransaction(tx) {
    if (!this.provider) {
      throw new Error("Wallet not connected");
    }
    return this.provider.request({
      method: "eth_sendTransaction",
      params: [tx]
    });
  }
  /**
   * Signs a Stellar transaction using the derived keypair
   */
  signStellarTransaction(transaction) {
    if (!this.stellarKeypair) {
      throw new Error("Stellar keypair not derived. Call deriveAndStoreStellarKey() first.");
    }
    transaction.sign(this.stellarKeypair);
    return transaction;
  }
  /**
   * Signs arbitrary data with the Stellar keypair
   */
  signWithStellarKey(data) {
    if (!this.stellarKeypair) {
      throw new Error("Stellar keypair not derived");
    }
    return this.stellarKeypair.sign(Buffer.from(data));
  }
  /**
   * Switches to the TVA network in MetaMask
   */
  async switchToTVANetwork() {
    if (!this.provider) {
      throw new Error("Wallet not connected");
    }
    const chainIdHex = `0x${this.networkConfig.chainId.toString(16)}`;
    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }]
      });
    } catch (error) {
      if (error.code === 4902) {
        await this.addTVANetwork();
      } else {
        throw error;
      }
    }
  }
  /**
   * Adds the TVA network to MetaMask
   */
  async addTVANetwork() {
    if (!this.provider) {
      throw new Error("Wallet not connected");
    }
    const chainIdHex = `0x${this.networkConfig.chainId.toString(16)}`;
    await this.provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: `TVA Protocol ${this.networkConfig.type}`,
          nativeCurrency: this.networkConfig.nativeCurrency,
          rpcUrls: [this.networkConfig.rpcUrl],
          blockExplorerUrls: [`https://explorer.tva-protocol.io`]
        }
      ]
    });
  }
  /**
   * Gets the current chain ID
   */
  async getChainId() {
    if (!this.provider) {
      throw new Error("Wallet not connected");
    }
    const chainId = await this.provider.request({ method: "eth_chainId" });
    return parseInt(chainId, 16);
  }
  /**
   * Gets the connected accounts
   */
  async getAccounts() {
    if (!this.provider) {
      throw new Error("Wallet not connected");
    }
    return this.provider.request({ method: "eth_accounts" });
  }
  /**
   * Gets the balance of the connected account
   */
  async getBalance() {
    if (!this.provider || !this.evmAddress) {
      throw new Error("Wallet not connected");
    }
    const balance = await this.provider.request({
      method: "eth_getBalance",
      params: [this.evmAddress, "latest"]
    });
    return BigInt(balance);
  }
  /**
   * Sets up event listeners for MetaMask events
   */
  setupEventListeners() {
    if (!this.provider) return;
    this.provider.on("accountsChanged", this.handleAccountsChanged);
    this.provider.on("chainChanged", this.handleChainChanged);
    this.provider.on("disconnect", this.handleDisconnect);
  }
  /**
   * Removes event listeners
   */
  removeEventListeners() {
    if (!this.provider) return;
    this.provider.removeListener("accountsChanged", this.handleAccountsChanged);
    this.provider.removeListener("chainChanged", this.handleChainChanged);
    this.provider.removeListener("disconnect", this.handleDisconnect);
  }
  /**
   * Handles account changes
   */
  handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      this.disconnect();
    } else {
      this.evmAddress = accounts[0];
      this.stellarKeypair = null;
      this.emit("accountsChanged", accounts);
    }
  };
  /**
   * Handles chain changes
   */
  handleChainChanged = (chainId) => {
    this.chainId = parseInt(chainId, 16);
    this.emit("chainChanged", this.chainId);
  };
  /**
   * Handles disconnection
   */
  handleDisconnect = () => {
    this.disconnect();
  };
};
var walletAdapterInstance = null;
function getWalletAdapter(network = "testnet") {
  if (!walletAdapterInstance) {
    walletAdapterInstance = new TVAWalletAdapter(network);
  }
  return walletAdapterInstance;
}
function resetWalletAdapter() {
  if (walletAdapterInstance) {
    walletAdapterInstance.disconnect();
    walletAdapterInstance = null;
  }
}

export { TVAWalletAdapter, computeEvmAddress, deriveStellarKeypairFromEvmKey, deriveStellarKeypairFromSignature, evmAddressToDisplayAddress, getKeyDerivationMessage, getKeyDerivationTypedData, getWalletAdapter, publicKeyBytesToStellarAddress, resetWalletAdapter, stellarAddressToPublicKeyBytes, validateDerivedAddress };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map