# TVA Protocol

**EVM Compatibility Layer on Stellar**

TVA Protocol enables developers to write standard Solidity smart contracts and deploy them to Stellar's Soroban smart contract platform. The core pipeline uses the Solang compiler to translate Solidity into Soroban-compatible WebAssembly, while an EVM-compatible RPC layer translates Ethereum-format transactions into Stellar transactions.

Write Solidity. Deploy to Stellar. Settle in 5 seconds.

## How It Works

```
Solidity Code --> Solang Compiler --> Soroban WASM --> Stellar Network
                  (LLVM-based)       (WebAssembly)    (SCP Finality)
```

1. Developers write standard Solidity (0.8.x compatible)
2. Solang compiles Solidity to Soroban-targeted WebAssembly
3. Contracts deploy and execute on Stellar's Soroban VM
4. An EVM-compatible RPC layer allows standard tooling (Hardhat, Foundry, MetaMask) to interact transparently

## Key Properties

- **5-second deterministic finality** via Stellar Consensus Protocol
- **Native WASM execution** (compiled, not interpreted -- no EVM overhead)
- **Sub-cent transaction fees** on Stellar
- **Full Solidity compatibility** via Solang compiler
- **Standard Ethereum tooling** works unchanged (ethers.js, Hardhat, Foundry)

## Repository Structure

```
tooling/
  bin/              Solang compiler + Stellar CLI binaries
  solang/           Solang compiler source (Soroban target)
  build_solang.sh   Build script
  Dockerfile.solang-build

agent/
  SOLANG_STELLAR_REFERENCE.md   Developer reference for Solang/Soroban
  core-idea.md                  Original protocol whitepaper

TVA-PIVOT-ARCHITECTURE.md       Full architecture document
```

## Quick Start

```bash
# Compile a Solidity contract to Soroban WASM
./tooling/bin/solang compile MyContract.sol --target soroban

# Deploy to Stellar testnet
./tooling/bin/stellar contract deploy \
  --wasm MyContract.wasm \
  --source alice \
  --network testnet

# Initialize the contract
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- init
```

## Architecture

See [TVA-PIVOT-ARCHITECTURE.md](./TVA-PIVOT-ARCHITECTURE.md) for the complete technical architecture, compilation pipeline details, RPC layer specification, and development roadmap.

## Status

**Phase 1 (Foundation)** -- Core compilation pipeline established. Solang compiles Solidity to Soroban WASM. Contracts deploy and execute on Stellar testnet.

Next: RPC translation layer, developer tooling, production hardening.
