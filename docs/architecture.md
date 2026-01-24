# Architecture

Technical architecture reference for the TVA Protocol.

## System Diagram

```
+------------------------------------------------------------------+
|                        DEVELOPER LAYER                            |
|                                                                   |
|  Solidity Source    Hardhat/Foundry    ethers.js/viem   MetaMask  |
|       (.sol)          (config)          (provider)      (wallet)  |
+--------+-----------------+------------------+---------------+----+
         |                 |                  |               |
         v                 v                  v               v
+------------------------------------------------------------------+
|                      TVA PROTOCOL LAYER                           |
|                                                                   |
|  +---------------+    +------------------+    +---------------+  |
|  | Solang        |    | RPC Translation  |    | Account       |  |
|  | Compiler      |    | Layer            |    | Registry      |  |
|  |               |    |                  |    |               |  |
|  | .sol -> .wasm |    | eth_* -> Soroban |    | EVM <-> Stellar|  |
|  | LLVM 16       |    | JSON-RPC server  |    | address map   |  |
|  +-------+-------+    +--------+---------+    +-------+-------+  |
|          |                     |                      |           |
+------------------------------------------------------------------+
           |                     |                      |
           v                     v                      v
+------------------------------------------------------------------+
|                      STELLAR NETWORK                              |
|                                                                   |
|  +---------------+    +------------------+    +---------------+  |
|  | Soroban VM    |    | SCP Consensus    |    | Horizon API   |  |
|  | (WASM exec)   |    | (5s finality)    |    | (indexing)    |  |
|  +---------------+    +------------------+    +---------------+  |
|                                                                   |
|  Storage: Instance | Persistent | Temporary                      |
|  Fees: Resource-based (CPU, memory, storage, bandwidth)           |
|  Assets: XLM + issued assets + Soroban tokens                    |
+------------------------------------------------------------------+
```

## Component Interactions

### Compilation Flow

```
contracts/*.sol
      |
      | solang compile --target soroban
      v
artifacts/*.wasm + artifacts/*.abi
      |
      | stellar contract deploy
      v
Soroban Contract Instance (on-chain)
      |
      | stellar contract invoke -- init
      v
Initialized Contract (ready for use)
```

### RPC Request Flow

```
EVM Client (eth_sendRawTransaction)
      |
      | 1. Decode RLP-encoded transaction
      v
TVA RPC Layer
      |
      | 2. Extract function selector + ABI params
      | 3. Look up Stellar address from AccountRegistry
      | 4. Re-encode args as ScVal
      | 5. Build Stellar transaction (InvokeHostFunction)
      v
Stellar RPC (soroban-testnet.stellar.org)
      |
      | 6. Simulate + submit transaction
      v
SCP Consensus
      |
      | 7. Ledger close (~5s)
      v
TVA RPC Layer
      |
      | 8. Translate result to EVM receipt format
      v
EVM Client (receives receipt)
```

### Account Registration Flow

```
User (has EVM private key)
      |
      | 1. Generate Stellar keypair
      v
TVA Wallet Adapter
      |
      | 2. Derive Soroban address for EVM address
      | 3. Call AccountRegistry.register()
      v
AccountRegistry Contract (on Soroban)
      |
      | 4. stellarAccount.requireAuth() -- proves ownership
      | 5. Store bidirectional mapping
      v
On-chain mapping: 0x... <--> G...
```

## Data Flow

### Value Encoding

```
Solidity Type        ABI Encoding          ScVal Encoding
uint64         -->   32-byte padded   -->  U64 (tagged inline)
int128         -->   32-byte padded   -->  I128 (host object)
address        -->   20-byte          -->  Address (host object)
string         -->   length-prefixed  -->  String (linear memory)
bool           -->   32-byte (0/1)    -->  Bool (tagged inline)
mapping        -->   slot-based       -->  Contract data entries
```

### Storage Mapping

```
Solidity                          Soroban
---------                         --------
uint64 persistent x = 0;    -->   ContractData(Persistent, key="x", val=U64)
address instance admin;      -->   ContractData(Instance, key="admin", val=Address)
mapping(a => b) balances;    -->   ContractData(Persistent, key=Map{a}, val=b)
```

### Transaction Lifecycle

```
1. User signs EVM transaction (secp256k1)
2. RPC decodes and translates to Stellar format
3. RPC signs Stellar transaction (Ed25519, from mapped keypair)
4. Transaction submitted to Stellar network
5. SCP reaches consensus (~5 seconds)
6. Transaction included in ledger (final)
7. RPC constructs EVM-compatible receipt
8. User receives confirmation
```

## Security Model

### Authentication

- **No msg.sender** -- Soroban uses explicit `requireAuth()` on address parameters
- **Dual-key accounts** -- Users hold both secp256k1 (EVM) and Ed25519 (Stellar) keys
- **AccountRegistry** -- On-chain mapping with ownership proof during registration
- **Admin patterns** -- Contracts store admin address, check `admin.requireAuth()` for privileged operations

### Contract Security

- **WASM isolation** -- Each contract runs in its own WASM sandbox
- **Resource limits** -- CPU, memory, and storage are bounded per transaction
- **No reentrancy risk** -- Soroban's execution model prevents reentrancy by design (no arbitrary external calls during execution)
- **TTL-based archival** -- Unused state is archived, not permanently stored

### RPC Layer Security

- **Transaction validation** -- All incoming transactions are validated before translation
- **Signature verification** -- EVM signatures are verified before generating Stellar transactions
- **Rate limiting** -- Standard rate limiting on the JSON-RPC endpoint
- **No key storage** -- The RPC layer does not store private keys; users sign transactions client-side

### Key Management

```
User's Device
+----------------------------------+
| secp256k1 key (for EVM signing)  |  -- never leaves device
| Ed25519 key (for Stellar signing)|  -- never leaves device
+----------------------------------+
         |
         | Signed transaction
         v
TVA RPC Layer (stateless)
         |
         | Translated transaction
         v
Stellar Network
```

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Malicious RPC operator | Users verify on-chain state independently |
| Front-running | Stellar has no public mempool; SCP ordering is deterministic |
| Reentrancy | Soroban VM prevents reentrancy by design |
| Storage manipulation | All state changes require proper authorization |
| Key compromise | Standard wallet security; no custodial key storage |
| Oracle manipulation | Not applicable (no price oracles in core protocol) |
| Upgrade attacks | Contracts are immutable once deployed (no proxy pattern needed) |

## Component Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| Solang Compiler | `tooling/solang/`, `tooling/bin/solang` | Compile Solidity to Soroban WASM |
| Contracts | `contracts/` | Solidity source files |
| Artifacts | `artifacts/` | Compiled WASM + ABI output |
| Build Script | `tooling/build_solang.sh` | Build Solang from source |
| Client | `client/` | Frontend application (Next.js) |
| Settlement | `dev-b/dist/` | Settlement orchestration modules |
| Agent Refs | `agent/` | Development references and task tracking |
| Architecture Doc | `TVA-PIVOT-ARCHITECTURE.md` | Detailed technical specification |
