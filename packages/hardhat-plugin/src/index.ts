/**
 * TVA Protocol Hardhat Plugin
 *
 * Enables seamless compilation and deployment of Solidity contracts
 * to TVA/Soroban using the Solang compiler.
 *
 * @packageDocumentation
 */

import { extendConfig, extendEnvironment } from 'hardhat/config';
import { HardhatConfig, HardhatUserConfig } from 'hardhat/types';
import {
  TVASigner,
  TVAContract,
  deriveKeyPairFromMnemonic,
  deriveKeyPairFromEvmPrivateKey,
  type NetworkType,
} from '@tva-protocol/sdk';
import { resolveTVAConfig } from './config/index.js';
import { loadArtifact } from './artifacts/index.js';
import type {
  TVACompilationResult,
  TVAContractFactory,
  TVASigner as TVASignerType,
} from './config/types.js';

// Import tasks
import './tasks/compile.js';
import './tasks/deploy.js';

// Re-export types
export * from './config/types.js';
export { tvaNetworks } from './config/index.js';

/**
 * Extend Hardhat config with TVA settings
 */
extendConfig(
  (config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
    config.tva = resolveTVAConfig(userConfig.tva);
  }
);

/**
 * Extend Hardhat runtime environment with TVA functionality
 */
extendEnvironment((hre) => {
  const getNetworkType = (): NetworkType => {
    const networkName = hre.network.name.toLowerCase();
    if (networkName.includes('mainnet')) return 'mainnet';
    if (networkName.includes('local') || networkName === 'hardhat') return 'local';
    return 'testnet';
  };

  hre.tva = {
    /**
     * Compiles all Solidity files using Solang
     */
    async compile(): Promise<TVACompilationResult> {
      return hre.run('tva:compile', { quiet: false });
    },

    /**
     * Gets a contract factory for deployment
     */
    async getContractFactory(name: string): Promise<TVAContractFactory> {
      return hre.run('tva:get-contract-factory', { name });
    },

    /**
     * Gets a deployed contract instance
     */
    async getContractAt(name: string, _address: string) {
      const artifact = await loadArtifact(name, hre);
      const networkType = getNetworkType();
      const signers = await hre.tva.getSigners();

      // For now, use the address as a placeholder contract ID
      // Real implementation would look up in AccountRegistry
      const contractId = `C${'0'.repeat(55)}` as any;

      const contract = new TVAContract(
        contractId,
        {
          name: artifact.name,
          functions: artifact.abi.filter((e: any) => e.type === 'function'),
          events: artifact.abi.filter((e: any) => e.type === 'event'),
          errors: artifact.abi.filter((e: any) => e.type === 'error'),
        },
        networkType
      );

      if (signers.length > 0) {
        return contract.connect(signers[0] as any) as any;
      }

      return contract as any;
    },

    /**
     * Gets the current signer
     */
    async getSigner(index = 0): Promise<TVASignerType> {
      const signers = await hre.tva.getSigners();
      if (index >= signers.length) {
        throw new Error(`Signer index ${index} out of range`);
      }
      return signers[index];
    },

    /**
     * Gets all configured signers
     */
    async getSigners(): Promise<TVASignerType[]> {
      const networkConfig = hre.network.config as any;
      const accounts = networkConfig.accounts;
      const networkType = getNetworkType();

      const signers: TVASignerType[] = [];

      if (!accounts) {
        return signers;
      }

      if (Array.isArray(accounts)) {
        for (const account of accounts) {
          const keyPair = account.startsWith('0x')
            ? deriveKeyPairFromEvmPrivateKey(account)
            : await deriveKeyPairFromMnemonic(account);

          const signer = new TVASigner(keyPair, networkType);
          signers.push({
            address: signer.evmAddress,
            stellarAddress: signer.stellarAddress,
            async signMessage(message: string) {
              return signer.signMessage(message);
            },
            async getBalance() {
              // Would need RPC connection for real balance
              return BigInt(0);
            },
          });
        }
      } else if (typeof accounts === 'object' && accounts.mnemonic) {
        const { mnemonic, initialIndex = 0, count = 10 } = accounts;

        for (let i = initialIndex; i < initialIndex + count; i++) {
          const keyPair = await deriveKeyPairFromMnemonic(mnemonic, i);
          const signer = new TVASigner(keyPair, networkType);

          signers.push({
            address: signer.evmAddress,
            stellarAddress: signer.stellarAddress,
            async signMessage(message: string) {
              return signer.signMessage(message);
            },
            async getBalance() {
              return BigInt(0);
            },
          });
        }
      }

      return signers;
    },
  };
});

/**
 * Helper to create a sample hardhat.config.js for TVA
 */
export function createSampleConfig(): string {
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
