# TVA Protocol -- Tasks: Arko (Integration / Tooling Dev)

Role: Developer SDK, framework plugins, frontend libraries, documentation, testing tools, developer portal, block explorer.

---

## Phase 2: Developer SDK and Framework Plugins

### K-1: Hardhat Plugin (@tva-protocol/hardhat-plugin)
- **Priority:** P0
- **Phase:** 2-3
- **Description:** Build a Hardhat plugin that enables seamless compilation and deployment of Solidity contracts to TVA/Soroban. The plugin intercepts the compilation step (using Solang instead of solc), handles deployment via the TVA RPC layer, and provides contract interaction through standard Hardhat patterns.
- **Deliverables:**
  - npm package: `@tva-protocol/hardhat-plugin`
  - Custom compilation task: uses Solang binary for `--target soroban` compilation
  - Artifact generation: produces standard Hardhat artifact format (.json with ABI + bytecode) from Solang output (.wasm + .abi)
  - Network configuration: pre-configured TVA testnet/mainnet entries
  - Deployment integration: `hardhat deploy` works against TVA RPC
  - Contract verification: submit source for on-chain verification
  - TypeScript types for contract interactions
  - Example project template (`npx hardhat init --template tva`)
  - README with getting-started guide
- **Dependencies:** A-5 (RPC server must be running), A-6 (tx translation for deployment)
- **Synergy:** Uses A-5 RPC endpoint; validated by A-10 integration tests; documented in K-7

### K-2: Developer SDK (@tva-protocol/sdk)
- **Priority:** P0
- **Phase:** 2-3
- **Description:** Build a TypeScript/JavaScript SDK that provides high-level APIs for interacting with TVA Protocol. Wraps the RPC layer with type-safe contract interaction, account management, and compilation utilities.
- **Deliverables:**
  - npm package: `@tva-protocol/sdk`
  - Contract compilation API (wraps Solang binary invocation)
  - Contract deployment API (handles WASM upload + init call)
  - Contract interaction API (type-safe function calls from ABI)
  - Account management (key generation, registration with AccountRegistry)
  - TTL management utilities (extend contract/variable TTLs)
  - Transaction builder (construct EVM-format transactions for TVA RPC)
  - Event subscription (WebSocket-based log streaming)
  - Error handling (decode Soroban errors into human-readable messages)
  - Comprehensive JSDoc documentation
  - Unit tests with >90% coverage
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
- **Description:** Build the wallet adapter that enables MetaMask (and other EVM wallets) to work with TVA Protocol. Handle the dual-key challenge: EVM wallets sign with secp256k1, but Stellar needs Ed25519. The adapter manages key derivation and transaction re-signing.
- **Deliverables:**
  - MetaMask custom network configuration (chainId, RPC URL, native currency as XLM)
  - TVA Wallet Adapter library (browser extension or embedded module)
  - Key derivation: deterministic Ed25519 key from secp256k1 seed
  - Transaction signing flow: EVM wallet signs -> adapter re-signs for Stellar
  - Account registration flow: guide user through AccountRegistry registration
  - WalletConnect v2 integration
  - Demo application showing wallet connection flow
  - Security documentation (key management, signing flow audit notes)
- **Dependencies:** A-5 (RPC endpoint), A-7 (AccountRegistry for registration)
- **Synergy:** Uses A-6 (transaction translation); critical for K-5 (ethers adapter)

### K-5: ethers.js / viem Adapter (@tva-protocol/ethers-adapter)
- **Priority:** P1
- **Phase:** 3
- **Description:** Build an adapter layer that makes ethers.js (v6) and viem work seamlessly with TVA Protocol. Handle any edge cases where TVA's RPC responses differ from standard Ethereum expectations (e.g., gas values, block structure, log format).
- **Deliverables:**
  - npm package: `@tva-protocol/ethers-adapter`
  - Custom `JsonRpcProvider` subclass with TVA-specific handling
  - Custom `Signer` implementation that integrates with wallet adapter
  - Block/receipt type mapping (handle Stellar-specific fields)
  - Gas estimation override (translate Soroban resources to gas equivalent)
  - Event/log filtering with proper topic encoding
  - viem transport adapter (for projects using viem instead of ethers)
  - Integration tests against running TVA RPC node
  - Example React application using the adapter
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
- **Description:** Create comprehensive documentation covering the entire TVA developer experience. Include getting-started guides, API references, architecture explanations, and troubleshooting guides. Build a documentation website.
- **Deliverables:**
  - Documentation site (Docusaurus or similar) at docs.tva-protocol.io
  - Getting Started guide (5-minute quickstart)
  - Architecture overview (how TVA works, with diagrams)
  - Solidity-on-Soroban guide (what works, what differs, patterns to use)
  - RPC API reference (all supported eth_* methods with examples)
  - SDK API reference (auto-generated from JSDoc/TypeDoc)
  - Hardhat plugin guide
  - Foundry integration guide
  - Wallet setup guide (MetaMask configuration)
  - Contract examples (Counter, Token, Registry with explanations)
  - FAQ and troubleshooting
  - Migration guide (from EVM chain to TVA)
  - Compiler constraints reference (what Solang Soroban supports/lacks)
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

| ID | Title | Priority | Phase | Dependencies |
|----|-------|----------|-------|--------------|
| K-1 | Hardhat Plugin | P0 | 2-3 | A-5, A-6 |
| K-2 | Developer SDK | P0 | 2-3 | A-5, A-7, A-2 |
| K-3 | Foundry Integration | P1 | 3 | A-5, A-8 |
| K-4 | Wallet Integration | P0 | 2 | A-5, A-7 |
| K-5 | ethers.js Adapter | P1 | 3 | A-5, A-8, K-4 |
| K-6 | Block Explorer | P1 | 3 | A-8, A-1, A-7 |
| K-7 | Documentation Portal | P0 | 2-3 | A-5, K-1, K-2 |
| K-8 | Testing Tools | P1 | 3 | A-10, A-5 |
| K-9 | TVA CLI | P1 | 3 | K-2, A-5, K-1 |
| K-10 | Verification Service | P2 | 3-4 | A-12, K-6 |
| K-11 | Example DApps | P2 | 3-4 | K-4, K-5, K-9 |
| K-12 | Testnet Faucet | P2 | 3 | A-7 |

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
