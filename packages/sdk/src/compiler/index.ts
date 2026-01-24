/**
 * TVA Protocol Compiler Module
 *
 * Provides Solidity compilation to Soroban WASM via the Solang compiler.
 */

export {
  SolangCompiler,
  compileSource,
  compileFile,
  type SolangCompilerOptions,
  type CompiledContract,
} from './solang.js';
