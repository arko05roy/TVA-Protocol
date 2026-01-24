'use strict';

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

exports.NETWORKS = NETWORKS;
exports.TVAError = TVAError;
exports.TVAErrorCode = TVAErrorCode;
exports.TVA_CHAIN_ID = TVA_CHAIN_ID;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map