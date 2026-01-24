# TVA Protocol -- Tasks: Arko (Integration / Tooling Dev)

Role: Developer SDK, framework plugins, frontend libraries, documentation, testing tools, developer portal, block explorer.

---

## Progress Summary

| Task | Status | Package |
|------|--------|---------|
| K-1 Hardhat Plugin | ✅ COMPLETE | `@tva-protocol/hardhat-plugin` |
| K-2 Developer SDK | ✅ COMPLETE | `@tva-protocol/sdk` |
| K-4 Wallet Integration | ✅ COMPLETE | `@tva-protocol/wallet-adapter` |
| K-5 ethers.js Adapter | ✅ COMPLETE | `@tva-protocol/ethers-adapter` |
| K-7 Documentation Portal | 🔄 IN PROGRESS | `@tva-protocol/docs` |
| K-3 Foundry Integration | ⏳ PENDING | - |
| K-6 Block Explorer | ⏳ PENDING | - |
| K-8 Testing Tools | ⏳ PENDING | - |
| K-9 TVA CLI | ⏳ PENDING | - |
| K-10 Verification Service | ⏳ PENDING | - |
| K-11 Example DApps | ⏳ PENDING | - |
| K-12 Testnet Faucet | ⏳ PENDING | - |

## Built Packages

All packages are located in `/packages/` and build successfully:

```bash
# Build all packages
cd packages && pnpm -r build
```

### Package Structure

```
packages/
├── sdk/                    # @tva-protocol/sdk
│   └── src/
│       ├── types/          # Type definitions
│       ├── rpc/            # RPC client for TVA JSON-RPC
│       ├── wallet/         # Key management and signing
│       ├── compiler/       # Solang compiler wrapper
│       ├── contract/       # Contract deployment and interaction
│       └── utils/          # Utilities (address conversion, encoding)
│
├── hardhat-plugin/         # @tva-protocol/hardhat-plugin
│   └── src/
│       ├── tasks/          # tva:compile, tva:deploy tasks
│       ├── config/         # Hardhat config extensions
│       └── artifacts/      # Artifact management
│
├── wallet-adapter/         # @tva-protocol/wallet-adapter
│   └── src/
│       ├── adapter/        # MetaMask adapter (TVAWalletAdapter)
│       └── keys/           # Key derivation (EVM→Stellar)
│
├── ethers-adapter/         # @tva-protocol/ethers-adapter
│   └── src/
│       ├── provider.ts     # TVAProvider (extends JsonRpcProvider)
│       ├── signer.ts       # TVASigner (extends AbstractSigner)
│       └── index.ts        # Exports
│
└── docs/                   # @tva-protocol/docs (Docusaurus)
    ├── docusaurus.config.ts
    └── sidebars.ts
```

### Chain ID

TVA Protocol uses chain ID **1414676736** (0x5448D640, ASCII "TVA\0")

---

## Phase 2: Developer SDK and Framework Plugins

### K-1: Hardhat Plugin (@tva-protocol/hardhat-plugin)
- **Priority:** P0
- **Phase:** 2-3
- **Status:** ✅ COMPLETE
- **Location:** `/packages/hardhat-plugin/`
- **Description:** Build a Hardhat plugin that enables seamless compilation and deployment of Solidity contracts to TVA/Soroban. The plugin intercepts the compilation step (using Solang instead of solc), handles deployment via the TVA RPC layer, and provides contract interaction through standard Hardhat patterns.
- **Completed Deliverables:**
  - ✅ npm package: `@tva-protocol/hardhat-plugin`
  - ✅ Custom compilation task (`tva:compile`): uses Solang binary for `--target soroban` compilation
  - ✅ Artifact generation: produces standard Hardhat artifact format from Solang output
  - ✅ Network configuration: pre-configured TVA testnet/mainnet/local entries
  - ✅ Deployment task (`tva:deploy`): deploys contracts via TVA RPC
  - ✅ TypeScript types and configuration extensions
  - ⏳ Contract verification: submit source for on-chain verification (pending K-10)
  - ⏳ Example project template (planned)
- **Dependencies:** A-5 (RPC server must be running), A-6 (tx translation for deployment)
- **Synergy:** Uses A-5 RPC endpoint; validated by A-10 integration tests; documented in K-7

### K-2: Developer SDK (@tva-protocol/sdk)
- **Priority:** P0
- **Phase:** 2-3
- **Status:** ✅ COMPLETE
- **Location:** `/packages/sdk/`
- **Description:** Build a TypeScript/JavaScript SDK that provides high-level APIs for interacting with TVA Protocol. Wraps the RPC layer with type-safe contract interaction, account management, and compilation utilities.
- **Completed Deliverables:**
  - ✅ npm package: `@tva-protocol/sdk`
  - ✅ Contract compilation API (`SolangCompiler` class wraps Solang binary)
  - ✅ Contract deployment API (`ContractDeployer` handles WASM upload + init)
  - ✅ Contract interaction API (`TVAContract` with type-safe calls from ABI)
  - ✅ RPC Client (`RpcClient` for direct TVA JSON-RPC communication)
  - ✅ Wallet module (key generation, mnemonic derivation, dual-key support)
  - ✅ Signer classes (`EvmSigner`, `StellarSigner`, `TVASigner`)
  - ✅ Type definitions (comprehensive types for all TVA/EVM/Stellar entities)
  - ✅ Error handling (`TVAError` with error codes and context)
  - ✅ Network configuration (testnet/mainnet/local with chain ID 1414676736)
  - ⏳ TTL management utilities (partial - needs A-2 completion)
  - ⏳ Event subscription (needs WebSocket support in RPC)
  - ⏳ Unit tests with >90% coverage (planned)
- **Dependencies:** A-5 (RPC endpoint), A-7 (AccountRegistry for account management), A-2 (TTL support)
- **Synergy:** Foundation for K-1 (Hardhat uses SDK internally), K-5 (ethers adapter wraps SDK)

### K-3: Foundry Integration Guide and Adapter
- **Priority:** P1
- **Phase:** 3
- **Description:** Create a Foundry-compatible workflow for TVA Protocol. Since Foundry uses forge/cast which communicate via JSON-RPC, the primary work is configuration and documentation. Build a thin adapter if needed for compilation (since Foundry uses solc natively).
- **Deliverables:**
  - Foundry configuration guide (`foundry.toml` for TVA networks)
  - Custom `forge script` examples for TVA deployment
  - `cast` command examples for contract interaction
  - Compilation wrapper: script that uses Solang then presents output in Forge-compatible format
  - Fork testing documentation (forking TVA testnet)
  - Example Foundry project with TVA deployment
  - Blog post / tutorial walkthrough
- **Dependencies:** A-5 (RPC must support forge's JSON-RPC calls), A-8 (block emulation for fork testing)
- **Synergy:** Validated by A-10 integration tests

---

## Phase 2-3: Frontend Libraries

### K-4: Wallet Integration (MetaMask + Custom Wallet Adapter)
- **Priority:** P0
- **Phase:** 2
- **Status:** ✅ COMPLETE
- **Location:** `/packages/wallet-adapter/`
- **Description:** Build the wallet adapter that enables MetaMask (and other EVM wallets) to work with TVA Protocol. Handle the dual-key challenge: EVM wallets sign with secp256k1, but Stellar needs Ed25519. The adapter manages key derivation and transaction re-signing.
- **Completed Deliverables:**
  - ✅ npm package: `@tva-protocol/wallet-adapter`
  - ✅ MetaMask custom network configuration (chainId 1414676736, RPC URL, XLM currency)
  - ✅ TVAWalletAdapter class (embedded browser module)
  - ✅ Key derivation: deterministic Ed25519 key from secp256k1 signature
  - ✅ Stellar keypair derivation (`deriveStellarKeypairFromSignature`)
  - ✅ Transaction signing flow with dual-signature support
  - ✅ Connection state management and event handling
  - ⏳ Account registration flow (needs A-7 AccountRegistry integration)
  - ⏳ WalletConnect v2 integration (planned)
  - ⏳ Demo application (planned)
  - ⏳ Security documentation (planned)
- **Dependencies:** A-5 (RPC endpoint), A-7 (AccountRegistry for registration)
- **Synergy:** Uses A-6 (transaction translation); critical for K-5 (ethers adapter)

### K-5: ethers.js / viem Adapter (@tva-protocol/ethers-adapter)
- **Priority:** P1
- **Phase:** 3
- **Status:** ✅ COMPLETE
- **Location:** `/packages/ethers-adapter/`
- **Description:** Build an adapter layer that makes ethers.js (v6) and viem work seamlessly with TVA Protocol. Handle any edge cases where TVA's RPC responses differ from standard Ethereum expectations (e.g., gas values, block structure, log format).
- **Completed Deliverables:**
  - ✅ npm package: `@tva-protocol/ethers-adapter`
  - ✅ `TVAProvider` class extending `JsonRpcProvider` with TVA-specific handling
  - ✅ `TVASigner` class extending `AbstractSigner` for transaction signing
  - ✅ Factory functions (`createTVAProvider`, `createTVASigner`, `createDualKeySigner`)
  - ✅ Network configuration with correct TVA chain ID
  - ✅ Block/receipt handling methods
  - ✅ Gas estimation integration
  - ✅ Re-exports common ethers utilities for convenience
  - ⏳ viem transport adapter (planned)
  - ⏳ Integration tests against running TVA RPC node (planned)
  - ⏳ Example React application (planned)
- **Dependencies:** A-5 (RPC), A-8 (block/receipt emulation must be correct), K-4 (wallet adapter for signing)
- **Synergy:** Used by K-7 (documentation examples use ethers.js)

---

## Phase 3: Documentation and Developer Portal

### K-6: Block Explorer Adapter
- **Priority:** P1
- **Phase:** 3
- **Description:** Build a block explorer that presents Stellar/Soroban data in an EVM-familiar format. Developers can look up transactions by EVM-format hash, view contract state, and browse events. Can be a standalone web app or an adapter for existing explorers (Blockscout).
- **Deliverables:**
  - Web application (Next.js or similar) with EVM-style explorer UI
  - Transaction view: shows EVM-format tx details with Soroban execution results
  - Contract view: shows verified source, ABI, read/write interface
  - Event/log browser: filter by contract, topic, block range
  - Account view: shows EVM address, linked Stellar address, balances, transactions
  - Block view: shows EVM-format block with contained transactions
  - API endpoints for programmatic access
  - Integration with contract verification (show verified source)
  - Link to Stellar expert/Stellar.expert for raw Stellar data
- **Dependencies:** A-8 (block/receipt emulation), A-1 (events for log display), A-7 (address resolution)
- **Synergy:** Uses A-8 data; validates A-5/A-6 correctness visually

### K-7: Documentation and Developer Portal
- **Priority:** P0
- **Phase:** 2-3
- **Status:** 🔄 IN PROGRESS
- **Location:** `/packages/docs/` (Docusaurus) + `/docs/` (source content)
- **Description:** Create comprehensive documentation covering the entire TVA developer experience. Include getting-started guides, API references, architecture explanations, and troubleshooting guides. Build a documentation website.
- **Completed Deliverables:**
  - ✅ Source documentation exists in `/docs/`:
    - architecture.md, developer-guide.md, rpc-layer.md, solang-compiler.md, stellar-integration.md
  - ✅ Docusaurus package scaffolded (`@tva-protocol/docs`)
  - ✅ Configuration files (docusaurus.config.ts, sidebars.ts)
  - ⏳ Documentation site build and styling
  - ⏳ Getting Started guide (5-minute quickstart)
  - ⏳ SDK API reference (auto-generated from JSDoc/TypeDoc)
  - ⏳ Hardhat plugin guide
  - ⏳ Wallet setup guide (MetaMask configuration)
  - ⏳ Contract examples with explanations
  - ⏳ FAQ and troubleshooting
  - ⏳ Migration guide (from EVM chain to TVA)
- **Dependencies:** A-5 (RPC docs need working endpoint), K-1 (Hardhat docs), K-2 (SDK docs)
- **Synergy:** Documents everything Agnij builds; references all K-* packages

### K-8: Testing Tools and Contract Test Helpers
- **Priority:** P1
- **Phase:** 3
- **Description:** Build testing utilities that help developers test their TVA contracts. Include a local simulation environment, test helpers for common patterns (mock auth, time manipulation), and a testing framework adapter.
- **Deliverables:**
  - `@tva-protocol/test-helpers` npm package
  - Local TVA node simulator (in-memory Soroban execution for fast tests)
  - Mock auth utilities (simulate requireAuth without real signatures)
  - Time/ledger manipulation (advance ledger sequence for TTL testing)
  - Snapshot/revert utilities (save/restore state between tests)
  - Gas/resource estimation in test output
  - Chai matchers for TVA-specific assertions (e.g., `expect(tx).to.revertWith("message")`)
  - Hardhat plugin integration (use test helpers within Hardhat tests)
  - Example test suite demonstrating all helpers
- **Dependencies:** A-10 (integration test framework), A-5 (RPC for simulation)
- **Synergy:** Builds on A-10 framework; documented in K-7; used by K-1 tests

---

## Phase 3-4: Advanced Tooling

### K-9: TVA CLI Tool
- **Priority:** P1
- **Phase:** 3
- **Description:** Build a unified CLI tool (`tva`) that wraps compilation, deployment, and interaction into a single developer-friendly interface. Abstracts away the complexity of managing Solang, Stellar CLI, and RPC configuration.
- **Deliverables:**
  - npm package: `@tva-protocol/cli` (installable via `npm install -g`)
  - `tva init <project>` -- scaffold a new TVA project
  - `tva compile` -- compile all .sol files to .wasm via Solang
  - `tva deploy <Contract> --network <net>` -- deploy compiled WASM
  - `tva interact <contract> <function> [args]` -- call contract functions
  - `tva console --network <net>` -- interactive REPL with ethers.js
  - `tva test` -- run contract tests
  - `tva account create` -- generate keypair and register with AccountRegistry
  - `tva faucet` -- request testnet XLM
  - `tva status` -- show network info, deployed contracts, account balance
  - Configuration file (tva.config.js) for project settings
  - Auto-download of Solang binary on first use
  - Colored terminal output, progress indicators
- **Dependencies:** K-2 (SDK for contract interaction), A-5 (RPC endpoint), K-1 (reuses compilation logic)
- **Synergy:** Top-level UX layer; depends on most other components

### K-10: Contract Verification Service
- **Priority:** P2
- **Phase:** 3-4
- **Description:** Build a service that verifies deployed contract source code. Developers submit Solidity source; the service compiles it with the same Solang version and verifies the output matches the deployed WASM. Verified contracts show source in the block explorer.
- **Deliverables:**
  - Backend service (Rust or Node.js) that accepts source submissions
  - Deterministic compilation (same Solang version, same flags -> same WASM)
  - WASM hash comparison (deployed vs. locally compiled)
  - Verification status stored on-chain or in database
  - API for K-6 (explorer) to query verification status
  - Web interface for manual source submission
  - Hardhat plugin integration (auto-verify on deploy)
- **Dependencies:** A-12 (compilation must be deterministic), K-6 (explorer displays results)
- **Synergy:** Integrates with K-1 (auto-verify), K-6 (display verified source), K-9 (CLI verify command)

### K-11: Example DApps and Templates
- **Priority:** P2
- **Phase:** 3-4
- **Description:** Build reference decentralized applications that demonstrate TVA Protocol capabilities. Include a token swap, an NFT minting page, and a governance interface. These serve as both validation and marketing materials.
- **Deliverables:**
  - Token swap DApp (React + ethers.js + TVA adapter)
    - Uses TVAToken contract for demo tokens
    - Simple AMM-style price curve
    - MetaMask wallet connection
  - NFT minting DApp
    - Simple NFT contract compiled to Soroban
    - Mint page with MetaMask
    - Gallery view
  - Governance DApp
    - Proposal creation and voting
    - Token-weighted voting
    - Timelock execution
  - Project templates for `tva init --template <name>`
  - Deployment scripts for each DApp
  - Tutorial blog posts for each
- **Dependencies:** K-4 (wallet), K-5 (ethers adapter), K-9 (CLI for deployment)
- **Synergy:** Validates entire stack end-to-end; marketing material

### K-12: Testnet Faucet Service
- **Priority:** P2
- **Phase:** 3
- **Description:** Build and deploy a faucet service that provides testnet XLM to developers. Integrate with the TVA CLI and developer portal.
- **Deliverables:**
  - Web service with rate limiting (per-address, per-IP)
  - Web UI (simple form: enter address, receive XLM)
  - API endpoint for programmatic access (used by `tva faucet` CLI command)
  - Friendbot integration (Stellar testnet's native faucet) or own funded account
  - Anti-abuse measures (captcha for web, API key for CLI)
  - Monitoring and fund level alerts
- **Dependencies:** A-7 (AccountRegistry for address validation)
- **Synergy:** Used by K-9 (CLI faucet command), K-7 (docs reference it)

---

## Summary

| ID | Title | Priority | Phase | Status | Dependencies |
|----|-------|----------|-------|--------|--------------|
| K-1 | Hardhat Plugin | P0 | 2-3 | ✅ COMPLETE | A-5, A-6 |
| K-2 | Developer SDK | P0 | 2-3 | ✅ COMPLETE | A-5, A-7, A-2 |
| K-3 | Foundry Integration | P1 | 3 | ⏳ PENDING | A-5, A-8 |
| K-4 | Wallet Integration | P0 | 2 | ✅ COMPLETE | A-5, A-7 |
| K-5 | ethers.js Adapter | P1 | 3 | ✅ COMPLETE | A-5, A-8, K-4 |
| K-6 | Block Explorer | P1 | 3 | ⏳ PENDING | A-8, A-1, A-7 |
| K-7 | Documentation Portal | P0 | 2-3 | 🔄 IN PROGRESS | A-5, K-1, K-2 |
| K-8 | Testing Tools | P1 | 3 | ⏳ PENDING | A-10, A-5 |
| K-9 | TVA CLI | P1 | 3 | ⏳ PENDING | K-2, A-5, K-1 |
| K-10 | Verification Service | P2 | 3-4 | ⏳ PENDING | A-12, K-6 |
| K-11 | Example DApps | P2 | 3-4 | ⏳ PENDING | K-4, K-5, K-9 |
| K-12 | Testnet Faucet | P2 | 3 | ⏳ PENDING | A-7 |

---

## Cross-References to Agnij's Tasks

- K-1 (Hardhat) <- A-5 (RPC server provides endpoint), A-6 (tx translation for deploys)
- K-2 (SDK) <- A-5 (RPC), A-7 (AccountRegistry), A-2 (TTL support)
- K-3 (Foundry) <- A-5 (RPC for forge commands), A-8 (block emulation for fork testing)
- K-4 (Wallet) <- A-5 (RPC endpoint), A-7 (account registration)
- K-5 (ethers) <- A-5 (RPC), A-8 (block/receipt format)
- K-6 (Explorer) <- A-8 (block data), A-1 (events), A-7 (address resolution)
- K-7 (Docs) <- A-5 (RPC API docs), A-14 (msg.sender shim simplifies docs), A-15 (storage inference simplifies docs)
- K-8 (Tests) <- A-10 (integration test framework provides base)
- K-9 (CLI) <- K-2 (SDK), A-5 (RPC), K-1 (compilation logic)
- K-10 (Verify) <- A-12 (deterministic compilation)
- K-12 (Faucet) <- A-7 (address validation)

---

## Collaboration Points

The key synergy between Agnij and Arko's work:

1. **Agnij builds infrastructure, Arko builds interfaces:** Every tool Arko creates consumes the RPC layer (A-5/A-6/A-8) that Agnij builds. If the RPC is correct, all tooling works.

2. **Arko validates Agnij's work:** Each tool Arko builds exercises different aspects of the infrastructure. The Hardhat plugin tests compilation; the wallet tests account management; the explorer tests block emulation; the SDK tests the full API surface.

3. **Compiler extensions unlock DX improvements:** Agnij's compiler work (A-14 msg.sender shimming, A-15 storage inference) directly simplifies what Arko needs to document and what developers need to learn.

4. **Testing loops:** Arko's K-8 testing tools build on Agnij's A-10 integration framework. Both feed into A-11 CI/CD pipeline. This creates a virtuous cycle where infrastructure improvements are immediately validated by tooling tests.

5. **Parallel execution:** After A-5 (RPC) is minimally functional, Arko can begin K-1/K-2/K-4/K-7 in parallel with Agnij continuing A-6/A-7/A-8. The RPC endpoint is the critical handoff point.
