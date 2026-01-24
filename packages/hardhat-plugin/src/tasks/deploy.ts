/**
 * TVA Hardhat Deployment Tasks
 *
 * Handles contract deployment to TVA/Soroban networks.
 */

import { task, subtask } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  ContractDeployer,
  TVASigner,
  deriveKeyPairFromMnemonic,
  deriveKeyPairFromEvmPrivateKey,
  type NetworkType,
  type CompiledContract,
} from '@tva-protocol/sdk';
import type { TVAContractFactory, TVAContractInstance } from '../config/types.js';

/**
 * Task name constants
 */
export const TASK_TVA_DEPLOY = 'tva:deploy';
export const SUBTASK_TVA_GET_SIGNERS = 'tva:get-signers';
export const SUBTASK_TVA_GET_CONTRACT_FACTORY = 'tva:get-contract-factory';

/**
 * Get TVA signers from network configuration
 */
subtask(SUBTASK_TVA_GET_SIGNERS)
  .setDescription('Gets TVA signers from network configuration')
  .setAction(async (_, hre: HardhatRuntimeEnvironment): Promise<TVASigner[]> => {
    const networkConfig = hre.network.config as any;
    const accounts = networkConfig.accounts;
    const networkType = getNetworkType(hre);

    const signers: TVASigner[] = [];

    if (!accounts) {
      console.warn('No accounts configured for this network');
      return signers;
    }

    if (Array.isArray(accounts)) {
      // Array of private keys or mnemonics
      for (const account of accounts) {
        const keyPair = account.startsWith('0x')
          ? deriveKeyPairFromEvmPrivateKey(account)
          : await deriveKeyPairFromMnemonic(account);

        signers.push(new TVASigner(keyPair, networkType));
      }
    } else if (typeof accounts === 'object' && accounts.mnemonic) {
      // HD wallet configuration
      const { mnemonic, initialIndex = 0, count = 10 } = accounts;

      for (let i = initialIndex; i < initialIndex + count; i++) {
        const keyPair = await deriveKeyPairFromMnemonic(mnemonic, i);
        signers.push(new TVASigner(keyPair, networkType));
      }
    }

    return signers;
  });

/**
 * Get a contract factory for deployment
 */
subtask(SUBTASK_TVA_GET_CONTRACT_FACTORY)
  .setDescription('Gets a contract factory for deployment')
  .addParam('name', 'Contract name')
  .setAction(async (
    { name }: { name: string },
    hre: HardhatRuntimeEnvironment
  ): Promise<TVAContractFactory> => {
    const artifactsDir = path.join(
      hre.config.paths.root,
      hre.config.tva.artifactsDir
    );

    const contractDir = path.join(artifactsDir, name);
    const artifactPath = path.join(contractDir, `${name}.json`);
    const wasmPath = path.join(contractDir, `${name}.wasm`);

    // Check if artifact exists
    try {
      await fs.access(artifactPath);
    } catch {
      throw new Error(
        `Contract artifact not found for "${name}". ` +
        `Run "npx hardhat tva:compile" first.`
      );
    }

    // Load artifact
    const artifactContent = await fs.readFile(artifactPath, 'utf-8');
    const artifact = JSON.parse(artifactContent);

    // Load WASM
    const wasm = await fs.readFile(wasmPath);

    const networkType = getNetworkType(hre);
    const deployer = new ContractDeployer(networkType);

    // Create factory
    const factory: TVAContractFactory = {
      name,
      abi: artifact.abi,

      async deploy(...args: unknown[]): Promise<TVAContractInstance> {
        const signers = await hre.run(SUBTASK_TVA_GET_SIGNERS);

        if (signers.length === 0) {
          throw new Error('No signers available for deployment');
        }

        const signer = signers[0];
        console.log(`Deploying ${name} with account: ${signer.evmAddress}`);

        const compiledContract: CompiledContract = {
          name,
          wasm,
          abi: {
            name,
            functions: artifact.abi.filter((e: any) => e.type === 'function'),
            events: artifact.abi.filter((e: any) => e.type === 'event'),
            errors: artifact.abi.filter((e: any) => e.type === 'error'),
          },
          spec: artifact.spec || [],
          sourcePath: artifact.sourceName,
          warnings: [],
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

      attach(address: string): TVAContractInstance {
        // TODO: Look up contract ID from registry
        const contractId = `C${'0'.repeat(55)}` as any; // Placeholder

        const signers = hre.run(SUBTASK_TVA_GET_SIGNERS) as any;
        const signer = signers[0];

        return createContractInstance(
          name,
          address as any,
          contractId,
          artifact.abi,
          signer,
          networkType
        );
      },
    };

    return factory;
  });

/**
 * Main TVA deploy task
 */
task(TASK_TVA_DEPLOY, 'Deploys a contract to TVA/Soroban')
  .addPositionalParam('contract', 'Contract name to deploy')
  .addOptionalVariadicPositionalParam('args', 'Constructor arguments', [])
  .setAction(async (
    { contract, args }: { contract: string; args: unknown[] },
    hre: HardhatRuntimeEnvironment
  ): Promise<TVAContractInstance> => {
    console.log('\n========================================');
    console.log('TVA Protocol - Contract Deployment');
    console.log('========================================\n');

    const factory = await hre.run(SUBTASK_TVA_GET_CONTRACT_FACTORY, {
      name: contract,
    });

    const instance = await factory.deploy(...args);

    console.log('\n========================================');
    console.log('Deployment complete!');
    console.log('========================================\n');

    return instance;
  });

/**
 * Gets the TVA network type from the current Hardhat network
 */
function getNetworkType(hre: HardhatRuntimeEnvironment): NetworkType {
  const networkName = hre.network.name.toLowerCase();

  if (networkName.includes('mainnet')) {
    return 'mainnet';
  } else if (networkName.includes('local') || networkName === 'hardhat') {
    return 'local';
  }

  return 'testnet';
}

/**
 * Creates a contract instance with dynamic methods
 */
function createContractInstance(
  name: string,
  address: string,
  contractId: string,
  abi: any[],
  signer: TVASigner,
  networkType: NetworkType
): TVAContractInstance {
  const instance: TVAContractInstance = {
    address,
    contractId,
    abi,

    async waitForDeployment() {
      // Deployment is already confirmed when we reach here
      return this;
    },

    deploymentTransaction() {
      // TODO: Return deployment transaction details
      return null;
    },
  };

  // Add dynamic methods for each function in the ABI
  for (const entry of abi) {
    if (entry.type === 'function') {
      instance[entry.name] = async (...args: unknown[]) => {
        // Import TVAContract dynamically to avoid circular deps
        const { TVAContract } = await import('@tva-protocol/sdk');

        const contract = new TVAContract(
          contractId as any,
          {
            name,
            functions: abi.filter((e) => e.type === 'function'),
            events: abi.filter((e) => e.type === 'event'),
            errors: abi.filter((e) => e.type === 'error'),
          },
          networkType
        );

        const isView =
          entry.stateMutability === 'view' ||
          entry.stateMutability === 'pure';

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
