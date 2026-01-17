# ASTRAEUS - Dev B Module

Stellar Treasury, Settlement, and FX Layer for the Astraeus Protocol.

## Overview

Dev B owns everything that touches Stellar L1 but never mutates execution state:
- **Treasury Vault Management**: Create and manage multisig vaults on Stellar
- **Treasury Snapshots**: Provide balance/signer data for PoM validation
- **Settlement Planning**: Build deterministic Stellar transactions (Phase 2)
- **FX Handling**: PathPayment for cross-asset settlements (Phase 2)

## Project Structure

```
dev-b/
├── src/
│   ├── interfaces/
│   │   ├── types.ts          # Shared type definitions
│   │   └── crypto.ts         # SHA-256 hashing utilities
│   ├── vault/
│   │   └── vault_manager.ts  # Vault creation and management
│   ├── snapshot/
│   │   └── treasury_snapshot.ts  # Treasury snapshot service
│   └── index.ts              # Module exports
├── tests/
│   ├── crypto.test.ts        # Crypto utility tests
│   └── snapshot.test.ts      # Snapshot tests
├── dist/                     # Compiled JavaScript (after build)
└── docs/                     # Documentation (future)
```

## Installation

```bash
cd dev-b
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Usage

### Creating a Vault

```typescript
import { VaultManager, TESTNET_CONFIG } from 'astraeus-dev-b';

const vaultManager = new VaultManager(TESTNET_CONFIG);

// Create a vault with 3 auditors and threshold of 2
const result = await vaultManager.createVaultWithTrustlines(
  [auditor1PublicKey, auditor2PublicKey, auditor3PublicKey],
  2,  // threshold
  [{ code: 'USDC', issuer: 'G...' }]  // asset whitelist
);

console.log('Vault created:', result.address);
```

### Getting Treasury Snapshot

```typescript
import { TreasurySnapshotService, TESTNET_CONFIG } from 'astraeus-dev-b';

const snapshotService = new TreasurySnapshotService(TESTNET_CONFIG);

const snapshot = await snapshotService.getTreasurySnapshot(vaultAddress);
console.log('Balances:', snapshot.balances);
console.log('Signers:', snapshot.signers);
console.log('Threshold:', snapshot.threshold);
```

### Computing Asset IDs (for PoM)

```typescript
import { computeAssetId } from 'astraeus-dev-b';

// For XLM (native)
const xlmId = computeAssetId('XLM', 'NATIVE');

// For issued assets
const usdcId = computeAssetId('USDC', 'G...issuer...');
```

### Computing Memo (for settlement)

```typescript
import { computeMemo } from 'astraeus-dev-b';

const memo = computeMemo(subnetId, blockNumber);
// Returns 28-byte Buffer for Stellar MemoHash
```

## Interface Specifications

All interfaces match the frozen specifications in `agent/interfaces.md`.

### TreasurySnapshot (Dev B → Dev A)

```typescript
interface TreasurySnapshot {
  balances: Map<string, bigint>;  // asset_id_hex -> stroops
  signers: string[];              // Ed25519 pubkeys (G... addresses)
  threshold: number;
}
```

### Asset ID Format

```
asset_id = SHA256(asset_code || issuer)
```
- `asset_code`: UTF-8 encoded, null-terminated
- `issuer`: "NATIVE" for XLM, or 32-byte Ed25519 public key for issued assets
- Output: 64 lowercase hex characters

### Memo Format

```
memo = first_28_bytes(SHA256(subnet_id || block_number))
```
- `subnet_id`: 32 bytes (bytes32)
- `block_number`: 8 bytes (uint64, big-endian)
- Output: 28 bytes

## Golden Test Vectors

For cross-verification with Dev A:

### XLM Asset ID
```
asset_code: "XLM"
issuer: "NATIVE"
asset_id: 1a630f439abc232a195107111ae6a7c884c5794ca3ec3d7e55cc7230d56b8254
```

### Sample Memo
```
subnet_id: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
block_number: 42
memo: 3b7a9a04030d34947cfdd00389736175b9c9e40f2d299ddcf7cd4052
```

## Development Status

### Phase 0: Interface Freeze ✅
- [x] Reviewed interfaces.md
- [x] Verified compatibility with Stellar/Horizon
- [x] SHA-256 implementation matches spec

### Phase 1: Infrastructure Setup ✅
- [x] Project structure created
- [x] TypeScript configuration
- [x] VaultManager implemented (createVault, addTrustline, rotateSigner)
- [x] TreasurySnapshotService implemented
- [x] Crypto utilities (SHA-256, asset_id, memo)
- [x] 44 tests passing

### Phase 2: Settlement Planner (Next)
- [ ] Settlement plan builder
- [ ] Withdrawal grouping
- [ ] Transaction construction
- [ ] Memo attachment

### Phase 3+: (Future)
- See duo.md for full roadmap

## Critical Reminders

1. **NEVER use keccak256** — All hashes are SHA-256
2. **NEVER submit if PoM doesn't match** — Halt immediately
3. **NEVER set internal FX prices** — Use Stellar DEX only
4. **NEVER mutate execution state** — Dev B only moves money
5. **ALWAYS verify before submit** — Re-compute delta locally
6. **ALWAYS use memo-based idempotency** — Prevent double-settlement

## License

MIT
