# TVA Protocol Documentation

Technical documentation for the TVA Protocol -- an EVM compatibility layer that compiles Solidity to Stellar's Soroban VM.

## Contents

| Document | Description |
|----------|-------------|
| [Developer Guide](./developer-guide.md) | Getting started, prerequisites, first contract |
| [Solang Compiler](./solang-compiler.md) | Compilation pipeline, supported features, limitations |
| [RPC Layer](./rpc-layer.md) | EVM-compatible JSON-RPC translation layer |
| [Stellar Integration](./stellar-integration.md) | Deployment, settlement, account model, TTL |
| [Architecture](./architecture.md) | System design, data flow, security model |

## Quick Reference

```bash
# Compile Solidity to Soroban WASM
./tooling/bin/solang compile contracts/Counter.sol --target soroban

# Deploy to Stellar testnet
./tooling/bin/stellar contract deploy \
  --wasm artifacts/Counter.wasm \
  --source alice \
  --network testnet

# Initialize the deployed contract
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- init --_admin alice
```

## Architecture at a Glance

```
Solidity (.sol)
    |
    v
Solang Compiler (LLVM 16, --target soroban)
    |
    v
Soroban WASM (.wasm) + ABI (.abi)
    |
    v
Stellar Network (Soroban VM, SCP finality)
```

The RPC layer sits between developer tooling (Hardhat, MetaMask, ethers.js) and the Stellar network, translating `eth_*` JSON-RPC calls into Soroban invocations.
