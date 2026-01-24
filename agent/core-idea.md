# TVA Protocol -- An EVM Compatibility Layer for Stellar via Solang Compilation

**Version 3.0 -- January 2026**
**Status: Active Development (Phase 1 Complete)**

---

## Abstract

The Ethereum Virtual Machine (EVM) ecosystem represents the largest concentration of smart contract developer capital, tooling, and deployed protocol logic in the blockchain industry. Stellar, through its Soroban smart contract platform, provides settlement properties unmatched by EVM-native chains: deterministic 5-second finality via the Stellar Consensus Protocol (SCP), sub-cent transaction fees, resource-based metering, and native multi-asset infrastructure. TVA Protocol bridges this divide through a compilation-based architecture: the Solang compiler translates standard Solidity source code directly to Soroban-compatible WebAssembly, while a stateless RPC translation layer renders Stellar indistinguishable from an EVM chain to existing developer tooling (Hardhat, Foundry, ethers.js, MetaMask). The result is a system that requires no new trust assumptions beyond compiler correctness, introduces no interpretation overhead, and preserves the full security guarantees of the Soroban VM sandbox.

---

## 1. Motivation

### 1.1 The EVM Developer Ecosystem

The Ethereum ecosystem has accumulated over a decade of developer capital: hundreds of thousands of Solidity developers, mature frameworks (Hardhat, Foundry), client libraries (ethers.js, viem), security tooling (Slither, Mythril, Echidna, Certora), composable token standards (ERC-20, ERC-721, ERC-1155, ERC-4626), and battle-tested DeFi protocols (Uniswap, Aave, Compound, Curve) representing billions in total value locked. This ecosystem constitutes a network effect that no alternative smart contract platform has replicated.

### 1.2 Stellar's Settlement Properties

Stellar provides settlement characteristics unmatched by EVM-native chains:

| Property | Ethereum L1 | Optimistic L2 | ZK L2 | Stellar (SCP) |
|----------|-------------|---------------|--------|----------------|
| Finality | ~12 min (probabilistic) | 7-day challenge | Hours (proof gen) | 5 sec (deterministic) |
| Tx Cost | $0.50 - $50+ | $0.01 - $1 | $0.01 - $0.50 | < $0.001 |
| MEV Exposure | High | Moderate | Low | None |
| Native Assets | ETH only | ETH only | ETH only | Multi-asset |
| Reorg Risk | Non-zero | Inherited | Inherited | Zero |

Soroban provides sandboxed WASM execution with resource metering, state isolation, and no reentrancy by default. However, developer adoption remains constrained: Soroban requires Rust, its tooling is nascent, and developers must master state archival, TTL management, and the ScVal host-guest interface.

### 1.3 The Limitations of Current Approaches

**Interpretation-based** (Neon EVM on Solana, Aurora on NEAR): deploy full EVM bytecode interpreters as smart contracts, introducing interpretation overhead, large attack surfaces, gas translation complexity, and storage inefficiency.

**Layer 2** (Optimism, Arbitrum, zkSync): settle back to Ethereum L1, inheriting its economics, requiring bridge-based security assumptions, and introducing challenge periods or proof delays.

### 1.4 The Gap

No existing system enables EVM developers to deploy to Stellar without learning Soroban or Rust. The gap is not execution capability but developer interface compatibility.

### 1.5 TVA's Insight

Compile Solidity to Soroban's native format rather than interpreting EVM bytecode on-chain.

---

## 2. Core Insight: Compilation over Emulation

### 2.1 The Semantic Equivalence Argument

Let S denote a Solidity program, E(S) the EVM bytecode from solc, and W(S) the Soroban WASM from Solang. The correctness property:

    For all S, sigma, tx:
    exec_EVM(E(S), sigma, tx) ~ exec_Soroban(W(S), T_state(sigma), T_tx(tx))

where ~ denotes observational equivalence (identical return values and state transitions modulo encoding). This holds iff: (1) Solang correctly preserves Solidity semantics, and (2) the translation functions T_state, T_tx faithfully map between domains.

### 2.2 TCB Reduction

    Emulation: S -> solc -> EVM bytecode -> EVM interpreter (on-chain) -> execution
    Compilation: S -> Solang -> Soroban WASM -> Soroban VM -> execution

    TCB_emulation = {solc, EVM_interpreter_contract, target_VM}
    TCB_compilation = {Solang, target_VM}

Since the target VM is trusted in both cases, compilation strictly reduces the Trusted Computing Base. The compiler is an off-chain artifact subject to exhaustive testing; the interpreter is on-chain code in the critical path.

### 2.3 Security Model Preservation

Compiled WASM preserves full Soroban VM guarantees: sandboxing (no escape from VM boundary), resource metering (identical to native contracts, no inner/outer gas), state isolation (independent storage namespaces), and reentrancy prevention (by design, no explicit guards needed). Emulation must re-implement all guarantees within the interpreter contract.

---

## 3. System Architecture

```
+===========================================================================+
|                         DEVELOPER INTERFACE                                |
|  Solidity (.sol) | Hardhat | Foundry | ethers.js | MetaMask | viem        |
+===========================================================================+
                                    |
                                    v
+===========================================================================+
|                     COMPILATION LAYER (Solang)                              |
|                                                                            |
|  Solidity Source --> [Frontend] --> [Codegen] --> [LLVM IR] --> Soroban WASM|
|                                                                            |
|  Translations: msg.sender --> requireAuth() | slots --> typed entries      |
|                ABI encoding --> ScVal       | selectors --> named exports  |
+===========================================================================+
                                    |
                                    v
+===========================================================================+
|                   RPC TRANSLATION LAYER (Stateless)                         |
|                                                                            |
|  T_tx:   EVM transaction --> InvokeHostFunction operation                  |
|  T_block: Stellar ledger --> EVM block                                     |
|  T_rcpt: Soroban result  --> EVM receipt                                   |
|  T_log:  Soroban event   --> EVM log        T_addr: addr <--> addr         |
+===========================================================================+
                                    |
                                    v
+===========================================================================+
|                   ACCOUNT MANAGEMENT LAYER                                  |
|  secp256k1 (EVM) <--> Ed25519 (Stellar) | AccountRegistry (on-chain)      |
+===========================================================================+
                                    |
                                    v
+===========================================================================+
|                     SETTLEMENT LAYER (Stellar)                              |
|  Soroban VM | SCP (5s finality) | Multi-asset | No MEV | TTL archival      |
+===========================================================================+
```

**Trust boundary**: Trust_TVA = Trust_Stellar + Trust_Solang. No bridges, custodians, challenge periods, or data availability committees.

---

## 4. Compilation Pipeline

### 4.1 Pipeline Stages

```
Solidity Source --> [Solang Frontend: lexer, parser, semantic analysis, type checking]
    --> [Codegen: CFG generation, Soroban dispatch wrappers, ScVal encoding, host mapping]
    --> [LLVM IR: module construction, TargetRuntime impl, storage ops, value encoding]
    --> [LLVM Backend: O2/O3 optimization, wasm32-unknown-unknown target]
    --> [Soroban Linker: wasm-ld, import rewriting, 1 MiB memory config]
    --> Output: .wasm (Soroban module) + contract spec (ScSpecEntry per function)
```

### 4.2 Semantic Transformation Rules

**Definition 4.1 (Storage).** EVM storage S_EVM : uint256 -> uint256 maps to Soroban typed entries S_Soroban : (Symbol, StorageType) -> ScVal, where StorageType in {Temporary, Instance, Persistent}.

    T_storage(slot_i) = (symbol_i, durability_i, scval_i)

Durability semantics: Temporary (deleted post-invocation), Instance (contract-lifetime), Persistent (TTL-managed, archivable).

**Definition 4.2 (Dispatch).** EVM selector = keccak256(sig)[0:4] maps to named WASM exports. For each public function f, the compiler generates:

    export_f : (ScVal_1, ..., ScVal_n) -> ScVal_ret

which decodes host arguments, invokes logic, and encodes the return value.

**Definition 4.3 (Value Encoding).** EVM ABI uses 32-byte padded slots. Soroban ScVal uses tagged 64-bit values:

    ScVal(x) = { tag(x) << 1 | x,          if |x| <= 63 bits (inline)
               { obj_ref(host_alloc(x)),     otherwise (host object)

Integer width rounding: uint8..32 -> i32, uint33..64 -> i64, uint65..128 -> i128, uint129..256 -> i256.

**Definition 4.4 (Authorization).** msg.sender checks transform to requireAuth():

    require(msg.sender == addr)  -->  addr.requireAuth()

### 4.3 Host Function Interface

```
Storage:   l.put_contract_data(key, val, type) | l.get_contract_data(key, type)
           l.has_contract_data(key, type)      | l.del_contract_data(key, type)
TTL:       l.extend_contract_data_ttl(key, type, threshold, extend_to)
           l.extend_current_contract_instance_and_code_ttl(threshold, extend_to)
Auth:      l.require_auth(address) | l.require_auth_for_args(address, args)
Values:    l.symbol_new_from_linear_memory | l.vec_new_from_linear_memory
           l.obj_to_u64 | l.obj_from_u64
Events:    l.log_from_linear_memory(msg_offset, msg_len, ...)
```

### 4.4 Current Constraints

1. **Event emission**: `todo!()` stub in codegen; events parsed but not emitted. Priority: critical.
2. **Mapping keys**: bytes20/bytes32 keys cause ScVal encoder panics. Priority: high.
3. **TTL scope**: `.extendTtl()` limited to uint64 persistent variables. Priority: medium.
4. **No inline assembly**: Soroban WASM has no EVM opcode equivalents.
5. **No delegatecall**: Soroban lacks cross-contract storage context execution.

These are engineering gaps, not architectural limitations.

---

## 5. RPC Translation Layer

### 5.1 Formal Definition

The TVA RPC layer implements T : RPC_EVM -> RPC_Stellar with the correctness property:

    For all m in RPC_EVM, params p, state sigma:
    response(T(m, p), sigma_Stellar) ~ expected_response(m, p, sigma_EVM)

**Properties**: (5.1) Semantics preservation -- identical observable effects. (5.2) Statelessness -- no mutable state, no keys, no custody. (5.3) Read idempotency -- identical responses for identical inputs and state.

### 5.2 Transaction Translation

    T_EVM = (nonce, gasPrice, gasLimit, to, value, data, v, r, s)
        -->
    T_Stellar = (source_account, fee, sequence_number, operations[], signatures[])

```
PROCEDURE TranslateTransaction(T_EVM):
  1. ADDRESS RESOLUTION: contract_id = Registry.resolve(T_EVM.to)
  2. CALLDATA DECODING: selector -> function_name; ABI.decode -> ScVal.encode
  3. FEE TRANSLATION: Soroban.simulate() -> resource-based fee in stroops
  4. OPERATION: InvokeHostFunction(contract_id, function_name, params_scval)
  5. SIGNATURE: Ed25519.sign(stellar_tx.hash(), source.ed25519_key)
```

### 5.3 Block and Receipt Emulation

```
Ledger --> Block:   sequence -> number | close_time -> timestamp | tx_set_hash -> hash
Result --> Receipt: tx_hash -> transactionHash | success -> status | events -> logs
Event --> Log:      contract_id -> address | topics -> topics | data -> data
```

### 5.4 Supported Methods

**Account**: eth_getBalance, eth_getTransactionCount, eth_getCode
**Transaction**: eth_sendRawTransaction, eth_getTransactionByHash, eth_getTransactionReceipt, eth_estimateGas, eth_call
**Block**: eth_blockNumber, eth_getBlockByNumber, eth_getBlockByHash
**Events**: eth_getLogs, eth_subscribe (WebSocket)
**Chain**: eth_chainId, net_version, eth_gasPrice
**Deploy**: eth_sendRawTransaction with null `to` triggers compile-and-deploy pipeline.

---

## 6. Account Model

### 6.1 The Address Problem

EVM: addr = keccak256(pubkey_secp256k1)[12:32] (20 bytes).
Stellar: addr = base32(version || pubkey_ed25519 || checksum) (56 chars).
Incompatible key algorithms, derivation functions, and lengths.

### 6.2 Dual-Key Architecture

Each TVA account holds both keypairs: secp256k1 (EVM-facing, 20-byte address for MetaMask/hardware wallets) and Ed25519 (Stellar-facing, G-address for on-chain submission). The mapping is registered in the on-chain AccountRegistry.

### 6.3 AccountRegistry Contract

A Soroban contract (compiled from Solidity via Solang) maintaining bidirectional mappings with requireAuth-gated registration:

```
contract AccountRegistry {
    mapping(address => bytes32) persistent evmToStellar;
    mapping(bytes32 => address) persistent stellarToEvm;
    uint64 persistent registrationCount;

    function register(address evmAddr, bytes32 stellarAddr) public {
        address(stellarAddr).requireAuth();
        evmToStellar[evmAddr] = stellarAddr;
        stellarToEvm[stellarAddr] = evmAddr;
        registrationCount += 1;
    }
}
```

### 6.4 Address Derivation

For deterministic generation from a single seed:

    privkey_evm     = HKDF-SHA256(seed, "tva/evm", 32)
    privkey_stellar = HKDF-SHA256(seed, "tva/stellar", 32)
    addr_evm        = keccak256(secp256k1_pubkey(privkey_evm))[12:32]
    addr_stellar    = ed25519_pubkey(privkey_stellar)

Single mnemonic, two identities, no key reuse across algorithms.

---

## 7. Security Model

### 7.1 Trust Assumptions

**A1 (Stellar Consensus)**: SCP provides safety and liveness under FBA. No two honest nodes externalize different values for the same slot.

**A2 (Compiler Correctness)**: For all programs S and inputs I: eval(compile(S), I) = eval_solidity(S, I) modulo defined semantic adaptations.

**A3 (Cryptographic Hardness)**: SHA-256/keccak256 collision resistance; secp256k1/Ed25519 DLP hardness; HKDF security.

**A4 (Soroban VM)**: Correct WASM execution within defined resource limits and isolation boundaries.

No additional assumptions: no bridge operators, no DA committees, no fraud validators, no sequencer liveness.

### 7.2 Attack Surface

**Compiler bugs**: Storage corruption, auth bypass, integer overflow, state loss. Mitigated by Solang test suite, compile-decompile-verify, planned formal verification.

**RPC translation errors**: Wrong addresses, incorrect invocations, precision loss. Mitigated by stateless deterministic design, comprehensive integration tests.

**Registry manipulation**: Prevented by requireAuth gating on Stellar account.

### 7.3 Comparison to Emulation Security

```
Emulation TCB (on-chain):              TVA TCB (on-chain):
  EVM interpreter (~10,000+ LOC)         0 additional LOC
  150+ opcode implementations            (only developer's compiled WASM)
  Gas metering logic
  Storage emulation
  Precompile contracts
```

Compilation moves complexity off-chain into an exhaustively testable compiler.

### 7.4 Formal Verification Targets

1. Transaction translation correctness: T_tx(tx_evm) produces semantically equivalent Soroban invocation.
2. Address mapping bijectivity: no collisions possible in AccountRegistry.
3. Value encoding round-trip: ScVal.decode(ScVal.encode(v)) = v for all Solidity values v.

---

## 8. Settlement Properties

### 8.1 Finality

SCP provides deterministic finality:

    P(reorg | ledger_closed) = 0

Not probabilistic (Nakamoto) but absolute. Finality time:

    t_finality = t_rpc_translation + t_propagation + t_scp_voting ~ 5 seconds

Compared to: Ethereum L1 (~12 min), Optimistic L2 (7 days), ZK L2 (1-24 hours).

### 8.2 MEV Resistance

SCP uses nomination and ballot protocols, not fee-based priority ordering:

    for all permutations pi: ordering determined by consensus, not validator profit

No frontrunning, sandwich attacks, or backrunning.

### 8.3 Fee Model

Resource-based metering:

    fee = f(cpu_instructions, memory_bytes, storage_reads, storage_writes, bandwidth)

Each dimension independently priced and limited. The RPC layer translates:

    gas_equivalent = ceil(fee_stroops / gas_price_stroops_per_gas)

Typical costs: 100 - 10,000 stroops (< $0.001).

### 8.4 Fee Stability

Unlike EVM chains where gas prices fluctuate 100x+ during congestion, Stellar's base fee remains stable. Surge pricing is bounded by protocol parameters, not unbounded auction dynamics.

---

## 9. Comparison to Alternatives

| Property | TVA Protocol | Neon EVM (Solana) | Aurora (NEAR) | Stylus (Arbitrum) |
|----------|-------------|-------------------|---------------|-------------------|
| Approach | Compilation | Interpretation | Interpretation | WASM coprocessor |
| Settlement | Stellar (SCP) | Solana (Tower BFT) | NEAR (Nightshade) | Ethereum L1 |
| Finality | 5s deterministic | ~400ms probabilistic | ~2s probabilistic | 7-day challenge |
| TCB Size | Small (compiler) | Large (interpreter) | Large (interpreter) | Medium |
| Performance | Native WASM | EVM overhead | EVM overhead | Near-native |
| MEV | None | Partial (Jito) | Partial | Full (L1 MEV) |
| Input Language | Solidity | Solidity | Solidity | Rust/C/C++ |
| Fee Currency | XLM | SOL | ETH (bridged) | ETH |
| Reentrancy | Impossible | Present | Present | Configurable |

**Security**: Neon/Aurora trust ~10,000+ lines of on-chain interpreter. TVA trusts only the off-chain compiler. On-chain TCB delta: 0.

**Performance**: TVA executes at native Soroban speed. Interpretation adds constant-factor overhead per opcode.

**Developer Experience**: TVA is the only system targeting Stellar settlement with EVM developer interface. Stylus targets different developers (Rust/C++) on a different settlement layer (Ethereum L1 via Arbitrum).

---

## 10. Limitations and Future Work

### 10.1 Current Solang Limitations

1. **Event emission** (Critical): `todo!()` stub must be replaced with `l.log_from_linear_memory()` calls.
2. **Fixed-byte mapping keys** (High): bytes20/bytes32 keys trigger ScVal encoder panics.
3. **msg.sender shimming** (High): AST pattern matching for require(msg.sender == x) -> x.requireAuth().
4. **Storage type inference** (Medium): Static analysis for automatic durability assignment.
5. **Broader extendTtl** (Medium): Support all persistent types, not only uint64.

### 10.2 Token Standard Compatibility

**ERC-20**: Requires msg.sender shimming + event emission. Balances use int128 vs uint256.
**ERC-721**: ERC-20 prerequisites + token ownership mappings + metadata URI support.
**ERC-1155**: Batch operations compile naturally; resource limit testing needed.
**ERC-4626**: Precision handling for share/asset calculations across integer widths.

### 10.3 Compiler Extension Roadmap

| Extension | Complexity | Phase |
|-----------|------------|-------|
| Event codegen (Soroban events matching EVM log semantics) | Medium | 2 |
| msg.sender shim (AST pattern matching + requireAuth) | High | 2 |
| bytes key support (ScVal encoding for fixed-byte keys) | Medium | 2 |
| TTL auto-injection (extendTtl after persistent writes) | Low | 2 |
| Constructor params (constructor -> init translation) | Low | 2 |
| Storage inference (static durability analysis) | Medium | 3 |
| Integer transparency (silent width rounding) | Low | 2 |

### 10.4 Research Directions

1. **Formal verification**: Machine-checked proofs (Coq/Lean) of Solang Soroban backend correctness.
2. **Cross-chain composability**: Standardized message-passing for compiled Stellar contracts.
3. **ZK integration**: Soroban WASM execution for ZK proof verification.
4. **Optimistic compilation verification**: Independent verifier network comparing WASM outputs.

---

## 11. Technical Specifications

### 11.1 Build System

```
Requirements: Rust 1.88+, LLVM 16, clang-16
Build:        cargo build --release --no-default-features --features "llvm,soroban"
Output:       ~132 MB statically-linked binary (solang)
Compile:      solang compile <file.sol> --target soroban -o <output_dir>
Deploy:       stellar contract deploy --wasm <file.wasm> --source <id> --network testnet
Init:         stellar contract invoke --id <contract_id> -- init [args]
```

### 11.2 Network Parameters

```
Protocol:          Soroban (Protocol 23+)
Consensus:         SCP (Federated Byzantine Agreement)
Ledger Close:      ~5 seconds
Native Currency:   XLM (7 decimals, 1 XLM = 10^7 stroops)
Contract Limit:    ~64 KB WASM
Memory Limit:      1 MiB per invocation
TTL Range:         4,095 - 535,679 ledgers (~5.5 hours to ~31 days)
State Archival:    Persistent entries archived after TTL; recoverable
```

### 11.3 TVA Parameters

```
Chain ID:          To be registered (EIP-3770)
Block Time:        5 seconds (Stellar-inherited)
Finality:          1 block (deterministic)
Gas Model:         Stellar base fee / reference resource units
Solidity Support:  pragma solidity >=0.7.0 (Solang range)
```

---

## 12. Conclusion

TVA Protocol demonstrates that compilation-based EVM compatibility is architecturally superior to emulation for bringing EVM developers to new L1 chains. The contributions:

1. **Minimal trust**: No on-chain TCB beyond the developer's own compiled WASM. The compiler is off-chain and exhaustively testable.
2. **Native performance**: Compiled contracts execute at full Soroban VM speed with no interpretation overhead.
3. **Deterministic settlement**: 5-second finality, zero reorgs, no MEV, no challenge periods.
4. **Developer transparency**: Standard Solidity workflow; Stellar settlement is invisible to the developer.
5. **Reduced attack surface**: Zero additional on-chain code vs. 10,000+ lines for interpreter approaches.

The path forward: complete compiler extensions (events, msg.sender, type support), build the RPC translation layer, and package developer tooling. The entire Ethereum ecosystem then gains access to Stellar's settlement infrastructure without modification.

TVA inverts blockchain interoperability: instead of asking developers to port code to a new ecosystem, we bring the ecosystem's execution environment to them. The compilation boundary is invisible. The settlement properties are superior. The security model is simpler.

---

## References

1. Mazieres, D. "The Stellar Consensus Protocol: A Federated Model for Internet-level Consensus." Stellar Development Foundation, 2015.
2. Hyperledger Solang. "Solang Solidity Compiler." https://github.com/hyperledger-solang/solang
3. Stellar Development Foundation. "Soroban Smart Contracts." Soroban Documentation, 2024.
4. Ethereum Foundation. "Ethereum JSON-RPC Specification." https://ethereum.org/en/developers/docs/apis/json-rpc/
5. Ethereum Foundation. "Solidity Language Specification." https://docs.soliditylang.org/
6. LLVM Project. "LLVM Language Reference Manual, Version 16." https://llvm.org/docs/LangRef.html
7. WebAssembly Community Group. "WebAssembly Specification." https://webassembly.github.io/spec/
8. Wood, G. "Ethereum: A Secure Decentralised Generalised Transaction Ledger." Ethereum Yellow Paper, 2014.
9. Neon Labs. "Neon EVM: Ethereum Virtual Machine on Solana." Technical Documentation, 2023.
10. Aurora. "Aurora: EVM on NEAR Protocol." Technical Documentation, 2023.
11. Offchain Labs. "Stylus: WASM Smart Contracts on Arbitrum." Technical Documentation, 2024.

---

*Document Version: 3.0*
*Last Updated: January 2026*
*Status: Active Development -- Phase 1 (Compilation Pipeline Validated)*
*Authors: TVA Protocol Team*
