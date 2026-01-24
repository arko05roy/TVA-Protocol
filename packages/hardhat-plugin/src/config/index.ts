/**
 * TVA Hardhat Plugin Configuration
 */

export * from './types.js';

import type { TVAConfig } from './types.js';

/**
 * Default TVA configuration values
 */
export const defaultTVAConfig: Required<TVAConfig> = {
  solangPath: '',
  optimizationLevel: 2,
  defaultNetwork: 'testnet',
  artifactsDir: 'artifacts/tva',
  autoVerify: false,
  importPaths: [],
};

/**
 * Merges user config with defaults
 */
export function resolveTVAConfig(userConfig?: TVAConfig): Required<TVAConfig> {
  return {
    ...defaultTVAConfig,
    ...userConfig,
  };
}

/**
 * Pre-configured TVA network settings
 */
export const tvaNetworks = {
  tvaTestnet: {
    url: 'https://rpc.testnet.tva-protocol.io',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    chainId: 0x544541,
  },
  tvaMainnet: {
    url: 'https://rpc.tva-protocol.io',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    chainId: 0x545641,
  },
  tvaLocal: {
    url: 'http://localhost:8545',
    horizonUrl: 'http://localhost:8000',
    sorobanRpcUrl: 'http://localhost:8001',
    networkPassphrase: 'Standalone Network ; February 2017',
    chainId: 0x545600,
  },
};
