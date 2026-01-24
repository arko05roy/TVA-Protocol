/**
 * TVA Hardhat Compilation Task
 *
 * Compiles Solidity contracts using Solang for the Soroban target.
 */

import { task, subtask } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  SolangCompiler,
  type CompiledContract,
} from '@tva-protocol/sdk';
import type { TVACompilationResult, TVACompiledContract } from '../config/types.js';

/**
 * Task name constants
 */
export const TASK_TVA_COMPILE = 'tva:compile';
export const SUBTASK_TVA_COMPILE_GET_SOURCES = 'tva:compile:get-sources';
export const SUBTASK_TVA_COMPILE_SOLANG = 'tva:compile:solang';
export const SUBTASK_TVA_COMPILE_GENERATE_ARTIFACTS = 'tva:compile:generate-artifacts';

/**
 * Get all Solidity source files
 */
subtask(SUBTASK_TVA_COMPILE_GET_SOURCES)
  .setDescription('Gets all Solidity source files for TVA compilation')
  .setAction(async (_, hre: HardhatRuntimeEnvironment): Promise<string[]> => {
    const sourcePaths = hre.config.paths.sources;
    const sources: string[] = [];

    async function findSolFiles(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await findSolFiles(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.sol')) {
            sources.push(fullPath);
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
      }
    }

    await findSolFiles(sourcePaths);
    return sources;
  });

/**
 * Compile sources with Solang
 */
subtask(SUBTASK_TVA_COMPILE_SOLANG)
  .setDescription('Compiles Solidity sources using Solang for Soroban')
  .addParam('sources', 'Array of source file paths')
  .setAction(async (
    { sources }: { sources: string[] },
    hre: HardhatRuntimeEnvironment
  ): Promise<CompiledContract[]> => {
    const config = hre.config.tva;

    const compiler = new SolangCompiler({
      solangPath: config.solangPath || undefined,
      optimizationLevel: config.optimizationLevel,
      importPaths: [
        hre.config.paths.sources,
        path.join(hre.config.paths.root, 'node_modules'),
        ...config.importPaths,
      ],
    });

    console.log(`Compiling ${sources.length} Solidity file(s) with Solang...`);

    const results: CompiledContract[] = [];
    const errors: string[] = [];

    for (const sourcePath of sources) {
      try {
        console.log(`  Compiling ${path.basename(sourcePath)}...`);
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
        console.error(`  Error compiling ${path.basename(sourcePath)}: ${message}`);
      }
    }

    if (errors.length > 0) {
      console.error(`\nCompilation failed with ${errors.length} error(s)`);
    } else {
      console.log(`\nCompiled ${results.length} contract(s) successfully`);
    }

    return results;
  });

/**
 * Generate Hardhat-compatible artifacts
 */
subtask(SUBTASK_TVA_COMPILE_GENERATE_ARTIFACTS)
  .setDescription('Generates Hardhat-compatible artifacts from compiled contracts')
  .addParam('contracts', 'Array of compiled contracts')
  .setAction(async (
    { contracts }: { contracts: CompiledContract[] },
    hre: HardhatRuntimeEnvironment
  ): Promise<TVACompiledContract[]> => {
    const artifactsDir = path.join(
      hre.config.paths.root,
      hre.config.tva.artifactsDir
    );

    // Ensure artifacts directory exists
    await fs.mkdir(artifactsDir, { recursive: true });

    const artifacts: TVACompiledContract[] = [];

    for (const contract of contracts) {
      const contractDir = path.join(artifactsDir, contract.name);
      await fs.mkdir(contractDir, { recursive: true });

      // Write WASM file
      const wasmPath = path.join(contractDir, `${contract.name}.wasm`);
      await fs.writeFile(wasmPath, contract.wasm);

      // Write ABI file (Hardhat-compatible format)
      const abiPath = path.join(contractDir, `${contract.name}.json`);
      const abiEntries: any[] = [
        ...contract.abi.functions.map((f) => ({
          type: f.type,
          name: f.name,
          inputs: f.inputs,
          outputs: f.outputs,
          stateMutability: f.stateMutability,
        })),
        ...contract.abi.events.map((e) => ({
          type: 'event',
          name: e.name,
          inputs: e.inputs,
          anonymous: e.anonymous,
        })),
        ...contract.abi.errors.map((e) => ({
          type: 'error',
          name: e.name,
          inputs: e.inputs,
        })),
      ];
      const artifact = {
        _format: 'tva-artifact-1',
        contractName: contract.name,
        sourceName: contract.sourcePath,
        abi: abiEntries,
        wasm: contract.wasm.toString('base64'),
        spec: contract.spec,
        deployedBytecode: '', // Not applicable for WASM
        bytecode: '', // Not applicable for WASM
        linkReferences: {},
        deployedLinkReferences: {},
      };

      await fs.writeFile(abiPath, JSON.stringify(artifact, null, 2));

      artifacts.push({
        name: contract.name,
        sourcePath: contract.sourcePath,
        wasmPath,
        wasm: contract.wasm.toString('base64'),
        abi: artifact.abi,
        spec: contract.spec,
      });
    }

    return artifacts;
  });

/**
 * Main TVA compile task
 */
task(TASK_TVA_COMPILE, 'Compiles Solidity contracts for TVA/Soroban using Solang')
  .addFlag('force', 'Force recompilation of all contracts')
  .addFlag('quiet', 'Suppress compilation output')
  .setAction(async (
    { force: _force, quiet }: { force: boolean; quiet: boolean },
    hre: HardhatRuntimeEnvironment
  ): Promise<TVACompilationResult> => {
    if (!quiet) {
      console.log('\n========================================');
      console.log('TVA Protocol - Solang Compilation');
      console.log('========================================\n');
    }

    // Get source files
    const sources = await hre.run(SUBTASK_TVA_COMPILE_GET_SOURCES);

    if (sources.length === 0) {
      if (!quiet) {
        console.log('No Solidity files found to compile.');
      }
      return {
        contracts: [],
        warnings: [],
        errors: [],
      };
    }

    // Compile with Solang
    const compiledContracts = await hre.run(SUBTASK_TVA_COMPILE_SOLANG, {
      sources,
    });

    // Generate artifacts
    const artifacts = await hre.run(SUBTASK_TVA_COMPILE_GENERATE_ARTIFACTS, {
      contracts: compiledContracts,
    });

    // Collect all warnings
    const warnings: string[] = [];
    for (const contract of compiledContracts) {
      warnings.push(...contract.warnings);
    }

    if (!quiet) {
      console.log('\n========================================');
      console.log(`Artifacts written to: ${hre.config.tva.artifactsDir}`);
      console.log('========================================\n');
    }

    return {
      contracts: artifacts,
      warnings,
      errors: [],
    };
  });

/**
 * Override default compile task to also run TVA compilation
 */
task('compile', 'Compiles the entire project')
  .setAction(async (args, hre, runSuper) => {
    // Run the original compile task
    await runSuper(args);

    // Also run TVA compilation
    console.log('\nRunning TVA compilation...');
    await hre.run(TASK_TVA_COMPILE, { quiet: args.quiet });
  });
