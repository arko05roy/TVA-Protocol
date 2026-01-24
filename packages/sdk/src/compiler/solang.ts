/**
 * TVA Protocol Solang Compiler Wrapper
 *
 * Wraps the Solang compiler binary for compiling Solidity to Soroban WASM.
 * Handles binary discovery, invocation, output parsing, and error translation.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  CompilerInput,
  CompilerOutput,
  ContractABI,
  ABIFunction,
  ABIEvent,
  ABIError,
  SorobanSpec,
} from '../types/index.js';
import { TVAError, TVAErrorCode } from '../types/index.js';

/**
 * Paths where Solang binary might be located
 */
const SOLANG_BINARY_PATHS = [
  // User-specified path via environment variable
  process.env.TVA_SOLANG_PATH,
  // Local project path
  path.join(process.cwd(), 'solang'),
  path.join(process.cwd(), 'bin', 'solang'),
  // TVA tooling path
  path.join(process.cwd(), 'tooling', 'solang', 'target', 'release', 'solang'),
  // Global installations
  '/usr/local/bin/solang',
  '/usr/bin/solang',
  // Homebrew (macOS)
  '/opt/homebrew/bin/solang',
  // Cargo installation
  path.join(os.homedir(), '.cargo', 'bin', 'solang'),
].filter(Boolean) as string[];

/**
 * Finds the Solang binary
 */
async function findSolangBinary(): Promise<string> {
  for (const binaryPath of SOLANG_BINARY_PATHS) {
    try {
      await fs.access(binaryPath, fs.constants.X_OK);
      return binaryPath;
    } catch {
      // Binary not found at this path, try next
    }
  }

  throw new TVAError(
    'Solang compiler not found. Please install Solang or set TVA_SOLANG_PATH environment variable.',
    TVAErrorCode.SOLANG_NOT_FOUND,
    {
      searchedPaths: SOLANG_BINARY_PATHS,
    }
  );
}

/**
 * Compiler options
 */
export interface SolangCompilerOptions {
  /** Path to Solang binary (auto-detected if not specified) */
  solangPath?: string;
  /** Optimization level (0-3) */
  optimizationLevel?: number;
  /** Output directory for compiled artifacts */
  outputDir?: string;
  /** Additional Solang flags */
  additionalFlags?: string[];
  /** Import paths for Solidity imports */
  importPaths?: string[];
}

/**
 * Compiled contract artifact
 */
export interface CompiledContract {
  /** Contract name */
  name: string;
  /** WASM binary (as Buffer) */
  wasm: Buffer;
  /** Contract ABI */
  abi: ContractABI;
  /** Soroban spec entries */
  spec: SorobanSpec[];
  /** Source file path */
  sourcePath: string;
  /** Compilation warnings */
  warnings: string[];
}

/**
 * Solang compiler wrapper
 */
export class SolangCompiler {
  private solangPath: string | null = null;
  private options: SolangCompilerOptions;

  constructor(options: SolangCompilerOptions = {}) {
    this.options = {
      optimizationLevel: 2,
      ...options,
    };
  }

  /**
   * Initializes the compiler by finding the Solang binary
   */
  async initialize(): Promise<void> {
    if (this.options.solangPath) {
      this.solangPath = this.options.solangPath;
    } else {
      this.solangPath = await findSolangBinary();
    }
  }

  /**
   * Gets the Solang version
   */
  async getVersion(): Promise<string> {
    if (!this.solangPath) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(this.solangPath!, ['--version']);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse version from output like "solang version v0.3.3"
          const match = output.match(/solang version v?([\d.]+)/i);
          resolve(match ? match[1] : output.trim());
        } else {
          reject(new Error('Failed to get Solang version'));
        }
      });
    });
  }

  /**
   * Compiles a Solidity source file to Soroban WASM
   */
  async compile(input: CompilerInput): Promise<CompilerOutput> {
    if (!this.solangPath) {
      await this.initialize();
    }

    // Create temporary directory for compilation
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tva-compile-'));
    const sourceFile = path.join(tempDir, input.fileName);
    const outputDir = this.options.outputDir || tempDir;

    try {
      // Write source file
      await fs.writeFile(sourceFile, input.source);

      // Build Solang command
      const args = [
        'compile',
        sourceFile,
        '--target', 'soroban',
        '-o', outputDir,
      ];

      // Add optimization level
      if (this.options.optimizationLevel !== undefined) {
        args.push(`-O${this.options.optimizationLevel}`);
      }

      // Add import paths
      if (this.options.importPaths) {
        for (const importPath of this.options.importPaths) {
          args.push('-I', importPath);
        }
      }

      // Add additional flags
      if (this.options.additionalFlags) {
        args.push(...this.options.additionalFlags);
      }

      // Run Solang
      const result = await this.runSolang(args);

      if (result.exitCode !== 0 && !result.stdout.includes('.wasm')) {
        throw new TVAError(
          `Compilation failed: ${result.stderr || result.stdout}`,
          TVAErrorCode.COMPILATION_FAILED,
          {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          }
        );
      }

      // Find output files
      const files = await fs.readdir(outputDir);
      const wasmFile = files.find((f) => f.endsWith('.wasm'));
      const abiFile = files.find((f) => f.endsWith('.abi') || f.endsWith('.json'));

      if (!wasmFile) {
        throw new TVAError(
          'No WASM file produced by compilation',
          TVAErrorCode.COMPILATION_FAILED,
          {
            outputFiles: files,
            stdout: result.stdout,
            stderr: result.stderr,
          }
        );
      }

      // Read WASM file
      const wasmPath = path.join(outputDir, wasmFile);
      const wasmBuffer = await fs.readFile(wasmPath);

      // Parse ABI if available
      let abi: ContractABI = {
        name: input.fileName.replace('.sol', ''),
        functions: [],
        events: [],
        errors: [],
      };

      if (abiFile) {
        const abiPath = path.join(outputDir, abiFile);
        const abiContent = await fs.readFile(abiPath, 'utf-8');
        abi = this.parseABI(abiContent, input.fileName);
      }

      // Extract spec from WASM (custom section)
      const spec = this.extractSorobanSpec(wasmBuffer);

      // Parse warnings from output
      const warnings = this.parseWarnings(result.stdout + result.stderr);

      return {
        wasm: wasmBuffer.toString('base64'),
        abi,
        spec,
        warnings,
      };
    } finally {
      // Clean up temp directory if we created one
      if (!this.options.outputDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
      }
    }
  }

  /**
   * Compiles a Solidity source file and returns detailed artifacts
   */
  async compileFile(filePath: string): Promise<CompiledContract[]> {
    const source = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const output = await this.compile({
      source,
      fileName,
    });

    // For now, return a single contract
    // In the future, handle multiple contracts per file
    return [
      {
        name: output.abi.name,
        wasm: Buffer.from(output.wasm, 'base64'),
        abi: output.abi,
        spec: output.spec,
        sourcePath: filePath,
        warnings: output.warnings,
      },
    ];
  }

  /**
   * Compiles multiple Solidity files
   */
  async compileFiles(filePaths: string[]): Promise<CompiledContract[]> {
    const results: CompiledContract[] = [];

    for (const filePath of filePaths) {
      const contracts = await this.compileFile(filePath);
      results.push(...contracts);
    }

    return results;
  }

  /**
   * Runs Solang with the given arguments
   */
  private runSolang(args: string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve) => {
      const proc = spawn(this.solangPath!, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
        });
      });

      proc.on('error', (error) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + error.message,
        });
      });
    });
  }

  /**
   * Parses Solang ABI output
   */
  private parseABI(abiContent: string, fileName: string): ContractABI {
    try {
      const parsed = JSON.parse(abiContent);

      // Handle both array format (standard) and object format (Solang)
      const entries = Array.isArray(parsed) ? parsed : parsed.abi || [];

      const functions: ABIFunction[] = [];
      const events: ABIEvent[] = [];
      const errors: ABIError[] = [];

      for (const entry of entries) {
        if (entry.type === 'function' || !entry.type) {
          functions.push({
            name: entry.name,
            inputs: entry.inputs || [],
            outputs: entry.outputs || [],
            stateMutability: entry.stateMutability || 'nonpayable',
            type: 'function',
          });
        } else if (entry.type === 'constructor') {
          functions.push({
            name: 'constructor',
            inputs: entry.inputs || [],
            outputs: [],
            stateMutability: entry.stateMutability || 'nonpayable',
            type: 'constructor',
          });
        } else if (entry.type === 'event') {
          events.push({
            name: entry.name,
            inputs: entry.inputs || [],
            anonymous: entry.anonymous || false,
          });
        } else if (entry.type === 'error') {
          errors.push({
            name: entry.name,
            inputs: entry.inputs || [],
          });
        }
      }

      return {
        name: parsed.name || fileName.replace('.sol', ''),
        functions,
        events,
        errors,
      };
    } catch (error) {
      // Return empty ABI on parse error
      return {
        name: fileName.replace('.sol', ''),
        functions: [],
        events: [],
        errors: [],
      };
    }
  }

  /**
   * Extracts Soroban spec from WASM custom section
   */
  private extractSorobanSpec(wasmBuffer: Buffer): SorobanSpec[] {
    // Soroban stores contract spec in a custom section named "contractspecv0"
    // For now, return empty array - full implementation requires WASM parsing
    // This will be enhanced when we integrate with the Stellar SDK's spec extraction
    try {
      const specs: SorobanSpec[] = [];

      // Simple WASM custom section parser
      let offset = 8; // Skip magic number and version

      while (offset < wasmBuffer.length) {
        const sectionId = wasmBuffer[offset++];
        const sectionSize = this.readLEB128(wasmBuffer, offset);
        offset = sectionSize.offset;

        if (sectionId === 0) {
          // Custom section
          const nameLen = this.readLEB128(wasmBuffer, offset);
          offset = nameLen.offset;

          const name = wasmBuffer.slice(offset, offset + nameLen.value).toString('utf-8');
          offset += nameLen.value;

          if (name === 'contractspecv0') {
            // Found the spec section - parse it
            // The spec is XDR encoded, so we'd need the Stellar SDK to decode it
            // For now, just note that we found it
            specs.push({
              type: 'function',
              name: '_spec_found',
              doc: 'Soroban spec section found in WASM',
            });
          }
        }

        offset += sectionSize.value - (offset - sectionSize.offset);
      }

      return specs;
    } catch {
      return [];
    }
  }

  /**
   * Reads a LEB128 encoded integer from a buffer
   */
  private readLEB128(
    buffer: Buffer,
    offset: number
  ): { value: number; offset: number } {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = buffer[offset++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);

    return { value: result, offset };
  }

  /**
   * Parses compilation warnings from Solang output
   */
  private parseWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('warning:') || line.includes('Warning:')) {
        warnings.push(line.trim());
      }
    }

    return warnings;
  }
}

/**
 * Convenience function to compile a single file
 */
export async function compileSource(
  source: string,
  fileName: string = 'Contract.sol',
  options?: SolangCompilerOptions
): Promise<CompilerOutput> {
  const compiler = new SolangCompiler(options);
  return compiler.compile({ source, fileName });
}

/**
 * Convenience function to compile a file from disk
 */
export async function compileFile(
  filePath: string,
  options?: SolangCompilerOptions
): Promise<CompiledContract[]> {
  const compiler = new SolangCompiler(options);
  return compiler.compileFile(filePath);
}
