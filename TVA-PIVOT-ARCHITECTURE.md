# TVA Protocol: EVM Compatibility Layer on Stellar

## Executive Summary

TVA Protocol is an EVM compatibility layer that enables developers to write standard Solidity smart contracts and deploy them to Stellar's Soroban smart contract platform. The core pipeline leverages the Solang compiler to translate Solidity source code into Soroban-compatible WebAssembly, while an EVM-compatible RPC layer translates Ethereum-format transactions into Stellar transactions that settle on Stellar's network via the Stellar Consensus Protocol (SCP).

The result: developers use familiar Ethereum tooling (Hardhat, Foundry, MetaMask, ethers.js) but their contracts execute and settle on Stellar -- inheriting Stellar's 5-second finality, low fees, and built-in asset infrastructure.

---

## 1. Rationale for the Pivot

### 1.1 The Problem

Stellar's Soroban smart contract platform is powerful but has low developer adoption relative to EVM ecosystems. The barrier is not technical capability but developer familiarity:

- Soroban uses Rust as its primary language
- The tooling ecosystem is nascent compared to Ethereum's decade of maturity
- Developers must learn new paradigms: state archival, TTL management, the Val-based host-guest architecture
- Existing DeFi protocols, NFT standards, and tooling cannot be ported without rewrites

Meanwhile, Ethereum's ecosystem has:

- Hundreds of thousands of Solidity developers
- Battle-tested DeFi protocols (Uniswap, Aave, Compound)
- Mature tooling (Hardhat, Foundry, OpenZeppelin)
- Established token standards (ERC20, ERC721, ERC1155)

### 1.2 The Insight

Rather than asking developers to learn Soroban, we bring Soroban to them. If Solidity code can compile to Soroban WASM and EVM transactions can be translated to Stellar transactions, then the entire Ethereum developer ecosystem gains access to Stellar's settlement infrastructure.

### 1.3 Why Stellar

Stellar provides properties that Ethereum L1 cannot match:

| Property | Ethereum L1 | Stellar |
|----------|-------------|---------|
| Finality | ~12 minutes (probabilistic) | 5 seconds (deterministic via SCP) |
| Transaction cost | $0.50 - $50+ | ~$0.00001 |
| Consensus | Proof of Stake | Federated Byzantine Agreement (SCP) |
| Native assets | Only ETH | Multi-asset (XLM + issued assets) |
| DEX | External contracts | Built into protocol |
| Compliance | None native | Built-in asset controls |

### 1.4 Why Not Just Another EVM L2

Existing EVM L2s (Optimism, Arbitrum, zkSync) all settle back to Ethereum L1. This means:

- They inherit Ethereum's economic model (ETH-denominated fees)
- They are constrained by Ethereum's data availability
- They cannot natively interact with non-Ethereum assets
- Cross-chain bridging introduces security risks

TVA Protocol is not an L2 -- it is a compilation target. The EVM is used purely as a developer-facing interface. Settlement happens on Stellar, a fundamentally different (and in many ways superior) settlement layer.

### 1.5 Prior Art: Solang

The Solang compiler (maintained by Hyperledger) already compiles Solidity to multiple targets including Soroban. TVA Protocol builds on this foundation rather than creating a new compiler from scratch. Our contribution is the surrounding infrastructure: the RPC translation layer, transaction format conversion, developer tooling, and deployment pipeline.

---

## 2. System Architecture

### 2.1 High-Level Overview

```
+------------------+     +-------------------+     +------------------+     +------------------+
|                  |     |                   |     |                  |     |                  |
|  Developer       |     |  TVA RPC Layer    |     |  Solang Compiler |     |  Stellar Network |
|  (Solidity +     | --> |  (EVM-compatible  | --> |  (Solidity ->    | --> |  (Soroban VM +   |
|   EVM Tooling)   |     |   JSON-RPC)       |     |   Soroban WASM)  |     |   SCP Finality)  |
|                  |     |                   |     |                  |     |                  |
+------------------+     +-------------------+     +------------------+     +------------------+

       WRITE                  TRANSLATE                  COMPILE                  SETTLE
```

### 2.2 Component Breakdown

```
TVA Protocol Stack
|
+-- Developer Layer (unchanged Ethereum UX)
|   +-- Solidity source code
|   +-- Hardhat / Foundry project structure
|   +-- ethers.js / viem for frontend
|   +-- MetaMask / wallet integration
|
+-- TVA RPC Layer (translation engine)
|   +-- JSON-RPC endpoint (eth_* namespace)
|   +-- Transaction translator (EVM tx -> Stellar tx)
|   +-- Block/receipt emulator (Stellar ledger -> EVM block format)
|   +-- Account abstraction (Ethereum address <-> Stellar keypair)
|   +-- Event/log translation (Soroban events -> EVM logs)
|
+-- Compilation Layer (Solang + extensions)
|   +-- Solang compiler (Solidity -> LLVM IR -> WASM)
|   +-- Soroban target backend
|   +-- ABI translation (Solidity ABI -> Soroban spec)
|   +-- Storage type inference (auto-assign temporary/instance/persistent)
|   +-- EVM opcode shimming (msg.sender -> requireAuth patterns)
|
+-- Settlement Layer (Stellar)
|   +-- Soroban VM (WASM execution)
|   +-- Stellar Consensus Protocol (5s finality)
|   +-- Native asset integration (XLM + issued assets)
|   +-- Built-in DEX for token swaps
|   +-- State archival with TTL management
|
+-- Indexing Layer (chain data)
    +-- Stellar Horizon API
    +-- Event indexer (Soroban events -> queryable logs)
    +-- Block explorer adapter
```

---

## 3. Compilation Pipeline

### 3.1 The Solang Compiler

Solang is an LLVM-based Solidity compiler that targets multiple blockchain platforms. The compilation flow:

```
Solidity Source (.sol)
        |
        v
   [Solang Frontend]
   - Lexer/Parser (solang-parser crate)
   - Semantic Analysis (type checking, resolution)
   - AST construction
        |
        v
   [Codegen Phase]
   - Control Flow Graph (CFG) generation
   - Soroban-specific dispatch (codegen/dispatch/soroban.rs)
   - Soroban encoding (codegen/encoding/soroban_encoding.rs)
   - Host function mapping
        |
        v
   [LLVM IR Emission]
   - emit/soroban/mod.rs (LLVM module construction)
   - emit/soroban/target.rs (TargetRuntime implementation)
   - Storage load/store via Soroban host functions
   - ScVal encoding for all values
        |
        v
   [LLVM Backend]
   - LLVM 16 optimization passes
   - WebAssembly target (wasm32-unknown-unknown)
   - Object file generation
        |
        v
   [Soroban Linker]
   - linker/soroban_wasm.rs
   - wasm-ld linking
   - Import section rewriting (Soroban host function resolution)
   - Global section adjustment
   - Memory configuration (1 MiB initial)
        |
        v
   [Output]
   - .wasm file (Soroban-compatible WebAssembly module)
   - Contract spec metadata (ScSpecEntry for each public function)
   - Interface version tagging (protocol 23)
```

### 3.2 Key Soroban Target Details

The Solang Soroban backend performs the following critical translations:

**Storage Model Mapping:**
```
EVM storage slots  -->  Soroban contract data entries
                        - Temporary (deleted after invocation)
                        - Instance (lives with contract instance)
                        - Persistent (durable, TTL-managed)
```

**Function Dispatch:**
```
EVM: ABI-encoded selector (4-byte keccak256 prefix)
  -->
Soroban: Direct function export (named WASM exports)
         Each public function gets a wrapper CFG that:
         1. Decodes ScVal arguments from Soroban host
         2. Calls the actual function logic
         3. Encodes return values back to ScVal
```

**Value Encoding:**
```
EVM: ABI encoding (abi.encode / abi.encodePacked)
  -->
Soroban: ScVal tagged 64-bit values
         - Small integers: tagged inline (shifted + type tag)
         - Large values: host object references
         - Strings/bytes: linear memory + host function calls
```

**Host Function Integration:**
```
Soroban Host Functions Used:
- l.put_contract_data(key, val, storage_type)    -- Storage write
- l.get_contract_data(key, storage_type)         -- Storage read
- l.has_contract_data(key, storage_type)         -- Storage existence check
- l.extend_contract_data_ttl(key, type, threshold, extend_to)  -- TTL management
- l.extend_current_contract_instance_and_code_ttl(threshold, extend_to)
- l.log_from_linear_memory(...)                  -- Event emission
- l.require_auth(address)                        -- Authorization check
- l.symbol_new_from_linear_memory(...)           -- Symbol creation
- l.vec_new_from_linear_memory(...)              -- Vector creation
- l.map_new_from_linear_memory(...)              -- Map creation
- l.obj_to_u64 / l.obj_from_u64                 -- Type conversions
```

### 3.3 Solidity-to-Soroban Translation Rules

These are the key semantic translations that Solang performs:

| Solidity Construct | Soroban Equivalent | Notes |
|---|---|---|
| `msg.sender` | Not available | Must use explicit `address.requireAuth()` |
| `constructor()` | `init()` function | Must be called separately after deploy |
| `uint8` - `uint256` | Rounded to 32/64/128/256-bit | Auto-rounding with warnings |
| State variables | Contract data entries | With storage type annotations |
| `mapping(K => V)` | Contract data with composite keys | Each entry is a separate data entry |
| `event Foo(...)` | Soroban contract event | Logged via host functions |
| `require(cond, msg)` | Panic with error code | Reverts transaction |
| `keccak256(...)` | Keccak256 host function | Available on Soroban |
| Modifiers | Inline expansion | Standard Solidity behavior |
| Inheritance | Flattened | Single contract output |

### 3.4 TVA-Specific Compiler Extensions

Beyond stock Solang, TVA Protocol adds:

1. **Automatic Storage Type Inference**: Analyze variable usage patterns to automatically assign `temporary`, `instance`, or `persistent` storage types without developer annotation.

2. **msg.sender Shimming**: Automatically transform `msg.sender` patterns into `requireAuth()` calls, maintaining EVM-compatible security semantics.

3. **TTL Auto-Management**: Inject TTL extension calls after every persistent storage write, so developers do not need to think about state archival.

4. **Integer Width Transparency**: Silently handle integer width rounding (e.g., `uint8` -> `uint32`) without developer-facing warnings, since the semantic behavior is preserved.

5. **Constructor Parameter Passing**: Translate constructor arguments into init() parameters transparently.

---

## 4. Transaction Translation Layer

### 4.1 EVM Transaction to Stellar Transaction

The TVA RPC layer translates Ethereum-format transactions into Stellar transactions:

```
EVM Transaction Format              Stellar Transaction Format
+---------------------------+       +---------------------------+
| nonce                     |       | source_account            |
| gasPrice / maxFeePerGas   |       | fee (in stroops)          |
| gasLimit                  |       | sequence_number           |
| to (contract address)     | ----> | operations[]              |
| value (ETH amount)        |       |   InvokeHostFunction      |
| data (ABI-encoded call)   |       |     contract_id           |
| v, r, s (signature)       |       |     function_name         |
+---------------------------+       |     args[] (ScVal)        |
                                    | signatures[]              |
                                    +---------------------------+
```

### 4.2 Translation Steps

**Step 1: Address Mapping**
```
Ethereum address (20 bytes, derived from secp256k1 pubkey)
  -->
Stellar address (Ed25519 public key, 32 bytes)

Mapping: One-way derivation or registry-based mapping
Option A: Deterministic derivation (hash-based)
Option B: Account registry contract on Soroban
```

**Step 2: Call Data Decoding**
```
EVM calldata: [4-byte selector][ABI-encoded params]
  -->
Soroban invocation: function_name + ScVal[] args

Process:
1. Extract function selector (first 4 bytes of keccak256(signature))
2. Look up function name from compiled contract ABI
3. Decode ABI-encoded parameters
4. Re-encode as Soroban ScVal arguments
```

**Step 3: Value/Fee Translation**
```
EVM: value in wei (ETH), gas in gwei
  -->
Stellar: fee in stroops (1 XLM = 10,000,000 stroops)

Note: Soroban uses resource-based fee model, not gas.
The RPC layer estimates resources and translates to a gas equivalent.
```

**Step 4: Signature Scheme Translation**
```
EVM: secp256k1 ECDSA signature (v, r, s)
  -->
Stellar: Ed25519 signature

Approach: The TVA wallet adapter manages both key types,
or a shim contract handles signature verification.
```

### 4.3 Receipt/Block Emulation

The RPC layer must present Stellar ledger data in EVM-compatible format:

```
Stellar Ledger Close                 EVM Block
+---------------------------+       +---------------------------+
| ledger_sequence           | ----> | block_number              |
| close_time (Unix)         |       | timestamp                 |
| tx_set_hash               |       | hash                      |
| base_fee                  |       | gasUsed / gasLimit         |
| transaction_results[]     |       | transactions[]            |
+---------------------------+       +---------------------------+

Soroban Event                        EVM Log
+---------------------------+       +---------------------------+
| contract_id               | ----> | address                   |
| topics[]                  |       | topics[] (indexed params) |
| data                      |       | data (non-indexed params) |
+---------------------------+       +---------------------------+
```

---

## 5. RPC Layer Specification

### 5.1 Supported Ethereum JSON-RPC Methods

The TVA RPC node implements the standard `eth_*` namespace:

**Account Methods:**
- `eth_getBalance` -> Query XLM balance (or wrapped token balance) for mapped address
- `eth_getTransactionCount` -> Stellar account sequence number
- `eth_getCode` -> Soroban contract WASM hash (existence check)

**Transaction Methods:**
- `eth_sendRawTransaction` -> Translate and submit to Stellar
- `eth_getTransactionByHash` -> Look up Stellar tx by mapped hash
- `eth_getTransactionReceipt` -> Construct receipt from Stellar tx result
- `eth_estimateGas` -> Simulate on Soroban, convert resource units to gas equivalent
- `eth_call` -> Simulate Soroban invocation (read-only)

**Block Methods:**
- `eth_blockNumber` -> Latest Stellar ledger sequence
- `eth_getBlockByNumber` -> Construct block from ledger data
- `eth_getBlockByHash` -> Look up ledger by hash

**Log/Event Methods:**
- `eth_getLogs` -> Query Soroban events, translate to EVM log format
- `eth_subscribe` (WebSocket) -> Stream Soroban events as EVM logs

**Chain Methods:**
- `eth_chainId` -> TVA-specific chain ID (registered in chainlist)
- `net_version` -> Network identifier
- `eth_gasPrice` -> Current Stellar base fee converted to gas price

**Contract Deployment:**
- `eth_sendRawTransaction` (with empty `to`) -> Compile via Solang, deploy WASM to Soroban

### 5.2 Deployment Flow

When a developer deploys a contract through the RPC layer:

```
1. Developer: forge create MyContract.sol --rpc-url <TVA_RPC>
      |
      v
2. RPC receives raw transaction with empty 'to' field
   - Extracts bytecode from transaction data
      |
      v
3. RPC detects this is a deployment:
   - If bytecode is Solidity source: Compile via Solang --target soroban
   - If bytecode is pre-compiled WASM: Use directly
      |
      v
4. RPC constructs Stellar transaction:
   - Operation: InvokeHostFunction (upload WASM)
   - Operation: InvokeHostFunction (create contract instance)
      |
      v
5. RPC calls init() on the deployed contract
   (transparent to developer)
      |
      v
6. RPC returns:
   - Transaction hash (Stellar tx hash mapped to EVM format)
   - Contract address (Soroban contract ID mapped to 20-byte address)
```

### 5.3 The Pre-Compilation Model

For production deployments, the recommended flow is:

```
Developer Machine                    TVA Infrastructure
+---------------------+             +---------------------+
|                     |             |                     |
| 1. Write Solidity   |             |                     |
| 2. solang compile   |             |                     |
|    --target soroban  |             |                     |
| 3. Get .wasm output |             |                     |
|                     |             |                     |
| 4. Deploy via       | ---------> | 5. Upload WASM      |
|    standard tx      |             | 6. Create instance  |
|                     |             | 7. Call init()      |
|                     | <--------- | 8. Return address   |
+---------------------+             +---------------------+
```

This avoids compilation latency during deployment and allows developers to audit the generated WASM.

---

## 6. Account and Key Management

### 6.1 Address Mapping Strategy

EVM uses 20-byte addresses derived from secp256k1 public keys. Stellar uses 32-byte Ed25519 public keys (displayed as 56-character base32 "G..." addresses).

**Approach: Dual-Key Wallet**

Each TVA account holds both key types:

```
TVA Account
+----------------------------------+
| secp256k1 keypair (EVM-facing)   |
|   -> 20-byte Ethereum address    |
|                                  |
| Ed25519 keypair (Stellar-facing) |
|   -> G... Stellar address        |
|                                  |
| Mapping registered on-chain      |
|   in AccountRegistry contract    |
+----------------------------------+
```

### 6.2 AccountRegistry Contract

A Soroban contract maintains the mapping between EVM addresses and Stellar addresses:

```solidity
// Compiled to Soroban via Solang
pragma solidity 0;

contract AccountRegistry {
    // EVM address (bytes20) -> Stellar address (bytes32)
    mapping(bytes20 => bytes32) public persistent evmToStellar;
    // Stellar address -> EVM address
    mapping(bytes32 => bytes20) public persistent stellarToEvm;

    function register(bytes20 evmAddr, bytes32 stellarAddr) public {
        // Caller must prove ownership of the Stellar address
        address stellarAccount = address(stellarAddr);
        stellarAccount.requireAuth();

        evmToStellar[evmAddr] = stellarAddr;
        stellarToEvm[stellarAddr] = evmAddr;

        evmToStellar[evmAddr].extendTtl(1000, 100000);
        stellarToEvm[stellarAddr].extendTtl(1000, 100000);
    }
}
```

### 6.3 Wallet Integration

**MetaMask Custom Network:**
```json
{
  "chainId": "0x<TVA_CHAIN_ID>",
  "chainName": "TVA Protocol (Stellar)",
  "nativeCurrency": {
    "name": "Stellar Lumens",
    "symbol": "XLM",
    "decimals": 7
  },
  "rpcUrls": ["https://rpc.tva-protocol.io"],
  "blockExplorerUrls": ["https://explorer.tva-protocol.io"]
}
```

Users add TVA as a custom network in MetaMask. The RPC layer handles all translation transparently.

---

## 7. Storage and State Management

### 7.1 Automatic TTL Management

Soroban's state archival system requires TTL management. TVA abstracts this entirely:

```
Developer writes:           TVA compiles to:
--------------------        -----------------------------------
uint256 balance;            uint256 public persistent balance;
                            // + auto-injected TTL extension
                            // on every write operation

balance = 100;              balance = 100;
                            balance.extendTtl(1000, 50000);
```

### 7.2 Storage Type Inference

TVA's compiler extension analyzes usage patterns:

```
Rule 1: If a variable is only used within a single function call
         -> temporary

Rule 2: If a variable is contract-wide configuration set once
         -> instance

Rule 3: If a variable is modified by multiple transactions
         (balances, counters, user data)
         -> persistent (default)
```

### 7.3 State Archival Recovery

If state is archived (TTL expires), the RPC layer transparently handles restoration:

```
1. User calls contract function
2. RPC detects "state not found" error
3. RPC submits restoration transaction (pays rent)
4. RPC retries the original call
5. User sees successful result (no awareness of archival)
```

---

## 8. Token and Asset Integration

### 8.1 ERC20 on Stellar

Solidity ERC20 contracts compile to Soroban. The key translation:

```solidity
// Standard ERC20 transfer
function transfer(address to, uint256 amount) public returns (bool) {
    require(balanceOf[msg.sender] >= amount);
    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
    emit Transfer(msg.sender, to, amount);
    return true;
}
```

Becomes (via Solang with TVA extensions):

```solidity
// Soroban-compatible version (auto-generated)
function transfer(address from, address to, uint256 amount) public returns (bool) {
    from.requireAuth();  // replaces msg.sender check
    require(balanceOf[from] >= amount);
    balanceOf[from] -= amount;
    balanceOf[to] += amount;
    balanceOf[from].extendTtl(100, 10000);  // auto-injected
    balanceOf[to].extendTtl(100, 10000);    // auto-injected
    emit Transfer(from, to, amount);
    return true;
}
```

### 8.2 Native Stellar Asset Bridging

Stellar's native assets (XLM, USDC issued on Stellar, etc.) can be wrapped as ERC20-compatible contracts:

```
Stellar Native Asset (e.g., USDC on Stellar)
        |
        v
TVA Wrapper Contract (Soroban)
- Holds the native asset in trust
- Exposes ERC20 interface
- Mint/burn on deposit/withdraw
        |
        v
EVM-compatible ERC20 (developer-facing)
- Standard transfer/approve/allowance
- MetaMask shows token balance
```

---

## 9. Network Architecture

### 9.1 Node Types

```
+------------------+     +------------------+     +------------------+
|  TVA RPC Node    |     |  Stellar Core    |     |  Stellar Horizon |
|                  |     |  Node            |     |  API             |
| - EVM JSON-RPC   |     |                  |     |                  |
| - Tx translation  | <-> | - SCP consensus  | <-> | - REST API       |
| - Solang compiler |     | - Soroban VM     |     | - Event streams  |
| - State cache     |     | - Ledger storage |     | - Account data   |
+------------------+     +------------------+     +------------------+
       ^                                                   ^
       |                                                   |
       v                                                   v
+------------------+                              +------------------+
|  Developer       |                              |  TVA Indexer     |
|  (ethers.js,     |                              |                  |
|   Hardhat, etc.) |                              | - Event indexing  |
+------------------+                              | - Log queries     |
                                                  | - Block explorer  |
                                                  +------------------+
```

### 9.2 Transaction Flow (End-to-End)

```
Time -->

Developer            TVA RPC Node         Stellar Core         Confirmation
   |                      |                     |                     |
   |  eth_sendRawTx       |                     |                     |
   |--------------------->|                     |                     |
   |                      |                     |                     |
   |                      | Decode EVM tx       |                     |
   |                      | Map addresses       |                     |
   |                      | Translate calldata  |                     |
   |                      | Build Stellar tx    |                     |
   |                      |                     |                     |
   |                      | Submit to Stellar   |                     |
   |                      |-------------------->|                     |
   |                      |                     |                     |
   |                      |                     | SCP consensus       |
   |                      |                     | (3-5 seconds)       |
   |                      |                     |                     |
   |                      |    Tx result        |                     |
   |                      |<--------------------|                     |
   |                      |                     |                     |
   |  Receipt (EVM format)|                     |                     |
   |<---------------------|                     |                     |
   |                      |                     |                     |
```

### 9.3 Consensus and Finality

TVA does not run its own consensus. It relies entirely on Stellar's SCP:

- **Federated Byzantine Agreement**: Nodes form quorum slices based on trust
- **Deterministic finality**: Once a ledger closes, it is final (no reorgs)
- **5-second block time**: Consistent, predictable confirmation
- **No MEV**: SCP does not have a mempool-based ordering that enables MEV extraction

This is fundamentally different from EVM L2s which must periodically settle to Ethereum and have challenge periods.

---

## 10. Security Considerations

### 10.1 Compiler Security

The Solang compiler is the security-critical component. Incorrect compilation could lead to:

- Storage corruption (wrong slot mapping)
- Authorization bypass (incorrect requireAuth placement)
- Integer overflow (width rounding issues)
- State loss (incorrect TTL management)

**Mitigations:**
- Solang has an active test suite and fuzzing infrastructure
- TVA adds a verification step: compile, decompile WASM, verify semantics match
- Contract developers can audit generated WASM before deployment
- Formal verification tooling planned for Phase 3

### 10.2 Translation Layer Security

The RPC translation layer must faithfully convert between formats:

- **Signature verification**: Both EVM and Stellar signatures must be verified
- **Nonce management**: Prevent replay attacks across both formats
- **Amount precision**: Handle decimal differences (18 for EVM tokens, 7 for XLM)
- **Address collision**: Ensure address mappings are bijective

### 10.3 Soroban VM Security

Soroban provides strong isolation guarantees:

- **Sandboxed WASM execution**: No access to host memory
- **Resource metering**: CPU and memory limits enforced
- **No reentrancy by default**: Soroban's call model prevents reentrant calls
- **State isolation**: Each contract has independent storage namespace

### 10.4 Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| No `msg.sender` on Soroban | Auth model different | Auto-shimming in compiler |
| No inline assembly | Gas optimization tricks unavailable | Soroban host functions are efficient |
| No delegatecall | Proxy patterns differ | Alternative upgrade patterns |
| Integer width rounding | Potential precision differences | Semantic preservation guaranteed |
| State archival | Data can expire | Auto TTL management |
| No block.timestamp | Time-dependent logic | Ledger sequence alternatives |

---

## 11. Developer Experience

### 11.1 Getting Started (Developer Flow)

```bash
# 1. Install TVA CLI (wraps Solang + deployment tools)
npm install -g @tva-protocol/cli

# 2. Initialize a project (Hardhat-compatible structure)
tva init my-project
cd my-project

# 3. Write standard Solidity
cat > contracts/Counter.sol << 'EOF'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;

    function increment() public {
        count += 1;
    }

    function get() public view returns (uint256) {
        return count;
    }
}
EOF

# 4. Compile to Soroban WASM
tva compile
# -> artifacts/Counter.wasm
# -> artifacts/Counter.json (ABI, compatible with ethers.js)

# 5. Deploy to TVA testnet
tva deploy Counter --network testnet
# -> Contract deployed at: 0x1234...5678

# 6. Interact (standard ethers.js)
tva console --network testnet
> const counter = await ethers.getContractAt("Counter", "0x1234...5678")
> await counter.increment()
> await counter.get()  // returns 1
```

### 11.2 Hardhat Integration

```javascript
// hardhat.config.js
require("@tva-protocol/hardhat-plugin");

module.exports = {
  solidity: "0.8.20",
  networks: {
    tva_testnet: {
      url: "https://testnet-rpc.tva-protocol.io",
      chainId: 0x_TVA_CHAIN_ID,
      accounts: [process.env.PRIVATE_KEY]
    },
    tva_mainnet: {
      url: "https://rpc.tva-protocol.io",
      chainId: 0x_TVA_CHAIN_ID_MAINNET,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
```

### 11.3 Foundry Integration

```bash
# Deploy with Forge
forge create src/Counter.sol:Counter \
  --rpc-url https://testnet-rpc.tva-protocol.io \
  --private-key $PRIVATE_KEY

# Test (local Soroban simulation)
forge test --fork-url https://testnet-rpc.tva-protocol.io
```

### 11.4 Frontend Integration

```javascript
import { ethers } from "ethers";

// Connect to TVA (identical to any EVM chain)
const provider = new ethers.JsonRpcProvider("https://rpc.tva-protocol.io");
const signer = new ethers.Wallet(privateKey, provider);

// Deploy and interact
const Counter = await ethers.getContractFactory("Counter", signer);
const counter = await Counter.deploy();
await counter.waitForDeployment();

await counter.increment();
const count = await counter.get(); // 1n
```

---

## 12. Comparison with Alternatives

### 12.1 vs. Neon EVM (Solana)

| Aspect | Neon EVM | TVA Protocol |
|--------|----------|--------------|
| Target chain | Solana | Stellar |
| Approach | Full EVM in a program | Compilation to native |
| Execution | EVM bytecode interpreted | Native WASM (Soroban) |
| Performance | EVM overhead | Native performance |
| Finality | Solana (~400ms) | Stellar (~5s) |
| Native assets | SPL tokens | Stellar assets + DEX |

### 12.2 vs. Aurora (NEAR)

| Aspect | Aurora | TVA Protocol |
|--------|--------|--------------|
| Target chain | NEAR | Stellar |
| Approach | EVM runtime contract | Compilation to native |
| Execution | EVM interpreted in WASM | Compiled WASM |
| Gas model | ETH-like | Stellar resources |
| Storage | NEAR storage | Soroban archival |

### 12.3 vs. Stylus (Arbitrum)

| Aspect | Stylus | TVA Protocol |
|--------|--------|--------------|
| Settlement | Ethereum L1 | Stellar |
| Approach | WASM coprocessor | WASM-native |
| Languages | Rust/C/C++ | Solidity (via Solang) |
| Finality | 7-day challenge period | 5 seconds |
| Fees | ETH-denominated | XLM-denominated |

TVA Protocol's key differentiator: **compilation to native** (not interpretation) on a **non-Ethereum settlement layer** with **deterministic finality**.

---

## 13. Development Roadmap

### Phase 1: Foundation (Current)

**Objective:** Prove the core compilation pipeline works end-to-end.

- [x] Integrate Solang compiler with Soroban target
- [x] Build Solang from source with LLVM 16 and Soroban feature
- [x] Compile basic Solidity contracts to Soroban WASM
- [x] Deploy compiled contracts to Stellar testnet via CLI
- [x] Establish Stellar CLI tooling (stellar-cli 25.0.0)
- [ ] Document all Solidity-to-Soroban translation rules
- [ ] Create test suite of reference contracts (Counter, Token, Vault)

### Phase 2: RPC Translation Layer

**Objective:** Enable standard EVM tooling to interact with deployed contracts.

- [ ] Implement core JSON-RPC server (eth_call, eth_sendRawTransaction)
- [ ] Build transaction format translator (EVM tx -> Stellar tx)
- [ ] Implement address mapping (AccountRegistry contract)
- [ ] Build block/receipt emulator (Stellar ledger -> EVM block)
- [ ] Implement event/log translation (Soroban events -> EVM logs)
- [ ] Support eth_estimateGas via Soroban simulation
- [ ] Enable MetaMask connectivity (custom network config)

### Phase 3: Developer Tooling

**Objective:** Match the Ethereum developer experience.

- [ ] Build TVA CLI (compile, deploy, interact)
- [ ] Hardhat plugin (@tva-protocol/hardhat-plugin)
- [ ] Foundry compatibility (forge create, forge test)
- [ ] Contract verification service (source -> WASM verification)
- [ ] Block explorer (EVM-format view of Stellar data)
- [ ] Faucet for testnet XLM
- [ ] Auto-shimming for msg.sender patterns
- [ ] Automatic TTL management injection

### Phase 4: Production Hardening

**Objective:** Make the system production-ready.

- [ ] Security audit of Solang Soroban target
- [ ] Security audit of RPC translation layer
- [ ] Formal verification of critical translation paths
- [ ] Load testing and performance optimization
- [ ] Redundant RPC node infrastructure
- [ ] Monitoring and alerting
- [ ] Rate limiting and DDoS protection
- [ ] Mainnet deployment

### Phase 5: Ecosystem Growth

**Objective:** Build a thriving developer ecosystem.

- [ ] Port reference DeFi contracts (DEX, lending, staking)
- [ ] Native Stellar asset wrappers (ERC20 interface for XLM, USDC, etc.)
- [ ] Cross-chain bridge to Ethereum (for asset migration)
- [ ] Governance token and protocol DAO
- [ ] Developer grants program
- [ ] SDK for native mobile wallets
- [ ] Advanced Solidity features support (libraries, create2)

---

## 14. Technical Specifications

### 14.1 Build System

The Solang compiler is built from source with the following configuration:

```bash
# Build dependencies
- Rust 1.88+ (for Solang compilation)
- LLVM 16 (backend code generation)
- clang-16 (C stubs compilation)

# Build command
cargo build --release --no-default-features --features "llvm,soroban"

# Output
tooling/bin/solang (132 MB, statically linked against LLVM)
```

### 14.2 Compilation Command

```bash
# Compile a Solidity file to Soroban WASM
./tooling/bin/solang compile contract.sol --target soroban

# Output:
#   contract.wasm  (Soroban-compatible WebAssembly)
```

### 14.3 Deployment Command

```bash
# Deploy using Stellar CLI
./tooling/bin/stellar contract deploy \
  --wasm contract.wasm \
  --source <IDENTITY> \
  --network testnet

# Initialize contract
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <IDENTITY> \
  --network testnet \
  -- init
```

### 14.4 Stellar Network Parameters

```
Network: Stellar Testnet / Mainnet
Protocol: Soroban (Protocol 23+)
Consensus: SCP (Federated Byzantine Agreement)
Block time: ~5 seconds
Native currency: XLM (7 decimal places)
Fee unit: stroop (1 XLM = 10,000,000 stroops)
Contract size limit: ~64 KB WASM
Memory limit: 1 MiB per invocation
TTL default: 4095 ledgers (~5.5 hours)
TTL maximum: 535,679 ledgers (~31 days per extension)
```

---

## 15. Repository Structure

```
TVA-Protocol/
|
+-- TVA-PIVOT-ARCHITECTURE.md     # This document
+-- README.md                      # Project overview
|
+-- agent/                         # Reference documentation
|   +-- core-idea.md              # Original Astraeus whitepaper (reference)
|   +-- SOLANG_STELLAR_REFERENCE.md  # Solang/Soroban developer guide
|
+-- tooling/                       # Build infrastructure
|   +-- bin/                       # Compiled binaries
|   |   +-- solang                 # Solang compiler (built from source)
|   |   +-- solang-linux-x86-64   # Pre-built Solang binary
|   |   +-- stellar               # Stellar CLI 25.0.0
|   |
|   +-- solang/                    # Solang compiler source (git submodule)
|   |   +-- src/                   # Compiler source code
|   |   |   +-- codegen/dispatch/soroban.rs    # Soroban function dispatch
|   |   |   +-- codegen/encoding/soroban_encoding.rs  # ScVal encoding
|   |   |   +-- emit/soroban/mod.rs            # LLVM emission for Soroban
|   |   |   +-- emit/soroban/target.rs         # Soroban TargetRuntime impl
|   |   |   +-- linker/soroban_wasm.rs         # WASM linker for Soroban
|   |   +-- Cargo.toml            # Dependencies (soroban-sdk, inkwell/LLVM)
|   |
|   +-- llvm16/                    # LLVM 16 libraries (build dependency)
|   +-- build_solang.sh            # Build script for Solang
|   +-- Dockerfile.solang-build    # Docker build environment
|
+-- contracts/                     # (To be created) Reference Solidity contracts
|   +-- Counter.sol                # Basic counter example
|   +-- Token.sol                  # ERC20-compatible token
|   +-- Registry.sol               # Account registry contract
|
+-- rpc/                           # (To be created) RPC translation layer
|   +-- src/
|   +-- Cargo.toml
|
+-- .gitignore
```

---

## 16. Conclusion

TVA Protocol represents a fundamentally different approach to blockchain interoperability. Rather than building bridges, wrapping tokens, or running EVM interpreters, we compile. The Solidity developer's code becomes native Soroban execution, settling on Stellar with deterministic finality.

The key innovations are:

1. **Compilation over interpretation**: No EVM runtime overhead; contracts run as native WASM
2. **Translation over bridging**: No lock-and-mint security assumptions; addresses are mapped, not bridged
3. **Native settlement**: Transactions are Stellar-native; no challenge periods, no data availability committees
4. **Developer transparency**: Write Solidity, use Hardhat, deploy to Stellar -- the complexity is hidden

The path from here is clear: complete the RPC translation layer, build the developer tooling, and the entire Ethereum ecosystem gains access to Stellar's settlement infrastructure.

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Status: Active Development*
