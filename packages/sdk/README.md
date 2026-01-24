# @tva-protocol/sdk

TypeScript SDK for TVA Protocol - an EVM compatibility layer on Stellar that enables Solidity smart contracts to run on Soroban.

## Installation

```bash
npm install @tva-protocol/sdk
# or
pnpm add @tva-protocol/sdk
# or
yarn add @tva-protocol/sdk
```

## Features

- **Compilation**: Compile Solidity contracts to Soroban WASM via Solang
- **Wallet**: Dual-key management (EVM secp256k1 + Stellar Ed25519)
- **Contract**: Deploy and interact with compiled contracts
- **Types**: Full TypeScript support with comprehensive type definitions

## Quick Start

### Key Generation

```typescript
import {
  generateMnemonic,
  deriveKeyPairFromMnemonic,
  getEvmAddress,
  getStellarAddress,
} from '@tva-protocol/sdk';

// Generate a new mnemonic
const mnemonic = generateMnemonic();

// Derive key pair (both EVM and Stellar keys)
const keyPair = await deriveKeyPairFromMnemonic(mnemonic);

// Get addresses
const evmAddress = getEvmAddress(keyPair);     // 0x...
const stellarAddress = getStellarAddress(keyPair);  // G...
```

### Compilation

```typescript
import { SolangCompiler } from '@tva-protocol/sdk';

const compiler = new SolangCompiler();

// Compile a Solidity file
const contracts = await compiler.compileFile('./contracts/MyToken.sol');

console.log(contracts[0].wasm); // Buffer containing WASM
console.log(contracts[0].abi);  // Contract ABI
```

### Contract Deployment

```typescript
import {
  ContractDeployer,
  TVASigner,
  deriveKeyPairFromMnemonic,
} from '@tva-protocol/sdk';

// Create signer from mnemonic
const keyPair = await deriveKeyPairFromMnemonic(mnemonic);
const signer = new TVASigner(keyPair, 'testnet');

// Deploy contract
const deployer = new ContractDeployer('testnet');
const result = await deployer.deploy(compiledContract, signer);

console.log(result.contractId);  // Soroban contract ID (C...)
console.log(result.evmAddress);  // EVM-compatible address (0x...)
```

### Contract Interaction

```typescript
import { TVAContract } from '@tva-protocol/sdk';

// Connect to deployed contract
const contract = new TVAContract(contractId, abi, 'testnet');

// Read (view function)
const balance = await contract.call('balanceOf', [address], signer);

// Write (state-changing function)
const result = await contract.send('transfer', [to, amount], signer);
```

## Networks

TVA Protocol supports the following networks:

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Testnet | 0x544541 | https://rpc.testnet.tva-protocol.io |
| Mainnet | 0x545641 | https://rpc.tva-protocol.io |
| Local   | 0x545600 | http://localhost:8545 |

## Requirements

- Node.js 18+
- Solang compiler (for compilation features)

## Dependencies

- `@stellar/stellar-sdk` - Stellar/Soroban interaction
- `ethers` - EVM utilities
- `@noble/hashes` - Cryptographic functions
- `@noble/secp256k1` - EVM key operations
- `bip39` - Mnemonic generation

## License

MIT
