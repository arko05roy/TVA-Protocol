# @tva-protocol/hardhat-plugin

Hardhat plugin for TVA Protocol - compile and deploy Solidity contracts to Stellar/Soroban.

## Installation

```bash
npm install @tva-protocol/hardhat-plugin hardhat
# or
pnpm add @tva-protocol/hardhat-plugin hardhat
# or
yarn add @tva-protocol/hardhat-plugin hardhat
```

## Setup

Add the plugin to your `hardhat.config.js`:

```javascript
require("@tva-protocol/hardhat-plugin");

module.exports = {
  solidity: "0.8.24",

  tva: {
    // Optimization level (0-3)
    optimizationLevel: 2,

    // Output directory for compiled artifacts
    artifactsDir: "artifacts/tva",
  },

  networks: {
    tvaTestnet: {
      url: "https://rpc.testnet.tva-protocol.io",
      accounts: {
        mnemonic: "your mnemonic phrase here",
      },
      tva: {
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
        chainId: 0x544541,
      },
    },
  },
};
```

Or in TypeScript (`hardhat.config.ts`):

```typescript
import "@tva-protocol/hardhat-plugin";
import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  tva: {
    optimizationLevel: 2,
    artifactsDir: "artifacts/tva",
  },
  networks: {
    tvaTestnet: {
      url: "https://rpc.testnet.tva-protocol.io",
      accounts: {
        mnemonic: process.env.MNEMONIC!,
      },
    },
  },
};

export default config;
```

## Usage

### Compilation

Compile your Solidity contracts using Solang for the Soroban target:

```bash
npx hardhat tva:compile
```

This will:
1. Find all `.sol` files in your `contracts/` directory
2. Compile them using Solang with `--target soroban`
3. Generate artifacts in `artifacts/tva/`

### Deployment

Deploy a contract to TVA:

```bash
npx hardhat tva:deploy MyContract --network tvaTestnet
```

With constructor arguments:

```bash
npx hardhat tva:deploy MyToken "Token Name" "TKN" 18 --network tvaTestnet
```

### Programmatic Usage

```typescript
import { ethers } from "hardhat";

async function main() {
  // Compile
  await hre.tva.compile();

  // Get contract factory
  const factory = await hre.tva.getContractFactory("MyToken");

  // Deploy
  const contract = await factory.deploy("Token Name", "TKN", 18);
  await contract.waitForDeployment();

  console.log("Contract deployed to:", contract.address);
  console.log("Soroban Contract ID:", contract.contractId);

  // Interact
  const balance = await contract.balanceOf(signer.address);
  console.log("Balance:", balance);
}

main();
```

## Tasks

| Task | Description |
|------|-------------|
| `tva:compile` | Compile Solidity contracts using Solang |
| `tva:deploy <contract>` | Deploy a contract to TVA network |

## Configuration Options

### TVA Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `solangPath` | `string` | auto-detect | Path to Solang binary |
| `optimizationLevel` | `number` | `2` | LLVM optimization level (0-3) |
| `artifactsDir` | `string` | `"artifacts/tva"` | Output directory for compiled artifacts |
| `autoVerify` | `boolean` | `false` | Auto-verify contracts after deployment |
| `importPaths` | `string[]` | `[]` | Additional import paths for Solidity |

### Network Config

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | TVA RPC endpoint |
| `horizonUrl` | `string` | Stellar Horizon URL |
| `sorobanRpcUrl` | `string` | Soroban RPC URL |
| `networkPassphrase` | `string` | Stellar network passphrase |
| `chainId` | `number` | EVM chain ID |
| `accounts` | `string[] \| object` | Account configuration |

## Pre-configured Networks

Import pre-configured network settings:

```javascript
const { tvaNetworks } = require("@tva-protocol/hardhat-plugin");

module.exports = {
  networks: {
    tvaTestnet: {
      ...tvaNetworks.tvaTestnet,
      accounts: { mnemonic: "..." },
    },
    tvaMainnet: {
      ...tvaNetworks.tvaMainnet,
      accounts: { mnemonic: "..." },
    },
  },
};
```

## Requirements

- Hardhat 2.19+
- Node.js 18+
- Solang compiler (auto-detected or specify path)

## License

MIT
