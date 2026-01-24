import { ContractABI, SorobanSpec, CompilerInput, CompilerOutput } from '../types/index.js';

/**
 * TVA Protocol Solang Compiler Wrapper
 *
 * Wraps the Solang compiler binary for compiling Solidity to Soroban WASM.
 * Handles binary discovery, invocation, output parsing, and error translation.
 */

/**
 * Compiler options
 */
interface SolangCompilerOptions {
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
interface CompiledContract {
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
declare class SolangCompiler {
    private solangPath;
    private options;
    constructor(options?: SolangCompilerOptions);
    /**
     * Initializes the compiler by finding the Solang binary
     */
    initialize(): Promise<void>;
    /**
     * Gets the Solang version
     */
    getVersion(): Promise<string>;
    /**
     * Compiles a Solidity source file to Soroban WASM
     */
    compile(input: CompilerInput): Promise<CompilerOutput>;
    /**
     * Compiles a Solidity source file and returns detailed artifacts
     */
    compileFile(filePath: string): Promise<CompiledContract[]>;
    /**
     * Compiles multiple Solidity files
     */
    compileFiles(filePaths: string[]): Promise<CompiledContract[]>;
    /**
     * Runs Solang with the given arguments
     */
    private runSolang;
    /**
     * Parses Solang ABI output
     */
    private parseABI;
    /**
     * Extracts Soroban spec from WASM custom section
     */
    private extractSorobanSpec;
    /**
     * Reads a LEB128 encoded integer from a buffer
     */
    private readLEB128;
    /**
     * Parses compilation warnings from Solang output
     */
    private parseWarnings;
}
/**
 * Convenience function to compile a single file
 */
declare function compileSource(source: string, fileName?: string, options?: SolangCompilerOptions): Promise<CompilerOutput>;
/**
 * Convenience function to compile a file from disk
 */
declare function compileFile(filePath: string, options?: SolangCompilerOptions): Promise<CompiledContract[]>;

export { type CompiledContract, SolangCompiler, type SolangCompilerOptions, compileFile, compileSource };
