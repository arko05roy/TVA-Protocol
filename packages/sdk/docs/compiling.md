# Compiling

So you have a `.sol` file. 

The problem? Stellar doesn't speak Solidity. Soroban speaks WASM (WebAssembly).
The solution? We need a translator.

Enter the **Compiler**.

## The Compiler Wrapper

We use an LLVM-based compiler under the hood to compile Solidity directly to Soroban WASM. We've wrapped it in a nice TypeScript class so you don't have to deal with command line arguments unless you really want to.

### How to Compile

```typescript
import { SolangCompiler } from '@tva-protocol/sdk';

const compiler = new SolangCompiler();

// This path should point to a real file.
const filePath = './contracts/MyToken.sol';

console.log("Compiling... hold tight.");

// The magic happens here
const contracts = await compiler.compileFile(filePath);

// You might get multiple contracts back if your file defines more than one.
const myContract = contracts[0];

console.log("Contract Name:", myContract.contractName);
console.log("WASM Size:", myContract.wasm.length, "bytes of pure logic");
console.log("ABI:", JSON.stringify(myContract.abi, null, 2)); 
```

## What just happened?

1.  **Read**: We read your Solidity code.
2.  **Parse**: The compiler checked for syntax errors (missing semicolons, usually).
3.  **Compile**: The compiler generated a WASM binary optimized for the Soroban runtime.
4.  **Package**: We returned a nice object containing the WASM and the ABI (Application Binary Interface).

You need both the `wasm` (to deploy code) and the `abi` (to know how to talk to it). Do not lose them.
