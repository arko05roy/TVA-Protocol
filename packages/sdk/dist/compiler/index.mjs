import { spawn } from 'child_process';
import { promises } from 'fs';
import * as path from 'path';
import * as os from 'os';

// src/compiler/solang.ts

// src/types/index.ts
var TVAError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "TVAError";
  }
};

// src/compiler/solang.ts
var SOLANG_BINARY_PATHS = [
  // User-specified path via environment variable
  process.env.TVA_SOLANG_PATH,
  // Local project path
  path.join(process.cwd(), "solang"),
  path.join(process.cwd(), "bin", "solang"),
  // TVA tooling path
  path.join(process.cwd(), "tooling", "solang", "target", "release", "solang"),
  // Global installations
  "/usr/local/bin/solang",
  "/usr/bin/solang",
  // Homebrew (macOS)
  "/opt/homebrew/bin/solang",
  // Cargo installation
  path.join(os.homedir(), ".cargo", "bin", "solang")
].filter(Boolean);
async function findSolangBinary() {
  for (const binaryPath of SOLANG_BINARY_PATHS) {
    try {
      await promises.access(binaryPath, promises.constants.X_OK);
      return binaryPath;
    } catch {
    }
  }
  throw new TVAError(
    "Solang compiler not found. Please install Solang or set TVA_SOLANG_PATH environment variable.",
    1002 /* SOLANG_NOT_FOUND */,
    {
      searchedPaths: SOLANG_BINARY_PATHS
    }
  );
}
var SolangCompiler = class {
  solangPath = null;
  options;
  constructor(options = {}) {
    this.options = {
      optimizationLevel: 2,
      ...options
    };
  }
  /**
   * Initializes the compiler by finding the Solang binary
   */
  async initialize() {
    if (this.options.solangPath) {
      this.solangPath = this.options.solangPath;
    } else {
      this.solangPath = await findSolangBinary();
    }
  }
  /**
   * Gets the Solang version
   */
  async getVersion() {
    if (!this.solangPath) {
      await this.initialize();
    }
    return new Promise((resolve, reject) => {
      const proc = spawn(this.solangPath, ["--version"]);
      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.on("close", (code) => {
        if (code === 0) {
          const match = output.match(/solang version v?([\d.]+)/i);
          resolve(match ? match[1] : output.trim());
        } else {
          reject(new Error("Failed to get Solang version"));
        }
      });
    });
  }
  /**
   * Compiles a Solidity source file to Soroban WASM
   */
  async compile(input) {
    if (!this.solangPath) {
      await this.initialize();
    }
    const tempDir = await promises.mkdtemp(path.join(os.tmpdir(), "tva-compile-"));
    const sourceFile = path.join(tempDir, input.fileName);
    const outputDir = this.options.outputDir || tempDir;
    try {
      await promises.writeFile(sourceFile, input.source);
      const args = [
        "compile",
        sourceFile,
        "--target",
        "soroban",
        "-o",
        outputDir
      ];
      if (this.options.optimizationLevel !== void 0) {
        args.push(`-O${this.options.optimizationLevel}`);
      }
      if (this.options.importPaths) {
        for (const importPath of this.options.importPaths) {
          args.push("-I", importPath);
        }
      }
      if (this.options.additionalFlags) {
        args.push(...this.options.additionalFlags);
      }
      const result = await this.runSolang(args);
      if (result.exitCode !== 0 && !result.stdout.includes(".wasm")) {
        throw new TVAError(
          `Compilation failed: ${result.stderr || result.stdout}`,
          1001 /* COMPILATION_FAILED */,
          {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          }
        );
      }
      const files = await promises.readdir(outputDir);
      const wasmFile = files.find((f) => f.endsWith(".wasm"));
      const abiFile = files.find((f) => f.endsWith(".abi") || f.endsWith(".json"));
      if (!wasmFile) {
        throw new TVAError(
          "No WASM file produced by compilation",
          1001 /* COMPILATION_FAILED */,
          {
            outputFiles: files,
            stdout: result.stdout,
            stderr: result.stderr
          }
        );
      }
      const wasmPath = path.join(outputDir, wasmFile);
      const wasmBuffer = await promises.readFile(wasmPath);
      let abi = {
        name: input.fileName.replace(".sol", ""),
        functions: [],
        events: [],
        errors: []
      };
      if (abiFile) {
        const abiPath = path.join(outputDir, abiFile);
        const abiContent = await promises.readFile(abiPath, "utf-8");
        abi = this.parseABI(abiContent, input.fileName);
      }
      const spec = this.extractSorobanSpec(wasmBuffer);
      const warnings = this.parseWarnings(result.stdout + result.stderr);
      return {
        wasm: wasmBuffer.toString("base64"),
        abi,
        spec,
        warnings
      };
    } finally {
      if (!this.options.outputDir) {
        await promises.rm(tempDir, { recursive: true, force: true }).catch(() => {
        });
      }
    }
  }
  /**
   * Compiles a Solidity source file and returns detailed artifacts
   */
  async compileFile(filePath) {
    const source = await promises.readFile(filePath, "utf-8");
    const fileName = path.basename(filePath);
    const output = await this.compile({
      source,
      fileName
    });
    return [
      {
        name: output.abi.name,
        wasm: Buffer.from(output.wasm, "base64"),
        abi: output.abi,
        spec: output.spec,
        sourcePath: filePath,
        warnings: output.warnings
      }
    ];
  }
  /**
   * Compiles multiple Solidity files
   */
  async compileFiles(filePaths) {
    const results = [];
    for (const filePath of filePaths) {
      const contracts = await this.compileFile(filePath);
      results.push(...contracts);
    }
    return results;
  }
  /**
   * Runs Solang with the given arguments
   */
  runSolang(args) {
    return new Promise((resolve) => {
      const proc = spawn(this.solangPath, args);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr
        });
      });
      proc.on("error", (error) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + error.message
        });
      });
    });
  }
  /**
   * Parses Solang ABI output
   */
  parseABI(abiContent, fileName) {
    try {
      const parsed = JSON.parse(abiContent);
      const entries = Array.isArray(parsed) ? parsed : parsed.abi || [];
      const functions = [];
      const events = [];
      const errors = [];
      for (const entry of entries) {
        if (entry.type === "function" || !entry.type) {
          functions.push({
            name: entry.name,
            inputs: entry.inputs || [],
            outputs: entry.outputs || [],
            stateMutability: entry.stateMutability || "nonpayable",
            type: "function"
          });
        } else if (entry.type === "constructor") {
          functions.push({
            name: "constructor",
            inputs: entry.inputs || [],
            outputs: [],
            stateMutability: entry.stateMutability || "nonpayable",
            type: "constructor"
          });
        } else if (entry.type === "event") {
          events.push({
            name: entry.name,
            inputs: entry.inputs || [],
            anonymous: entry.anonymous || false
          });
        } else if (entry.type === "error") {
          errors.push({
            name: entry.name,
            inputs: entry.inputs || []
          });
        }
      }
      return {
        name: parsed.name || fileName.replace(".sol", ""),
        functions,
        events,
        errors
      };
    } catch (error) {
      return {
        name: fileName.replace(".sol", ""),
        functions: [],
        events: [],
        errors: []
      };
    }
  }
  /**
   * Extracts Soroban spec from WASM custom section
   */
  extractSorobanSpec(wasmBuffer) {
    try {
      const specs = [];
      let offset = 8;
      while (offset < wasmBuffer.length) {
        const sectionId = wasmBuffer[offset++];
        const sectionSize = this.readLEB128(wasmBuffer, offset);
        offset = sectionSize.offset;
        if (sectionId === 0) {
          const nameLen = this.readLEB128(wasmBuffer, offset);
          offset = nameLen.offset;
          const name = wasmBuffer.slice(offset, offset + nameLen.value).toString("utf-8");
          offset += nameLen.value;
          if (name === "contractspecv0") {
            specs.push({
              type: "function",
              name: "_spec_found",
              doc: "Soroban spec section found in WASM"
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
  readLEB128(buffer, offset) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = buffer[offset++];
      result |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return { value: result, offset };
  }
  /**
   * Parses compilation warnings from Solang output
   */
  parseWarnings(output) {
    const warnings = [];
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("warning:") || line.includes("Warning:")) {
        warnings.push(line.trim());
      }
    }
    return warnings;
  }
};
async function compileSource(source, fileName = "Contract.sol", options) {
  const compiler = new SolangCompiler(options);
  return compiler.compile({ source, fileName });
}
async function compileFile(filePath, options) {
  const compiler = new SolangCompiler(options);
  return compiler.compileFile(filePath);
}

export { SolangCompiler, compileFile, compileSource };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map