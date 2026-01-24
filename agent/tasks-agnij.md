# mrkl -- Tasks: Agnij (Protocol Architect / Systems Dev)

Role: Core infrastructure, compiler extensions, RPC translation engine, testing, CI/CD, performance.

---

## Phase 1: Foundation (Current)

### A-1: Solang Compiler Event Emission Extension
- **Priority:** P0
- **Phase:** 1
- **Description:** Implement Soroban event emission in the Solang compiler. The current codegen has a `todo!()` stub at `src/codegen/events/mod.rs:54` for the Soroban target. Implement a `SorobanEventEmitter` that uses the `log_from_linear_memory` host function to emit contract events with topics and data payloads matching Soroban's event model.
- **Deliverables:**
  - New file: `src/codegen/events/soroban.rs` implementing `EventEmitter` trait
  - Match pattern in `new_event_emitter()` for `Target::Soroban`
  - Events encode topic names and data values into ScVal format
  - Support for indexed parameters (as Soroban topics)
  - Integration tests in `tests/soroban_testcases/events.rs`
  - Updated reference contracts with event emission
- **Dependencies:** None (foundational)
- **Synergy:** Enables K-3 (block explorer adapter needs events), K-5 (ethers.js adapter needs log subscription)

### A-2: Extend extendTtl Support to All Persistent Types
- **Priority:** P0
- **Phase:** 1
- **Description:** Currently `extendTtl()` only works on `uint64` persistent/temporary variables. Extend support to `int128`, `uint128`, `uint32`, `int64`, `bool`, `address`, `string`, and mapping value entries. This requires changes to the TTL codegen path and host function call generation.
- **Deliverables:**
  - Modified TTL codegen to handle all scalar types
  - Support for `extendTtl()` on individual mapping entries (requires computing composite storage keys)
  - Updated `tests/soroban_testcases/ttl.rs` with comprehensive type coverage
  - Documentation of supported TTL patterns
- **Dependencies:** None (foundational)
- **Synergy:** Enables K-2 (SDK needs reliable TTL management across all types)

### A-3: Soroban Encoding for Fixed-Byte Types
- **Priority:** P0
- **Phase:** 1
- **Description:** Fix the `unimplemented!()` panic in `src/codegen/encoding/soroban_encoding.rs:206` for fixed-byte types (`bytes1` through `bytes32`). Implement ScVal encoding/decoding for these types, likely using Soroban's `Bytes` host object type. Also fix their use as mapping keys.
- **Deliverables:**
  - Encoding/decoding for `bytesN` types (1-32) to ScVal Bytes objects
  - `bytesN` as mapping key types without panics
  - Integration tests with bytes-keyed mappings
  - Updated AccountRegistry to optionally use bytes20/bytes32 (once fixed)
- **Dependencies:** None (foundational)
- **Synergy:** Enables A-7 (AccountRegistry needs native byte-addressed mappings)

### A-4: Reference Contract Test Suite
- **Priority:** P1
- **Phase:** 1
- **Description:** Build a comprehensive test suite that compiles and functionally tests all reference contracts (Counter, TVAToken, AccountRegistry) using Solang's Soroban test infrastructure (`SorobanEnv`). Verify correct state transitions, authorization, TTL behavior, and error handling.
- **Deliverables:**
  - `tests/soroban_testcases/tva_counter.rs` -- Counter contract tests
  - `tests/soroban_testcases/tva_token.rs` -- Token transfer/mint/burn/allowance tests
  - `tests/soroban_testcases/tva_registry.rs` -- AccountRegistry CRUD tests
  - CI integration (GitHub Actions workflow)
  - Test coverage report
- **Dependencies:** A-1 (events needed for full test coverage once implemented)
- **Synergy:** Validates K-2 (SDK patterns) and K-7 (documentation examples)

---

## Phase 2: RPC Translation Layer

### A-5: Core RPC Server Implementation
- **Priority:** P0
- **Phase:** 2
- **Description:** Implement the TVA RPC server that accepts Ethereum JSON-RPC requests and translates them to Stellar/Soroban API calls. Start with the minimal set needed for contract interaction: `eth_call`, `eth_sendRawTransaction`, `eth_getTransactionReceipt`, `eth_blockNumber`, `eth_chainId`.
- **Deliverables:**
  - Rust crate: `rpc/` with async JSON-RPC server (jsonrpsee or similar)
  - Transaction format translation (EVM tx -> Stellar InvokeHostFunction)
  - ABI-to-ScVal argument re-encoding
  - Stellar SDK integration for transaction submission
  - Basic error translation (Soroban errors -> EVM revert reasons)
  - Unit tests for all translation paths
  - Docker container for the RPC node
- **Dependencies:** A-4 (need tested contracts to validate against)
- **Synergy:** Enables K-1 (Hardhat plugin connects to this), K-4 (wallet integration uses this), K-5 (ethers.js adapter targets this)

### A-6: Transaction Translation Engine
- **Priority:** P0
- **Phase:** 2
- **Description:** Build the bidirectional translation engine that converts EVM transaction formats to Stellar transaction formats and vice versa. Handle: calldata decoding (selector -> function name), ABI parameter decoding and ScVal re-encoding, fee estimation via Soroban simulation, and receipt construction from Stellar transaction results.
- **Deliverables:**
  - `rpc/src/translator/` module with tx_to_stellar, stellar_to_receipt functions
  - ABI registry (stores compiled contract ABIs for selector lookup)
  - Fee model translation (gas -> stroops via simulation)
  - Nonce/sequence number management
  - Signature scheme bridging (secp256k1 EVM sig -> Ed25519 Stellar sig via wallet adapter)
  - Comprehensive property-based tests (any valid EVM tx round-trips correctly)
- **Dependencies:** A-5 (lives within the RPC server)
- **Synergy:** Core dependency for K-1, K-4, K-5

### A-7: AccountRegistry System (On-Chain + RPC Integration)
- **Priority:** P1
- **Phase:** 2
- **Description:** Deploy the AccountRegistry contract and integrate it with the RPC layer. The RPC server uses the registry to resolve 20-byte EVM addresses to Soroban contract IDs and account addresses. Implement the registration flow where users prove ownership of both key types.
- **Deliverables:**
  - AccountRegistry contract deployed to testnet
  - RPC integration: address resolution via on-chain lookup
  - Registration API endpoint (REST, not JSON-RPC) for new account creation
  - Caching layer for address lookups (avoid repeated contract calls)
  - Key derivation documentation (how EVM address maps to Soroban address)
- **Dependencies:** A-3 (ideally uses bytes20/bytes32; works with address type as fallback), A-5
- **Synergy:** Enables K-4 (wallet needs account registration), K-6 (explorer needs address resolution)

### A-8: Block and Receipt Emulator
- **Priority:** P1
- **Phase:** 2
- **Description:** Implement the EVM block/receipt construction from Stellar ledger data. Map ledger sequences to block numbers, ledger close times to timestamps, transaction results to receipts, and Soroban events to EVM logs.
- **Deliverables:**
  - `rpc/src/emulator/` module with block_from_ledger, receipt_from_result functions
  - Stellar Horizon API integration for historical ledger queries
  - Log/event translation (Soroban contract events -> EVM log format with topics)
  - WebSocket subscription support (eth_subscribe for new blocks/logs)
  - Gas usage estimation from Soroban resource consumption
- **Dependencies:** A-5, A-6
- **Synergy:** Enables K-5 (ethers.js needs blocks/receipts), K-6 (explorer needs block data)

### A-9: Storage Manager (TTL Auto-Management in RPC)
- **Priority:** P2
- **Phase:** 2
- **Description:** Implement transparent state archival recovery in the RPC layer. When a contract call fails due to archived state, the RPC automatically submits a restoration transaction, waits for confirmation, and retries the original call. Also implement proactive TTL extension for frequently-accessed contracts.
- **Deliverables:**
  - State archival detection (parse Soroban error responses)
  - Automatic restoration transaction construction and submission
  - Retry logic with configurable timeout
  - Proactive TTL monitoring service (background thread)
  - Configuration for TTL extension thresholds per contract
  - Metrics/logging for archival events
- **Dependencies:** A-5, A-8
- **Synergy:** Transparent to K-1/K-5 users but critical for production reliability

---

## Phase 3: Testing and CI/CD

### A-10: Integration Test Framework
- **Priority:** P1
- **Phase:** 2-3
- **Description:** Build an end-to-end integration test framework that exercises the full pipeline: Solidity source -> Solang compilation -> WASM deployment -> RPC interaction -> Stellar settlement. Use a local Stellar quickstart container or testnet.
- **Deliverables:**
  - `tests/integration/` directory with E2E test scenarios
  - Docker Compose setup (RPC node + Stellar quickstart)
  - Test scenarios: deploy, call, transfer, event subscription, error handling
  - CI pipeline (GitHub Actions) running full integration suite
  - Performance benchmarks (compilation time, tx latency, gas estimation accuracy)
- **Dependencies:** A-5, A-6, A-8
- **Synergy:** Validates everything Arko builds (K-1 through K-7)

### A-11: CI/CD Pipeline
- **Priority:** P1
- **Phase:** 2
- **Description:** Set up comprehensive CI/CD for the entire mrkl monorepo. Includes Solang build verification, contract compilation checks, RPC unit tests, integration tests, and deployment automation.
- **Deliverables:**
  - GitHub Actions workflow: build Solang from source (cached)
  - Workflow: compile all contracts, verify WASM output
  - Workflow: run RPC unit tests
  - Workflow: run integration tests (Docker-based)
  - Release automation: versioned binary builds
  - Deployment scripts for testnet RPC node
- **Dependencies:** A-4, A-10
- **Synergy:** Arko's tooling (K-1, K-2) integrates into this pipeline

---

## Phase 4: Performance and Production

### A-12: Compilation Performance Optimization
- **Priority:** P2
- **Phase:** 3-4
- **Description:** Optimize the Solang compilation pipeline for TVA's use case. Reduce compilation time, minimize WASM output size, and improve runtime efficiency of compiled contracts.
- **Deliverables:**
  - WASM size optimization (dead code elimination, function merging)
  - Compilation time profiling and bottleneck reduction
  - LLVM optimization pass tuning for Soroban WASM
  - Benchmark suite comparing output size/performance across contract types
  - Documentation of optimization techniques applied
- **Dependencies:** A-1, A-2, A-3 (compiler extensions complete)
- **Synergy:** Benefits K-1 (faster Hardhat builds), K-2 (SDK compilation calls)

### A-13: RPC Performance and Reliability
- **Priority:** P1
- **Phase:** 4
- **Description:** Production-harden the RPC server. Implement connection pooling, request batching, caching, rate limiting, and monitoring. Target: 1000+ concurrent connections, <100ms translation latency.
- **Deliverables:**
  - Connection pooling for Stellar RPC backend
  - Response caching (blocks, receipts, code queries)
  - Rate limiting with configurable tiers
  - Prometheus metrics endpoint
  - Health check and readiness probes
  - Load test results (k6 or similar)
  - Horizontal scaling documentation
- **Dependencies:** A-5, A-8 (RPC server complete)
- **Synergy:** Production reliability for all of Arko's tooling

### A-14: msg.sender Auto-Shimming Compiler Extension
- **Priority:** P2
- **Phase:** 3
- **Description:** Implement a Solang compiler extension that automatically transforms `msg.sender` usage patterns into Soroban-compatible `requireAuth()` patterns. This allows developers to write standard EVM-style Solidity (with msg.sender) and have it compile correctly for Soroban.
- **Deliverables:**
  - AST transformation pass: detect msg.sender reads
  - Generate requireAuth calls on the appropriate parameter
  - Handle common patterns: `require(msg.sender == owner)` -> `owner.requireAuth()`
  - Handle transfer patterns: add `from` parameter, insert `from.requireAuth()`
  - Comprehensive test cases for transformation correctness
  - Documentation of supported/unsupported patterns
- **Dependencies:** A-1, A-4 (base compiler work done)
- **Synergy:** Major enabler for K-7 (documentation can show standard Solidity), K-1 (Hardhat users write normal Solidity)

### A-15: Automatic Storage Type Inference Extension
- **Priority:** P2
- **Phase:** 3
- **Description:** Implement a compiler pass that analyzes variable usage patterns and automatically assigns Soroban storage types (temporary/instance/persistent) without requiring developer annotation. This removes the last major source of Soroban-specific knowledge needed by developers.
- **Deliverables:**
  - Usage analysis pass: track read/write patterns per variable
  - Inference rules: single-function-scope -> temporary, set-once-config -> instance, multi-tx -> persistent
  - Override mechanism: explicit annotation takes precedence
  - Warning when inference is ambiguous
  - Test suite validating inference correctness
- **Dependencies:** A-2 (TTL support complete)
- **Synergy:** Enables K-7 (docs can omit storage type discussion), K-1 (Hardhat projects just work)

---

## Summary

| ID | Title | Priority | Phase | Dependencies |
|----|-------|----------|-------|--------------|
| A-1 | Event Emission Extension | P0 | 1 | None |
| A-2 | extendTtl All Types | P0 | 1 | None |
| A-3 | Fixed-Byte Type Encoding | P0 | 1 | None |
| A-4 | Reference Contract Tests | P1 | 1 | A-1 |
| A-5 | Core RPC Server | P0 | 2 | A-4 |
| A-6 | Transaction Translation Engine | P0 | 2 | A-5 |
| A-7 | AccountRegistry Integration | P1 | 2 | A-3, A-5 |
| A-8 | Block/Receipt Emulator | P1 | 2 | A-5, A-6 |
| A-9 | Storage Manager (TTL Auto) | P2 | 2 | A-5, A-8 |
| A-10 | Integration Test Framework | P1 | 2-3 | A-5, A-6, A-8 |
| A-11 | CI/CD Pipeline | P1 | 2 | A-4, A-10 |
| A-12 | Compilation Optimization | P2 | 3-4 | A-1, A-2, A-3 |
| A-13 | RPC Performance | P1 | 4 | A-5, A-8 |
| A-14 | msg.sender Auto-Shimming | P2 | 3 | A-1, A-4 |
| A-15 | Storage Type Inference | P2 | 3 | A-2 |

---

## Cross-References to Arko's Tasks

- A-1 (Events) -> K-3 (Explorer needs event data), K-5 (ethers.js needs log subscriptions)
- A-2 (TTL) -> K-2 (SDK needs reliable TTL APIs)
- A-5 (RPC) -> K-1 (Hardhat plugin), K-4 (Wallet), K-5 (ethers.js adapter)
- A-6 (Tx Translation) -> K-1, K-4, K-5 (all tooling uses translations)
- A-7 (Registry) -> K-4 (Wallet registration flow)
- A-8 (Block Emulator) -> K-5 (ethers.js blocks/receipts), K-6 (Explorer)
- A-10 (Integration Tests) -> K-8 (Testing tools build on this framework)
- A-14 (msg.sender shim) -> K-7 (Docs can show standard Solidity patterns)
- A-15 (Storage inference) -> K-7 (Docs can omit Soroban-specific annotations)
