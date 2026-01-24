'use strict';

var config = require('hardhat/config');
var sdk = require('@tva-protocol/sdk');
var path2 = require('path');
var fs2 = require('fs/promises');

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

var path2__namespace = /*#__PURE__*/_interopNamespace(path2);
var fs2__namespace = /*#__PURE__*/_interopNamespace(fs2);

// src/index.ts

// src/config/index.ts
var defaultTVAConfig = {
  solangPath: "",
  optimizationLevel: 2,
  defaultNetwork: "testnet",
  artifactsDir: "artifacts/tva",
  autoVerify: false,
  importPaths: []
};
function resolveTVAConfig(userConfig) {
  return {
    ...defaultTVAConfig,
    ...userConfig
  };
}
var tvaNetworks = {
  tvaTestnet: {
    url: "https://rpc.testnet.tva-protocol.io",
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    chainId: 5522753
  },
  tvaMainnet: {
    url: "https://rpc.tva-protocol.io",
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    chainId: 5527105
  },
  tvaLocal: {
    url: "http://localhost:8545",
    horizonUrl: "http://localhost:8000",
    sorobanRpcUrl: "http://localhost:8001",
    networkPassphrase: "Standalone Network ; February 2017",
    chainId: 5527040
  }
};
var artifactCache = /* @__PURE__ */ new Map();
async function loadArtifact(name, hre) {
  const cacheKey = `${hre.config.paths.root}:${name}`;
  const cached = artifactCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const artifactsDir = path2__namespace.join(
    hre.config.paths.root,
    hre.config.tva.artifactsDir
  );
  const contractDir = path2__namespace.join(artifactsDir, name);
  const artifactPath = path2__namespace.join(contractDir, `${name}.json`);
  const wasmPath = path2__namespace.join(contractDir, `${name}.wasm`);
  try {
    await fs2__namespace.access(artifactPath);
  } catch {
    throw new Error(
      `Contract artifact not found for "${name}". Make sure the contract has been compiled with "npx hardhat tva:compile".`
    );
  }
  const artifactContent = await fs2__namespace.readFile(artifactPath, "utf-8");
  const artifact = JSON.parse(artifactContent);
  const wasm = await fs2__namespace.readFile(wasmPath);
  const compiledContract = {
    name: artifact.contractName,
    sourcePath: artifact.sourceName,
    wasmPath,
    wasm: wasm.toString("base64"),
    abi: artifact.abi,
    spec: artifact.spec || []
  };
  artifactCache.set(cacheKey, compiledContract);
  return compiledContract;
}
var TASK_TVA_COMPILE = "tva:compile";
var SUBTASK_TVA_COMPILE_GET_SOURCES = "tva:compile:get-sources";
var SUBTASK_TVA_COMPILE_SOLANG = "tva:compile:solang";
var SUBTASK_TVA_COMPILE_GENERATE_ARTIFACTS = "tva:compile:generate-artifacts";
config.subtask(SUBTASK_TVA_COMPILE_GET_SOURCES).setDescription("Gets all Solidity source files for TVA compilation").setAction(async (_, hre) => {
  const sourcePaths = hre.config.paths.sources;
  const sources = [];
  async function findSolFiles(dir) {
    try {
      const entries = await fs2__namespace.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path2__namespace.join(dir, entry.name);
        if (entry.isDirectory()) {
          await findSolFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".sol")) {
          sources.push(fullPath);
        }
      }
    } catch (error) {
    }
  }
  await findSolFiles(sourcePaths);
  return sources;
});
config.subtask(SUBTASK_TVA_COMPILE_SOLANG).setDescription("Compiles Solidity sources using Solang for Soroban").addParam("sources", "Array of source file paths").setAction(async ({ sources }, hre) => {
  const config = hre.config.tva;
  const compiler = new sdk.SolangCompiler({
    solangPath: config.solangPath || void 0,
    optimizationLevel: config.optimizationLevel,
    importPaths: [
      hre.config.paths.sources,
      path2__namespace.join(hre.config.paths.root, "node_modules"),
      ...config.importPaths
    ]
  });
  console.log(`Compiling ${sources.length} Solidity file(s) with Solang...`);
  const results = [];
  const errors = [];
  for (const sourcePath of sources) {
    try {
      console.log(`  Compiling ${path2__namespace.basename(sourcePath)}...`);
      const contracts = await compiler.compileFile(sourcePath);
      results.push(...contracts);
      for (const contract of contracts) {
        if (contract.warnings.length > 0) {
          console.log(`    Warnings for ${contract.name}:`);
          contract.warnings.forEach((w) => console.log(`      ${w}`));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${sourcePath}: ${message}`);
      console.error(`  Error compiling ${path2__namespace.basename(sourcePath)}: ${message}`);
    }
  }
  if (errors.length > 0) {
    console.error(`
Compilation failed with ${errors.length} error(s)`);
  } else {
    console.log(`
Compiled ${results.length} contract(s) successfully`);
  }
  return results;
});
config.subtask(SUBTASK_TVA_COMPILE_GENERATE_ARTIFACTS).setDescription("Generates Hardhat-compatible artifacts from compiled contracts").addParam("contracts", "Array of compiled contracts").setAction(async ({ contracts }, hre) => {
  const artifactsDir = path2__namespace.join(
    hre.config.paths.root,
    hre.config.tva.artifactsDir
  );
  await fs2__namespace.mkdir(artifactsDir, { recursive: true });
  const artifacts = [];
  for (const contract of contracts) {
    const contractDir = path2__namespace.join(artifactsDir, contract.name);
    await fs2__namespace.mkdir(contractDir, { recursive: true });
    const wasmPath = path2__namespace.join(contractDir, `${contract.name}.wasm`);
    await fs2__namespace.writeFile(wasmPath, contract.wasm);
    const abiPath = path2__namespace.join(contractDir, `${contract.name}.json`);
    const abiEntries = [
      ...contract.abi.functions.map((f) => ({
        type: f.type,
        name: f.name,
        inputs: f.inputs,
        outputs: f.outputs,
        stateMutability: f.stateMutability
      })),
      ...contract.abi.events.map((e) => ({
        type: "event",
        name: e.name,
        inputs: e.inputs,
        anonymous: e.anonymous
      })),
      ...contract.abi.errors.map((e) => ({
        type: "error",
        name: e.name,
        inputs: e.inputs
      }))
    ];
    const artifact = {
      _format: "tva-artifact-1",
      contractName: contract.name,
      sourceName: contract.sourcePath,
      abi: abiEntries,
      wasm: contract.wasm.toString("base64"),
      spec: contract.spec,
      deployedBytecode: "",
      // Not applicable for WASM
      bytecode: "",
      // Not applicable for WASM
      linkReferences: {},
      deployedLinkReferences: {}
    };
    await fs2__namespace.writeFile(abiPath, JSON.stringify(artifact, null, 2));
    artifacts.push({
      name: contract.name,
      sourcePath: contract.sourcePath,
      wasmPath,
      wasm: contract.wasm.toString("base64"),
      abi: artifact.abi,
      spec: contract.spec
    });
  }
  return artifacts;
});
config.task(TASK_TVA_COMPILE, "Compiles Solidity contracts for TVA/Soroban using Solang").addFlag("force", "Force recompilation of all contracts").addFlag("quiet", "Suppress compilation output").setAction(async ({ force: _force, quiet }, hre) => {
  if (!quiet) {
    console.log("\n========================================");
    console.log("TVA Protocol - Solang Compilation");
    console.log("========================================\n");
  }
  const sources = await hre.run(SUBTASK_TVA_COMPILE_GET_SOURCES);
  if (sources.length === 0) {
    if (!quiet) {
      console.log("No Solidity files found to compile.");
    }
    return {
      contracts: [],
      warnings: [],
      errors: []
    };
  }
  const compiledContracts = await hre.run(SUBTASK_TVA_COMPILE_SOLANG, {
    sources
  });
  const artifacts = await hre.run(SUBTASK_TVA_COMPILE_GENERATE_ARTIFACTS, {
    contracts: compiledContracts
  });
  const warnings = [];
  for (const contract of compiledContracts) {
    warnings.push(...contract.warnings);
  }
  if (!quiet) {
    console.log("\n========================================");
    console.log(`Artifacts written to: ${hre.config.tva.artifactsDir}`);
    console.log("========================================\n");
  }
  return {
    contracts: artifacts,
    warnings,
    errors: []
  };
});
config.task("compile", "Compiles the entire project").setAction(async (args, hre, runSuper) => {
  await runSuper(args);
  console.log("\nRunning TVA compilation...");
  await hre.run(TASK_TVA_COMPILE, { quiet: args.quiet });
});
var TASK_TVA_DEPLOY = "tva:deploy";
var SUBTASK_TVA_GET_SIGNERS = "tva:get-signers";
var SUBTASK_TVA_GET_CONTRACT_FACTORY = "tva:get-contract-factory";
config.subtask(SUBTASK_TVA_GET_SIGNERS).setDescription("Gets TVA signers from network configuration").setAction(async (_, hre) => {
  const networkConfig = hre.network.config;
  const accounts = networkConfig.accounts;
  const networkType = getNetworkType(hre);
  const signers = [];
  if (!accounts) {
    console.warn("No accounts configured for this network");
    return signers;
  }
  if (Array.isArray(accounts)) {
    for (const account of accounts) {
      const keyPair = account.startsWith("0x") ? sdk.deriveKeyPairFromEvmPrivateKey(account) : await sdk.deriveKeyPairFromMnemonic(account);
      signers.push(new sdk.TVASigner(keyPair, networkType));
    }
  } else if (typeof accounts === "object" && accounts.mnemonic) {
    const { mnemonic, initialIndex = 0, count = 10 } = accounts;
    for (let i = initialIndex; i < initialIndex + count; i++) {
      const keyPair = await sdk.deriveKeyPairFromMnemonic(mnemonic, i);
      signers.push(new sdk.TVASigner(keyPair, networkType));
    }
  }
  return signers;
});
config.subtask(SUBTASK_TVA_GET_CONTRACT_FACTORY).setDescription("Gets a contract factory for deployment").addParam("name", "Contract name").setAction(async ({ name }, hre) => {
  const artifactsDir = path2__namespace.join(
    hre.config.paths.root,
    hre.config.tva.artifactsDir
  );
  const contractDir = path2__namespace.join(artifactsDir, name);
  const artifactPath = path2__namespace.join(contractDir, `${name}.json`);
  const wasmPath = path2__namespace.join(contractDir, `${name}.wasm`);
  try {
    await fs2__namespace.access(artifactPath);
  } catch {
    throw new Error(
      `Contract artifact not found for "${name}". Run "npx hardhat tva:compile" first.`
    );
  }
  const artifactContent = await fs2__namespace.readFile(artifactPath, "utf-8");
  const artifact = JSON.parse(artifactContent);
  const wasm = await fs2__namespace.readFile(wasmPath);
  const networkType = getNetworkType(hre);
  const deployer = new sdk.ContractDeployer(networkType);
  const factory = {
    name,
    abi: artifact.abi,
    async deploy(...args) {
      const signers = await hre.run(SUBTASK_TVA_GET_SIGNERS);
      if (signers.length === 0) {
        throw new Error("No signers available for deployment");
      }
      const signer = signers[0];
      console.log(`Deploying ${name} with account: ${signer.evmAddress}`);
      const compiledContract = {
        name,
        wasm,
        abi: {
          name,
          functions: artifact.abi.filter((e) => e.type === "function"),
          events: artifact.abi.filter((e) => e.type === "event"),
          errors: artifact.abi.filter((e) => e.type === "error")
        },
        spec: artifact.spec || [],
        sourcePath: artifact.sourceName,
        warnings: []
      };
      const result = await deployer.deploy(compiledContract, signer, args);
      console.log(`Contract deployed!`);
      console.log(`  EVM Address: ${result.evmAddress}`);
      console.log(`  Contract ID: ${result.contractId}`);
      console.log(`  Tx Hash: ${result.stellarTxHash}`);
      return createContractInstance(
        name,
        result.evmAddress,
        result.contractId,
        artifact.abi,
        signer,
        networkType
      );
    },
    attach(address) {
      const contractId = `C${"0".repeat(55)}`;
      const signers = hre.run(SUBTASK_TVA_GET_SIGNERS);
      const signer = signers[0];
      return createContractInstance(
        name,
        address,
        contractId,
        artifact.abi,
        signer,
        networkType
      );
    }
  };
  return factory;
});
config.task(TASK_TVA_DEPLOY, "Deploys a contract to TVA/Soroban").addPositionalParam("contract", "Contract name to deploy").addOptionalVariadicPositionalParam("args", "Constructor arguments", []).setAction(async ({ contract, args }, hre) => {
  console.log("\n========================================");
  console.log("TVA Protocol - Contract Deployment");
  console.log("========================================\n");
  const factory = await hre.run(SUBTASK_TVA_GET_CONTRACT_FACTORY, {
    name: contract
  });
  const instance = await factory.deploy(...args);
  console.log("\n========================================");
  console.log("Deployment complete!");
  console.log("========================================\n");
  return instance;
});
function getNetworkType(hre) {
  const networkName = hre.network.name.toLowerCase();
  if (networkName.includes("mainnet")) {
    return "mainnet";
  } else if (networkName.includes("local") || networkName === "hardhat") {
    return "local";
  }
  return "testnet";
}
function createContractInstance(name, address, contractId, abi, signer, networkType) {
  const instance = {
    address,
    contractId,
    abi,
    async waitForDeployment() {
      return this;
    },
    deploymentTransaction() {
      return null;
    }
  };
  for (const entry of abi) {
    if (entry.type === "function") {
      instance[entry.name] = async (...args) => {
        const { TVAContract: TVAContract2 } = await import('@tva-protocol/sdk');
        const contract = new TVAContract2(
          contractId,
          {
            name,
            functions: abi.filter((e) => e.type === "function"),
            events: abi.filter((e) => e.type === "event"),
            errors: abi.filter((e) => e.type === "error")
          },
          networkType
        );
        const isView = entry.stateMutability === "view" || entry.stateMutability === "pure";
        if (isView) {
          return contract.call(entry.name, args, signer);
        } else {
          return contract.send(entry.name, args, signer);
        }
      };
    }
  }
  return instance;
}

// src/index.ts
config.extendConfig(
  (config, userConfig) => {
    config.tva = resolveTVAConfig(userConfig.tva);
  }
);
config.extendEnvironment((hre) => {
  const getNetworkType2 = () => {
    const networkName = hre.network.name.toLowerCase();
    if (networkName.includes("mainnet")) return "mainnet";
    if (networkName.includes("local") || networkName === "hardhat") return "local";
    return "testnet";
  };
  hre.tva = {
    /**
     * Compiles all Solidity files using Solang
     */
    async compile() {
      return hre.run("tva:compile", { quiet: false });
    },
    /**
     * Gets a contract factory for deployment
     */
    async getContractFactory(name) {
      return hre.run("tva:get-contract-factory", { name });
    },
    /**
     * Gets a deployed contract instance
     */
    async getContractAt(name, _address) {
      const artifact = await loadArtifact(name, hre);
      const networkType = getNetworkType2();
      const signers = await hre.tva.getSigners();
      const contractId = `C${"0".repeat(55)}`;
      const contract = new sdk.TVAContract(
        contractId,
        {
          name: artifact.name,
          functions: artifact.abi.filter((e) => e.type === "function"),
          events: artifact.abi.filter((e) => e.type === "event"),
          errors: artifact.abi.filter((e) => e.type === "error")
        },
        networkType
      );
      if (signers.length > 0) {
        return contract.connect(signers[0]);
      }
      return contract;
    },
    /**
     * Gets the current signer
     */
    async getSigner(index = 0) {
      const signers = await hre.tva.getSigners();
      if (index >= signers.length) {
        throw new Error(`Signer index ${index} out of range`);
      }
      return signers[index];
    },
    /**
     * Gets all configured signers
     */
    async getSigners() {
      const networkConfig = hre.network.config;
      const accounts = networkConfig.accounts;
      const networkType = getNetworkType2();
      const signers = [];
      if (!accounts) {
        return signers;
      }
      if (Array.isArray(accounts)) {
        for (const account of accounts) {
          const keyPair = account.startsWith("0x") ? sdk.deriveKeyPairFromEvmPrivateKey(account) : await sdk.deriveKeyPairFromMnemonic(account);
          const signer = new sdk.TVASigner(keyPair, networkType);
          signers.push({
            address: signer.evmAddress,
            stellarAddress: signer.stellarAddress,
            async signMessage(message) {
              return signer.signMessage(message);
            },
            async getBalance() {
              return BigInt(0);
            }
          });
        }
      } else if (typeof accounts === "object" && accounts.mnemonic) {
        const { mnemonic, initialIndex = 0, count = 10 } = accounts;
        for (let i = initialIndex; i < initialIndex + count; i++) {
          const keyPair = await sdk.deriveKeyPairFromMnemonic(mnemonic, i);
          const signer = new sdk.TVASigner(keyPair, networkType);
          signers.push({
            address: signer.evmAddress,
            stellarAddress: signer.stellarAddress,
            async signMessage(message) {
              return signer.signMessage(message);
            },
            async getBalance() {
              return BigInt(0);
            }
          });
        }
      }
      return signers;
    }
  };
});
function createSampleConfig() {
  return `
require("@tva-protocol/hardhat-plugin");

module.exports = {
  solidity: "0.8.24",

  tva: {
    // Path to Solang compiler (auto-detected if not specified)
    // solangPath: "/path/to/solang",

    // Optimization level (0-3)
    optimizationLevel: 2,

    // Default network for deployments
    defaultNetwork: "testnet",

    // Output directory for compiled artifacts
    artifactsDir: "artifacts/tva",
  },

  networks: {
    tvaTestnet: {
      url: "https://rpc.testnet.tva-protocol.io",
      accounts: {
        mnemonic: "your mnemonic phrase here",
      },
      tva: {
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
        chainId: 0x544541,
      },
    },
    tvaMainnet: {
      url: "https://rpc.tva-protocol.io",
      accounts: {
        mnemonic: "your mnemonic phrase here",
      },
      tva: {
        horizonUrl: "https://horizon.stellar.org",
        sorobanRpcUrl: "https://soroban.stellar.org",
        networkPassphrase: "Public Global Stellar Network ; September 2015",
        chainId: 0x545641,
      },
    },
  },
};
`.trim();
}

exports.createSampleConfig = createSampleConfig;
exports.tvaNetworks = tvaNetworks;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map