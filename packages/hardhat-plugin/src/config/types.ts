/**
 * TVA Hardhat Plugin Configuration Types
 */

import type { NetworkType } from '@tva-protocol/sdk';

/**
 * TVA-specific configuration for Hardhat
 */
export interface TVAConfig {
  /**
   * Path to the Solang compiler binary.
   * If not specified, the plugin will search in standard locations.
   */
  solangPath?: string;

  /**
   * Compiler optimization level (0-3).
   * Default: 2
   */
  optimizationLevel?: number;

  /**
   * Default network for TVA deployments.
   * Default: 'testnet'
   */
  defaultNetwork?: NetworkType;

  /**
   * Output directory for compiled WASM artifacts.
   * Default: 'artifacts/tva'
   */
  artifactsDir?: string;

  /**
   * Enable automatic contract verification after deployment.
   * Default: false
   */
  autoVerify?: boolean;

  /**
   * Import paths for Solidity imports.
   */
  importPaths?: string[];
}

/**
 * TVA network configuration
 */
export interface TVANetworkConfig {
  /**
   * TVA RPC endpoint URL.
   */
  url: string;

  /**
   * Stellar Horizon URL.
   */
  horizonUrl?: string;

  /**
   * Stellar Soroban RPC URL.
   */
  sorobanRpcUrl?: string;

  /**
   * Network passphrase for Stellar transactions.
   */
  networkPassphrase?: string;

  /**
   * Chain ID for EVM compatibility.
   */
  chainId?: number;

  /**
   * Accounts to use for deployments.
   * Can be mnemonic, private keys (EVM format), or Stellar secret keys.
   */
  accounts?: string[] | {
    mnemonic: string;
    path?: string;
    initialIndex?: number;
    count?: number;
  };

  /**
   * Gas price settings (for EVM compatibility).
   */
  gasPrice?: number | 'auto';

  /**
   * Gas limit settings.
   */
  gas?: number | 'auto';
}

/**
 * Extended Hardhat config with TVA settings
 */
declare module 'hardhat/types/config' {
  interface HardhatUserConfig {
    tva?: TVAConfig;
  }

  interface HardhatConfig {
    tva: Required<TVAConfig>;
  }

  interface HttpNetworkUserConfig {
    tva?: TVANetworkConfig;
  }

  interface HttpNetworkConfig {
    tva?: TVANetworkConfig;
  }
}

/**
 * Extended Hardhat runtime environment
 */
declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    tva: {
      /**
       * Compiles all Solidity files using Solang for Soroban target.
       */
      compile: () => Promise<TVACompilationResult>;

      /**
       * Gets a contract factory for deployment.
       */
      getContractFactory: (name: string) => Promise<TVAContractFactory>;

      /**
       * Gets a deployed contract instance.
       */
      getContractAt: (name: string, address: string) => Promise<TVAContractInstance>;

      /**
       * Gets the current signer/account.
       */
      getSigner: (index?: number) => Promise<TVASigner>;

      /**
       * Gets all configured signers.
       */
      getSigners: () => Promise<TVASigner[]>;
    };
  }
}

/**
 * Result of TVA compilation
 */
export interface TVACompilationResult {
  /**
   * Compiled contracts.
   */
  contracts: TVACompiledContract[];

  /**
   * Compilation warnings.
   */
  warnings: string[];

  /**
   * Compilation errors (empty if successful).
   */
  errors: string[];
}

/**
 * Single compiled contract
 */
export interface TVACompiledContract {
  /**
   * Contract name.
   */
  name: string;

  /**
   * Source file path.
   */
  sourcePath: string;

  /**
   * WASM binary path.
   */
  wasmPath: string;

  /**
   * WASM binary (base64 encoded).
   */
  wasm: string;

  /**
   * Contract ABI.
   */
  abi: any[];

  /**
   * Soroban contract spec.
   */
  spec: any[];
}

/**
 * Contract factory for deployment
 */
export interface TVAContractFactory {
  /**
   * Contract name.
   */
  name: string;

  /**
   * Contract ABI.
   */
  abi: any[];

  /**
   * Deploys the contract.
   */
  deploy: (...args: unknown[]) => Promise<TVAContractInstance>;

  /**
   * Attaches to an existing contract.
   */
  attach: (address: string) => TVAContractInstance;
}

/**
 * Deployed contract instance
 */
export interface TVAContractInstance {
  /**
   * Contract address (EVM format).
   */
  address: string;

  /**
   * Contract ID (Soroban format).
   */
  contractId: string;

  /**
   * Contract ABI.
   */
  abi: any[];

  /**
   * Dynamic contract methods.
   */
  [method: string]: any;

  /**
   * Waits for deployment transaction.
   */
  waitForDeployment: () => Promise<TVAContractInstance>;

  /**
   * Gets the deployment transaction.
   */
  deploymentTransaction: () => any;
}

/**
 * TVA signer (wraps both EVM and Stellar keys)
 */
export interface TVASigner {
  /**
   * EVM address.
   */
  address: string;

  /**
   * Stellar address.
   */
  stellarAddress: string;

  /**
   * Signs a message.
   */
  signMessage: (message: string) => Promise<string>;

  /**
   * Gets account balance.
   */
  getBalance: () => Promise<bigint>;
}
