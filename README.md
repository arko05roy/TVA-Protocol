# TVA Protocol

**EVM Compatibility Layer on Stellar**

TVA Protocol enables developers to write standard Solidity smart contracts and deploy them to Stellar's Soroban smart contract platform. The core pipeline uses the Solang compiler to translate Solidity into Soroban-compatible WebAssembly, while an EVM-compatible RPC layer translates Ethereum-format transactions into Stellar transactions.

Write Solidity. Deploy to Stellar. Settle in 5 seconds.

## How It Works

```
Solidity Code --> Solang Compiler --> Soroban WASM --> Stellar Network
                  (LLVM-based)       (WebAssembly)    (SCP Finality)
```

1. Developers write standard Solidity (with Soroban-specific annotations)
2. Solang compiles Solidity to Soroban-targeted WebAssembly
3. Contracts deploy and execute on Stellar's Soroban VM
4. An EVM-compatible RPC layer allows standard tooling (Hardhat, Foundry, MetaMask) to interact transparently

## Quick Start

```bash
# Clone and enter the project
git clone https://github.com/your-org/TVA-Protocol.git
cd TVA-Protocol

# Set up environment
cp .env.example .env

# Set up a Stellar testnet identity
./tooling/bin/stellar keys generate alice --network testnet
./tooling/bin/stellar keys fund alice --network testnet

# Compile a Solidity contract to Soroban WASM
./tooling/bin/solang compile contracts/Counter.sol --target soroban

# Deploy to Stellar testnet
./tooling/bin/stellar contract deploy \
  --wasm Counter.wasm \
  --source alice \
  --network testnet

# Initialize the contract
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- init --_admin alice

# Interact with the contract
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- increment
```

## Key Properties

- **5-second deterministic finality** via Stellar Consensus Protocol
- **Native WASM execution** (compiled, not interpreted -- no EVM overhead)
- **Sub-cent transaction fees** on Stellar
- **Full Solidity compatibility** via Solang compiler
- **Standard Ethereum tooling** works unchanged (ethers.js, Hardhat, Foundry)

## Project Structure

```
TVA-Protocol/
  contracts/              Solidity source files
    Counter.sol             Basic counter with TTL management
    TVAToken.sol            ERC20-compatible token for Soroban
    AccountRegistry.sol     EVM <-> Stellar address mapping
  artifacts/              Compiled WASM and ABI output
  tooling/
    bin/                  Solang compiler + Stellar CLI binaries
    solang/               Solang compiler source (Soroban target)
    llvm16/               LLVM 16 for Solang builds
    build_solang.sh       Build script
    Dockerfile.solang-build
  client/                 Frontend application (Next.js)
  dev-b/                  Settlement layer modules
  agent/                  Development references and task tracking
  docs/                   Technical documentation
  .env.example            Environment variable template
  TVA-PIVOT-ARCHITECTURE.md  Full architecture specification
```

## Documentation

See the [docs/](./docs/) folder for detailed technical documentation:

- **[Developer Guide](./docs/developer-guide.md)** -- Getting started, prerequisites, first contract
- **[Solang Compiler](./docs/solang-compiler.md)** -- Compilation pipeline, supported features, known limitations
- **[RPC Layer](./docs/rpc-layer.md)** -- EVM-compatible JSON-RPC translation server
- **[Stellar Integration](./docs/stellar-integration.md)** -- Deployment, settlement, account model, TTL
- **[Architecture](./docs/architecture.md)** -- System design, data flow, security model

For the full technical specification, see [TVA-PIVOT-ARCHITECTURE.md](./TVA-PIVOT-ARCHITECTURE.md).

## Architecture

See [docs/architecture.md](./docs/architecture.md) for the complete technical architecture, or [TVA-PIVOT-ARCHITECTURE.md](./TVA-PIVOT-ARCHITECTURE.md) for the detailed specification including:

- Compilation pipeline internals
- RPC layer specification
- Account and key management
- Transaction translation rules
- Development roadmap

## Status

**Phase 6 (Current)** -- Core compilation pipeline established. Solang compiles Solidity to Soroban WASM. Contracts deploy and execute on Stellar testnet. Settlement layer and frontend in progress.

Next: RPC translation layer, developer tooling, production hardening.
