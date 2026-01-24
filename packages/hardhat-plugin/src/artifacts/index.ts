/**
 * TVA Hardhat Artifact Management
 *
 * Handles loading and managing compiled contract artifacts.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { TVACompiledContract } from '../config/types.js';

/**
 * Artifact cache to avoid repeated file reads
 */
const artifactCache = new Map<string, TVACompiledContract>();

/**
 * Loads a compiled contract artifact by name
 */
export async function loadArtifact(
  name: string,
  hre: HardhatRuntimeEnvironment
): Promise<TVACompiledContract> {
  // Check cache first
  const cacheKey = `${hre.config.paths.root}:${name}`;
  const cached = artifactCache.get(cacheKey);
  if (cached) {
    return cached;
  }

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
      `Make sure the contract has been compiled with "npx hardhat tva:compile".`
    );
  }

  // Load artifact JSON
  const artifactContent = await fs.readFile(artifactPath, 'utf-8');
  const artifact = JSON.parse(artifactContent);

  // Load WASM binary
  const wasm = await fs.readFile(wasmPath);

  const compiledContract: TVACompiledContract = {
    name: artifact.contractName,
    sourcePath: artifact.sourceName,
    wasmPath,
    wasm: wasm.toString('base64'),
    abi: artifact.abi,
    spec: artifact.spec || [],
  };

  // Cache the artifact
  artifactCache.set(cacheKey, compiledContract);

  return compiledContract;
}

/**
 * Lists all available contract artifacts
 */
export async function listArtifacts(
  hre: HardhatRuntimeEnvironment
): Promise<string[]> {
  const artifactsDir = path.join(
    hre.config.paths.root,
    hre.config.tva.artifactsDir
  );

  try {
    const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Checks if an artifact exists for a contract
 */
export async function artifactExists(
  name: string,
  hre: HardhatRuntimeEnvironment
): Promise<boolean> {
  const artifactsDir = path.join(
    hre.config.paths.root,
    hre.config.tva.artifactsDir
  );

  const artifactPath = path.join(artifactsDir, name, `${name}.json`);

  try {
    await fs.access(artifactPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears the artifact cache
 */
export function clearArtifactCache(): void {
  artifactCache.clear();
}

/**
 * Gets the path to the artifacts directory
 */
export function getArtifactsDir(hre: HardhatRuntimeEnvironment): string {
  return path.join(hre.config.paths.root, hre.config.tva.artifactsDir);
}

/**
 * Saves an artifact to disk
 */
export async function saveArtifact(
  contract: TVACompiledContract,
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  const artifactsDir = getArtifactsDir(hre);
  const contractDir = path.join(artifactsDir, contract.name);

  // Ensure directory exists
  await fs.mkdir(contractDir, { recursive: true });

  // Write WASM file
  const wasmPath = path.join(contractDir, `${contract.name}.wasm`);
  await fs.writeFile(wasmPath, Buffer.from(contract.wasm, 'base64'));

  // Write artifact JSON
  const artifactPath = path.join(contractDir, `${contract.name}.json`);
  const artifact = {
    _format: 'tva-artifact-1',
    contractName: contract.name,
    sourceName: contract.sourcePath,
    abi: contract.abi,
    spec: contract.spec,
    wasm: contract.wasm,
  };
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2));

  // Update cache
  const cacheKey = `${hre.config.paths.root}:${contract.name}`;
  artifactCache.set(cacheKey, {
    ...contract,
    wasmPath,
  });
}

/**
 * Deletes an artifact
 */
export async function deleteArtifact(
  name: string,
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  const artifactsDir = getArtifactsDir(hre);
  const contractDir = path.join(artifactsDir, name);

  try {
    await fs.rm(contractDir, { recursive: true });

    // Clear from cache
    const cacheKey = `${hre.config.paths.root}:${name}`;
    artifactCache.delete(cacheKey);
  } catch {
    // Artifact doesn't exist
  }
}

/**
 * Cleans all artifacts
 */
export async function cleanArtifacts(
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  const artifactsDir = getArtifactsDir(hre);

  try {
    await fs.rm(artifactsDir, { recursive: true });
  } catch {
    // Directory doesn't exist
  }

  clearArtifactCache();
}
