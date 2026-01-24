TVA Protocol
An EVM Compatibility Layer on Stellar via Compilation-Based Translation

Abstract

TVA Protocol is an EVM compatibility layer that enables developers to write standard Solidity smart contracts and deploy them natively to Stellar's Soroban smart contract platform. Rather than interpreting EVM bytecode within a runtime environment, TVA compiles Solidity source code through the Solang compiler's LLVM-based pipeline to produce Soroban-compatible WebAssembly modules. A complementary RPC translation layer converts Ethereum JSON-RPC calls into Stellar/Soroban API calls, enabling unmodified EVM tooling (Hardhat, Foundry, ethers.js, MetaMask) to interact with contracts settled on Stellar.

The result is a system where developers retain their existing Solidity workflow and toolchain while inheriting Stellar's 5-second deterministic finality, sub-cent transaction fees, and native multi-asset infrastructure. This paper formalizes the architecture, details the compilation pipeline, specifies the translation layer, analyzes the security model, and positions TVA relative to existing EVM compatibility solutions.


1. Introduction

1.1 The Developer Adoption Problem

Stellar's Soroban smart contract platform provides a technically sound execution environment: sandboxed WebAssembly execution, resource-based fee metering, and deterministic finality via the Stellar Consensus Protocol (SCP). However, developer adoption remains constrained by ecosystem friction. Soroban's primary language is Rust, its tooling ecosystem is nascent relative to Ethereum's decade of maturity, and developers must learn novel paradigms including state archival, TTL management, and the ScVal-based host-guest architecture.

The Ethereum ecosystem, by contrast, has accumulated significant developer capital: hundreds of thousands of Solidity developers, battle-tested DeFi protocol implementations (Uniswap, Aave, Compound), mature development frameworks (Hardhat, Foundry), comprehensive security tooling (Slither, Mythril, Echidna), and established token standards (ERC20, ERC721, ERC1155, ERC4626).

1.2 The Core Insight

TVA Protocol inverts the conventional approach to blockchain interoperability. Rather than asking developers to port their code or learn new paradigms, we bring the target execution environment to them. If Solidity source code can be compiled to Soroban WASM and EVM-format transactions can be faithfully translated to Stellar transactions, then the entire Ethereum developer ecosystem gains access to Stellar's settlement infrastructure without modification.

This insight leads to a compilation-based architecture rather than an interpretation-based one. The distinction is fundamental: interpretation requires running an EVM bytecode interpreter as a Soroban contract (incurring overhead and complexity), while compilation produces native Soroban WASM that executes at full VM efficiency.

1.3 Why Not Another L2

Existing EVM Layer 2 solutions (Optimism, Arbitrum, zkSync, Polygon zkEVM) settle back to Ethereum L1. They inherit Ethereum's economic model, are constrained by its data availability, cannot natively interact with non-Ethereum assets, and introduce bridge-based security assumptions. TVA Protocol is not a Layer 2. It is a compilation target and translation layer. Transactions are Stellar-native from the moment they enter the system: no rollup proofs, no challenge periods, no data availability committees.


2. Compilation Pipeline

2.1 Architecture

The compilation pipeline leverages the Solang compiler, an LLVM-based Solidity compiler originally developed under Hyperledger that targets multiple blockchain platforms including Soroban. The pipeline is structured as follows:

    Solidity Source (.sol)
            |
            v
    [Solang Frontend]
    - Lexer/Parser (solang-parser)
    - Semantic Analysis
    - Type Checking and Resolution
    - AST Construction
            |
            v
    [Codegen Phase]
    - Control Flow Graph (CFG) generation
    - Soroban-specific dispatch (function export wrappers)
    - Soroban encoding (ScVal serialization)
    - Host function mapping
            |
            v
    [LLVM IR Emission]
    - LLVM 16 module construction
    - TargetRuntime implementation for Soroban
    - Storage operations via Soroban host functions
    - ScVal encoding for all values
            |
            v
    [LLVM Backend]
    - Optimization passes (O2/O3)
    - WebAssembly target (wasm32-unknown-unknown)
    - Object file generation
            |
            v
    [Soroban Linker]
    - wasm-ld linking
    - Import section rewriting (host function resolution)
    - Memory configuration (1 MiB initial)
            |
            v
    [Output]
    - .wasm file (Soroban-compatible WebAssembly)
    - Contract spec metadata (ScSpecEntry per public function)

2.2 Semantic Translation Rules

The compiler performs the following key translations between EVM and Soroban semantics:

Storage Model: EVM's flat 256-bit slot-addressed storage maps to Soroban's typed contract data entries. Soroban distinguishes three storage classes -- temporary (deleted after invocation), instance (lives with contract instance), and persistent (durable, TTL-managed). The Solang Soroban target supports explicit annotation of storage types via the `persistent`, `instance`, and `temporary` keywords on state variables.

Function Dispatch: EVM uses 4-byte keccak256 selectors with ABI-encoded calldata. Soroban uses named WASM function exports. The compiler generates wrapper CFGs for each public function that decode ScVal arguments from the Soroban host, call the actual function logic, and encode return values back to ScVal.

Value Encoding: EVM's ABI encoding (padded 32-byte slots) translates to Soroban's ScVal tagged 64-bit values. Small integers are tagged inline; large values use host object references; strings and byte arrays use linear memory with host function calls.

Authorization: EVM relies on `msg.sender` for caller identification. Soroban has no equivalent -- instead, it uses `requireAuth()` calls on address values, where the address holder must have pre-authorized the invocation. Contracts must be written with explicit `address.requireAuth()` patterns rather than implicit sender checks.

Integer Types: EVM uses arbitrary-width integers (uint8 through uint256). Soroban's Solang target rounds integer widths to 32, 64, or 128 bits. The semantic behavior is preserved but storage efficiency differs.

Mappings: Solidity's `mapping(K => V)` type compiles to individual Soroban contract data entries with composite keys. Each mapping access becomes a separate host function call for storage read/write.

2.3 Current Compiler Constraints

The current Solang Soroban target (version 5a48c04) has the following known limitations that TVA Protocol's compiler extensions will address:

- Event emission: The Soroban target has a `todo!()` stub for event codegen. Events are parsed but not emitted. This is a priority extension for TVA.
- extendTtl scope: The `.extendTtl()` method only works on `uint64` persistent/temporary state variables, not on mapping values or other types.
- Mapping key types: Only `address` and integer types are fully supported as mapping keys. Fixed-byte types (`bytes20`, `bytes32`) cause encoder panics.
- Integer type support: `extendTtl()` is restricted to `uint64` variables; `int128` and other widths do not support this method.
- No inline assembly: Soroban WASM does not support EVM assembly; alternative optimization patterns are needed.
- No delegatecall: Soroban's execution model does not support execution in another contract's storage context.

These constraints are engineering gaps in the compiler, not fundamental architectural limitations. TVA Protocol's roadmap includes addressing each through compiler extensions.


3. RPC Translation Layer

3.1 Design

The TVA RPC layer is a stateless translation server that accepts Ethereum JSON-RPC requests and translates them into corresponding Stellar/Soroban API calls. It implements the standard `eth_*` namespace, enabling any EVM-compatible client to interact with deployed Soroban contracts without modification.

The translation is bidirectional: outbound (EVM tx format to Stellar tx format) and inbound (Stellar ledger data to EVM block/receipt format).

3.2 Transaction Translation

An Ethereum transaction contains: nonce, gas price, gas limit, to (contract address), value (ETH amount), data (ABI-encoded calldata), and signature (v, r, s).

The RPC layer translates this to a Stellar transaction containing: source account, fee (in stroops), sequence number, and an InvokeHostFunction operation specifying the contract ID, function name, and ScVal-encoded arguments.

Translation steps:
1. Address Resolution: Map the 20-byte Ethereum address to its corresponding Soroban contract ID via the AccountRegistry.
2. Calldata Decoding: Extract the 4-byte function selector, look up the function name from the compiled ABI, decode ABI-encoded parameters, and re-encode as ScVal arguments.
3. Fee Translation: Convert gas-based fee model to Soroban's resource-based fee model via simulation.
4. Signature Handling: The wallet adapter manages dual-key operations (secp256k1 for EVM signing, Ed25519 for Stellar submission).

3.3 Block and Receipt Emulation

The RPC layer constructs EVM-compatible responses from Stellar data:
- Stellar ledger sequence maps to EVM block number
- Ledger close time maps to block timestamp
- Transaction set hash maps to block hash
- Soroban transaction results map to EVM transaction receipts
- Soroban contract events map to EVM logs (topics + data format)

3.4 Supported Methods

Account methods: eth_getBalance, eth_getTransactionCount, eth_getCode
Transaction methods: eth_sendRawTransaction, eth_getTransactionByHash, eth_getTransactionReceipt, eth_estimateGas, eth_call
Block methods: eth_blockNumber, eth_getBlockByNumber, eth_getBlockByHash
Log methods: eth_getLogs, eth_subscribe (WebSocket)
Chain methods: eth_chainId, net_version, eth_gasPrice
Deployment: eth_sendRawTransaction with empty `to` field triggers compile-and-deploy


4. Account and Address Management

4.1 The Address Problem

EVM uses 20-byte addresses derived from secp256k1 public keys. Stellar uses 32-byte Ed25519 public keys (displayed as 56-character base32 G-addresses). TVA must bridge this gap without compromising security on either side.

4.2 Dual-Key Architecture

Each TVA account holds both key types. The secp256k1 keypair provides the EVM-facing 20-byte address for developer tooling compatibility. The Ed25519 keypair provides the Stellar-facing address for on-chain transaction submission. The mapping between them is registered in the on-chain AccountRegistry contract.

4.3 AccountRegistry Contract

The AccountRegistry is a Soroban contract (compiled from Solidity via Solang) that maintains bidirectional mappings between EVM-derived accounts and their corresponding Stellar accounts. It uses `requireAuth()` to verify Stellar account ownership during registration, preventing unauthorized mappings. The contract tracks registration count and supports admin-controlled updates for key rotation scenarios.


5. Storage and State Management

5.1 Storage Type Inference

Soroban's state archival system distinguishes three storage durabilities. TVA's compiler extensions (planned) will automatically infer storage types from usage patterns:

- Temporary: Variables used only within a single function call
- Instance: Contract-wide configuration set once (admin addresses, token metadata)
- Persistent: Variables modified across multiple transactions (balances, counters)

Currently, developers must explicitly annotate storage types using the `persistent`, `instance`, and `temporary` keywords.

5.2 TTL Management

Soroban entries have a Time-To-Live (TTL) measured in ledger sequences. If TTL expires, persistent entries are archived (still recoverable) and temporary entries are deleted. TVA contracts use `extendTtl()` on persistent variables and `extendInstanceTtl()` for contract-level lifetime management.

The RPC layer will transparently handle state restoration: if a contract call fails due to archived state, the RPC layer submits a restoration transaction and retries.

5.3 Current TTL Constraints

The `extendTtl()` method in the current Solang Soroban target is limited to `uint64` persistent/temporary variables. For other types (int128, mappings), TTL management relies on `extendInstanceTtl()` to keep the entire contract instance alive. TVA's compiler extensions will broaden extendTtl support to all persistent variable types.


6. Settlement Properties

6.1 Finality

Stellar provides deterministic finality via the Stellar Consensus Protocol (SCP), a Federated Byzantine Agreement mechanism. Once a ledger closes (approximately every 5 seconds), its transactions are final. There are no reorgs, no probabilistic confirmation, and no challenge periods.

This is fundamentally different from:
- Ethereum L1: ~12 minutes for probabilistic finality
- Optimistic rollups: 7-day challenge period for finality
- ZK rollups: hours-to-days for proof generation and L1 verification

6.2 Fee Model

Stellar transaction fees are denominated in stroops (1 XLM = 10,000,000 stroops). Typical transaction fees are in the range of 100-10,000 stroops (fractions of a cent). The RPC layer translates this to an EVM gas-price equivalent for tooling compatibility.

6.3 No MEV

SCP does not have a mempool-based ordering mechanism that enables Miner Extractable Value (MEV). Transactions are ordered by the consensus process, not by fee-based priority. This eliminates an entire class of economic attacks (frontrunning, sandwich attacks, backrunning) that plague EVM ecosystems.


7. Security Model

7.1 Compiler as the Critical Path

The Solang compiler is the primary security-critical component. Incorrect compilation could lead to:
- Storage corruption (wrong key mapping)
- Authorization bypass (missing requireAuth placement)
- Integer overflow (incorrect width handling)
- State loss (improper TTL management)

Mitigations: Solang has an existing test suite and fuzzing infrastructure. TVA adds a verification step (compile, decompile WASM, verify semantic equivalence). Contract developers can audit generated WASM before deployment. Formal verification tooling is planned for later phases.

7.2 Translation Layer Security

The RPC translation layer must faithfully convert between formats:
- Signature verification on both EVM and Stellar sides
- Nonce management to prevent replay attacks across both formats
- Amount precision handling (18 decimals for EVM tokens vs. 7 for XLM)
- Address mapping bijectivity enforcement (no collisions)

7.3 Soroban VM Guarantees

The Soroban VM provides strong isolation:
- Sandboxed WASM execution with no host memory access
- Resource metering (CPU and memory limits enforced per invocation)
- No reentrancy by default (Soroban's call model prevents reentrant calls)
- State isolation (each contract has independent storage namespace)

7.4 Trust Assumptions

TVA Protocol inherits Stellar's trust model:
- Stellar consensus is honest-majority (SCP quorum slice model)
- Hash functions are collision-resistant
- The Solang compiler produces semantically correct output (verified by tests)
- The RPC layer is a stateless translator (no funds custody, no key material)


8. Comparison to Alternatives

8.1 vs. Interpretation-Based Approaches

Neon EVM (Solana) and Aurora (NEAR) run EVM bytecode interpreters as smart contracts on their respective platforms. This introduces interpretation overhead, gas translation complexity, and a large attack surface (the EVM interpreter itself). TVA compiles to native WASM, eliminating the interpreter entirely.

8.2 vs. EVM L2s

Optimistic rollups (Optimism, Arbitrum) and ZK rollups (zkSync, Polygon zkEVM) all settle to Ethereum L1. They inherit Ethereum's economics, are constrained by its data availability, and introduce challenge periods or proof generation delays. TVA settles on Stellar with 5-second finality and independent economics.

8.3 vs. Stylus (Arbitrum)

Stylus allows WASM execution alongside EVM on Arbitrum. However, it targets Rust/C/C++ developers wanting EVM-chain settlement, and still settles to Ethereum L1 with a 7-day challenge period. TVA targets Solidity developers wanting non-Ethereum settlement with instant finality.

8.4 Unique Position

TVA Protocol occupies a unique position: compilation to native execution (not interpretation) on a non-Ethereum settlement layer (not an L2) with deterministic finality (not probabilistic or challenged). No existing project occupies this exact niche.


9. Token and Asset Integration

9.1 ERC20-Compatible Tokens

Standard ERC20 token patterns compile to Soroban with the following adaptations:
- `transfer(from, to, amount)` replaces `transfer(to, amount)` -- the caller is explicit and must requireAuth
- Balances use `int128` (matching Soroban's native token interface) rather than `uint256`
- Allowance patterns use explicit spender authorization rather than msg.sender inference
- TTL management is handled at the contract instance level

9.2 Native Stellar Asset Wrapping

Stellar's native assets (XLM, USDC issued on Stellar, etc.) can be wrapped as ERC20-compatible contracts. A TVA wrapper contract holds the native asset in trust, exposing standard transfer/approve/allowance interfaces. MetaMask displays these as standard tokens.


10. Development Roadmap

Phase 1 (Foundation): Prove the compilation pipeline end-to-end. Compile reference contracts (Counter, Token, Registry) to Soroban WASM. Establish Stellar CLI tooling. Document translation rules. [Current Phase]

Phase 2 (RPC Layer): Implement core JSON-RPC server. Build transaction format translator. Implement AccountRegistry. Build block/receipt emulator. Enable MetaMask connectivity.

Phase 3 (Developer Tooling): Build TVA CLI. Create Hardhat plugin. Foundry compatibility. Contract verification service. Block explorer. Faucet.

Phase 4 (Production): Security audit. Formal verification. Load testing. Redundant infrastructure. Mainnet deployment.

Phase 5 (Ecosystem): Port reference DeFi contracts. Native asset wrappers. Cross-chain bridge. Governance. Developer grants.


11. Technical Specifications

Build System:
- Rust 1.88+ (Solang compilation)
- LLVM 16 (backend code generation)
- Build: cargo build --release --no-default-features --features "llvm,soroban"
- Output: ~132 MB statically-linked binary

Compilation Command:
- solang compile <file.sol> --target soroban -o <output_dir>
- Produces: .wasm (Soroban module) + .abi (function signatures)

Deployment:
- stellar contract deploy --wasm <file.wasm> --source <identity> --network testnet
- stellar contract invoke --id <contract_id> -- init <args>

Stellar Network Parameters:
- Protocol: Soroban (Protocol 23+)
- Block time: ~5 seconds
- Native currency: XLM (7 decimal places)
- Contract size limit: ~64 KB WASM
- Memory limit: 1 MiB per invocation
- TTL range: 4,095 to 535,679 ledgers per extension


12. Conclusion

TVA Protocol represents a fundamentally different approach to blockchain interoperability. Rather than bridges, token wrapping, or bytecode interpretation, we compile. The Solidity developer's source code becomes native Soroban execution, settling on Stellar with deterministic finality.

The key contributions are:

1. Compilation over interpretation: No EVM runtime overhead; contracts execute as native WASM on the Soroban VM.
2. Translation over bridging: No lock-and-mint assumptions; addresses are mapped, not bridged; funds are never in custody.
3. Native settlement: Transactions are Stellar-native from inception; no challenge periods, no data availability committees, no rollup proofs.
4. Developer transparency: Write Solidity, use Hardhat, deploy to Stellar -- the compilation and translation complexity is hidden behind familiar interfaces.

The path forward is clear: complete the RPC translation layer, extend the compiler to cover events and broader type support, build the developer tooling, and the entire Ethereum ecosystem gains access to Stellar's settlement infrastructure.


Document Version: 2.0
Last Updated: January 2026
Status: Active Development -- Phase 1 (Compilation Pipeline Validated)
