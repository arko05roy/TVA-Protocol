# ASTRAEUS Soroban Deployment Report

## Deployed Contracts (Stellar Testnet)

### TVACounter
- **Contract ID**: `CBCZBCXLLALDSUUXRBC5VTMVGTQYQFBRACTH7VM45HWJSJIMCKKP77LN`
- **Wasm Hash**: `8a3c851aa15bd4470bcba25f131e3af6ed2e866ded8767c97881ac9ec8c0eaa4`
- **Functions**: increment, decrement, get, reset
- **Status**: Deployed, read-only functions work. Write functions fail due to stored-address requireAuth bug.

### ExecutionLedger (Financial Core)
- **Contract ID**: `CAD7HQC5GCNSYC7N4GBZOZDO6QY3EFXIS4EFFISDPMBDFC3H74JIXC5H`
- **Wasm Hash**: `9bf3734dcac116a586f42e01dd880951664238612cc6b7b4b0825197e6afdc98`
- **Explorer**: https://lab.stellar.org/r/testnet/contract/CAD7HQC5GCNSYC7N4GBZOZDO6QY3EFXIS4EFFISDPMBDFC3H74JIXC5H
- **Status**: All operations verified working.

### Deployer Identity
- **Name**: `tva-deployer`
- **Address**: `GBICTRZ4JCCB7QYBBDA3EMRWM633XUARRSX3R53D5XAKYWABPCQWGMXU`

## Verified Operations

| Operation | Status | Details |
|-----------|--------|---------|
| activate_subnet | PASS | Sets subnet status to active |
| credit | PASS | Adds balance to key |
| debit | PASS | Removes balance from key |
| transfer | PASS | Atomically moves balance between keys |
| request_withdrawal | PASS | Debits balance, increments nonce, returns receipt |
| get_balance | PASS | Reads balance for key |
| get_nonce | PASS | Reads subnet nonce |
| is_active | PASS | Reads subnet status |
| get_subnet_count | PASS | Reads global counter |
| requireAuth | PASS | Verifies caller signature (parameter-based) |

## Test Results

```
Credit 50,000,000 stroops (5 XLM) → balance = 50,000,000 ✓
Debit 15,000,000 → balance = 35,000,000 ✓
Transfer 20,000,000 to key=2 → key1 = 15,000,000, key2 = 20,000,000 ✓
Withdrawal 10,000,000 from key=2 → key2 = 10,000,000, nonce = 1 ✓
```

## Solang Soroban Pre-Alpha Limitations

The following limitations were discovered and worked around:

### Not Implemented (Panic)
1. **Events** - `emit` statements cause panic at `codegen/events/mod.rs`
2. **keccak256** - Hash function panics at `emit/soroban/target.rs:752`
3. **Complex type encoding** - Arrays, bytes32, enums hit `unimplemented!()` in `soroban_encoding.rs:206`

### Codegen Bugs
4. **requireAuth on stored address** - Loading address from instance storage then calling requireAuth produces InvalidInput. Workaround: pass address as function parameter.
5. **Multi-level mapping slots** - Nested mappings collapse to the same storage slot due to intermediate Vec handle truncation in `storage_subscript`. All keys at depth > 1 resolve identically.
6. **Mapping key encoding** - Keys used in storage subscripts are not Val-encoded before being pushed to the key vector. Only raw values 0-14 (which happen to correspond to valid Soroban Val tags) work as keys. Function parameters are already Val-encoded and work correctly.
7. **Bool/Int128 in mappings** - `mapping(uint64 => bool)` and `mapping(uint64 => int128)` produce InvalidInput errors at runtime.
8. **extendTtl scope** - Only works on top-level `persistent` scalar variables, not on mapping entries or struct fields.

### Encoder Limitations
9. `bytes32` - Not in soroban encoder type match
10. Arrays (`T[]`) - Not in encoder
11. Enums - Not in encoder
12. `block.timestamp` - Not available on Soroban

## Architecture Workarounds

| Original Design | Deployed Workaround |
|-----------------|---------------------|
| `bytes32` identifiers | `uint64` identifiers |
| `bytes32[]` arrays | Caller pre-computes flat keys |
| Multi-level mappings | Single-level `mapping(uint64 => uint64)` |
| Stored admin + requireAuth | Address passed as function parameter |
| Events for state change notification | Polling via read functions |
| `int128` balance amounts | `uint64` (sufficient for stroops) |
| Computed mapping keys | Caller passes keys as params (must be 0-14 range) |

## Dev B Integration Gap

The Dev B integration layer (`commitment_listener.ts`, `withdrawal_fetcher.ts`) expects:
- `StateCommitted` events (not supported)
- `bytes32` subnet IDs (not in encoder)
- `Withdrawal[]` return types (arrays not supported)
- Struct return values from `get_withdrawal_queue`

**Status**: Core financial logic proven on-chain. Dev B integration requires either:
1. Waiting for Solang Soroban backend to mature (events, arrays, bytes32)
2. Rewriting Dev B to poll the simplified uint64-based API
3. Using native Soroban Rust SDK for the full-featured contract

## Tooling

- **Solang**: v0.3.4 built from source with `--features "llvm,soroban"`
- **LLVM**: 16 (extracted from Ubuntu packages)
- **Stellar CLI**: v25.0.0
- **Build script**: `tooling/build_solang.sh`
- **Binary locations**: `tooling/bin/solang`, `tooling/bin/stellar`
