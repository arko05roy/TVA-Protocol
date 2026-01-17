# ASTRAEUS — Interface Specifications (Frozen)

**Version:** 1.0  
**Date:** 2024-11-14  
**Status:** LOCKED — Do not modify without coordination

This document defines the exact data formats, encoding rules, and schemas that all Astraeus components must implement. These interfaces are **frozen** and serve as the contract between Dev A (execution layer) and Dev B (settlement layer).

**Development Stack:** Solang (Solidity compiler for Soroban/Stellar)

---

## 1. State Root Format

### 1.1 Hash Function
- **Algorithm:** SHA-256 (NOT Keccak-256)
- **Output:** 32 bytes (256 bits)
- **Implementation:** Standard SHA-256 as defined in FIPS 180-4
- **Solang Usage:** 
  - **DO NOT** use `keccak256()` (it produces different hashes)
  - Use Soroban host functions for SHA-256, or implement SHA-256 in Solidity
  - All hash operations in this specification require SHA-256

### 1.2 Data Types (Solang/Solidity)
- `user_id`: `bytes32` (32 bytes, opaque identifier)
- `withdrawal_id`: `bytes32` (32 bytes, unique per withdrawal)
- `asset_code`: `string` (1-12 alphanumeric characters per Stellar spec, UTF-8 encoded)
- `issuer`: `bytes32` (32 bytes, Ed25519 public key; use `"NATIVE"` string for XLM)
- `balance`: `int128` (signed 128-bit integer, stroops for XLM/assets)
- `amount`: `int128` (signed 128-bit integer, stroops)
- `destination`: `bytes32` (32 bytes, Ed25519 public key, can be converted to/from `address`)
- `NONCE`: `uint64` (unsigned 64-bit integer, block number)

**Note:** Solang auto-rounds integer types to 32/64/128/256-bit boundaries. `int128` is natively supported.

### 1.3 Balance Leaf Format

**Encoding:**
```
balance_leaf = SHA256("BAL" || user_id || asset_code || issuer || balance)
```

**Byte Concatenation Order:**
1. Prefix: `"BAL"` (3 bytes: `0x42 0x41 0x4C`)
2. `user_id` (32 bytes, `bytes32`)
3. `asset_code` (variable length, UTF-8 encoded, null-terminated)
4. `issuer` (32 bytes for issued assets, or `"NATIVE"` as UTF-8 string for XLM)
5. `balance` (16 bytes, big-endian `int128`)

**Special Cases:**
- For XLM (native asset): `issuer = "NATIVE"` (UTF-8, 6 bytes: `0x4E 0x41 0x54 0x49 0x56 0x45`)
- For issued assets: `issuer` is the 32-byte Ed25519 public key (raw bytes, not base32-encoded)

**Solang Implementation Pattern:**
```solidity
// Pseudo-code for leaf computation
// NOTE: Must use SHA-256, not keccak256()
bytes memory balanceLeafInput = abi.encodePacked(
    "BAL",
    user_id,           // bytes32
    asset_code,        // string (UTF-8, null-terminated)
    issuer,            // bytes32 or "NATIVE" string
    balance            // int128 (16 bytes big-endian)
);
bytes32 balanceLeaf = sha256(balanceLeafInput);  // Use SHA-256 host function
```

**Example:**
```
user_id = 0x0000...0001 (32 bytes, bytes32)
asset_code = "USDC" (UTF-8: 0x55 0x53 0x44 0x43 0x00)
issuer = 0x1234...5678 (32 bytes, Ed25519 public key)
balance = 1500000 (int128 big-endian: 0x00...0016E360)

balance_leaf = SHA256(0x42 0x41 0x4C || user_id || "USDC\0" || issuer || balance_bytes)
```

### 1.4 Withdrawal Leaf Format

**Encoding:**
```
withdrawal_leaf = SHA256("WD" || withdrawal_id || user_id || asset_code || issuer || amount || destination)
```

**Byte Concatenation Order:**
1. Prefix: `"WD"` (2 bytes: `0x57 0x44`)
2. `withdrawal_id` (32 bytes, `bytes32`)
3. `user_id` (32 bytes, `bytes32`)
4. `asset_code` (variable length, UTF-8 encoded, null-terminated)
5. `issuer` (32 bytes for issued assets, or `"NATIVE"` for XLM)
6. `amount` (16 bytes, big-endian `int128`)
7. `destination` (32 bytes, Ed25519 public key, `bytes32`)

**Special Cases:**
- For XLM: `issuer = "NATIVE"` (UTF-8, 6 bytes)
- For issued assets: `issuer` is 32-byte Ed25519 public key (raw bytes)

**Solang Implementation Pattern:**
```solidity
// Pseudo-code for withdrawal leaf computation
// NOTE: Must use SHA-256, not keccak256()
bytes memory withdrawalLeafInput = abi.encodePacked(
    "WD",
    withdrawal_id,     // bytes32
    user_id,           // bytes32
    asset_code,        // string (UTF-8, null-terminated)
    issuer,            // bytes32 or "NATIVE" string
    amount,            // int128 (16 bytes big-endian)
    destination        // bytes32
);
bytes32 withdrawalLeaf = sha256(withdrawalLeafInput);  // Use SHA-256 host function
```

**Example:**
```
withdrawal_id = 0xABCD...EF01 (32 bytes, bytes32)
user_id = 0x0000...0001 (32 bytes, bytes32)
asset_code = "USDC" (UTF-8: 0x55 0x53 0x44 0x43 0x00)
issuer = 0x1234...5678 (32 bytes)
amount = 1000000 (int128 big-endian: 0x00...000F4240)
destination = 0x9876...5432 (32 bytes, Ed25519 public key)

withdrawal_leaf = SHA256(0x57 0x44 || withdrawal_id || user_id || "USDC\0" || issuer || amount_bytes || destination)
```

### 1.5 Merkle Tree Construction

**Step 1: Collect Leaves**
- Collect all `balance_leaf` values from current state into a list
- Collect all `withdrawal_leaf` values from withdrawal queue into a separate list

**Step 2: Sort Leaves (Within Each Category)**
- Sort all **balance leaves** lexicographically by their hash value (byte order, ascending)
- Sort all **withdrawal leaves** lexicographically by their hash value (byte order, ascending)
- This ensures deterministic ordering regardless of insertion order

**Step 3: Build Separate Merkle Trees**
- Build a binary Merkle tree from sorted balance leaves
- Build a separate binary Merkle tree from sorted withdrawal leaves
- Use standard binary Merkle tree construction:
  - For odd number of leaves at any level, duplicate the last leaf
  - Hash pairs: `H(left_child || right_child)`

**Step 4: Compute Sub-Roots**
- `balances_root`: Merkle root of the balance leaves tree (32 bytes, `bytes32`)
- `withdrawals_root`: Merkle root of the withdrawal leaves tree (32 bytes, `bytes32`)

**Step 5: Final State Root**
```
state_root = SHA256(balances_root || withdrawals_root || NONCE)
```

Where:
- `balances_root` (32 bytes, `bytes32`)
- `withdrawals_root` (32 bytes, `bytes32`)
- `NONCE` (8 bytes, big-endian `uint64`)

**Solang Implementation Pattern:**
```solidity
// Pseudo-code for final state root
// NOTE: Must use SHA-256, not keccak256()
bytes memory stateRootInput = abi.encodePacked(
    balances_root,     // bytes32
    withdrawals_root,  // bytes32
    NONCE             // uint64 (8 bytes big-endian)
);
bytes32 state_root = sha256(stateRootInput);  // Use SHA-256 host function
```

### 1.6 Deliverable Statement

> **Here is exactly how to compute the state root:**
> 
> 1. For each `(user_id, asset, balance)` in the balance map, compute `balance_leaf = SHA256("BAL" || user_id || asset_code || issuer || balance)`.
> 2. For each withdrawal in the withdrawal queue, compute `withdrawal_leaf = SHA256("WD" || withdrawal_id || user_id || asset_code || issuer || amount || destination)`.
> 3. Sort all balance leaves lexicographically by their hash value (byte order).
> 4. Sort all withdrawal leaves lexicographically by their hash value (byte order).
> 5. Build separate binary Merkle trees from the sorted leaves.
> 6. Extract `balances_root` (Merkle root of balance leaves) and `withdrawals_root` (Merkle root of withdrawal leaves).
> 7. Compute `state_root = SHA256(balances_root || withdrawals_root || NONCE)`.

---

## 2. Proof of Money (PoM) Delta Schema

### 2.1 Definition

The PoM Delta represents the **net monetary outflow** from a subnet's withdrawal queue. It is computed by summing all withdrawal amounts, grouped by asset.

### 2.2 Asset ID Format

**Canonical Asset Identifier:**
```
asset_id = SHA256(asset_code || issuer)
```

**Encoding:**
- `asset_code`: UTF-8 encoded string, null-terminated
- `issuer`: 
  - For XLM: `"NATIVE"` (UTF-8, 6 bytes: `0x4E 0x41 0x54 0x49 0x56 0x45`)
  - For issued assets: 32-byte Ed25519 public key (raw bytes, not base32-encoded)
- `asset_id`: 32-byte SHA-256 hash (`bytes32`)

**JSON Representation:**
- `asset_id` is represented as a **hex-encoded string** (64 characters, lowercase)
- Example: `"a1b2c3d4e5f6..."` (64 hex chars)

**Solang Implementation Pattern:**
```solidity
// Pseudo-code for asset_id computation
// NOTE: Must use SHA-256, not keccak256()
bytes memory assetIdInput = abi.encodePacked(
    asset_code,  // string (UTF-8, null-terminated)
    issuer       // bytes32 or "NATIVE" string
);
bytes32 asset_id = sha256(assetIdInput);  // Use SHA-256 host function
```

### 2.3 Delta Schema

**JSON Structure:**
```json
{
  "asset_id_hex": "i128_string"
}
```

Where:
- `asset_id_hex`: Hex-encoded SHA-256 hash (64 lowercase hex characters)
- `i128_string`: Decimal string representation of the net outflow amount in stroops

**Type Notes:**
- `i128_string` must be a valid decimal integer (can be negative in theory, but PoM delta should always be non-negative for withdrawals)
- Values are in **stroops** (1 XLM = 10,000,000 stroops; 1 USDC = 1,000,000 stroops if 6 decimals)
- In Solang: Use `int128` type for amounts, convert to string for JSON output

### 2.4 Computation Rules

1. Initialize an empty map: `delta = {}`
2. For each withdrawal in the withdrawal queue:
   - Compute `asset_id = SHA256(asset_code || issuer)`
   - Convert `asset_id` to hex string (64 chars, lowercase)
   - Add `withdrawal.amount` to `delta[asset_id_hex]` (or initialize to `amount` if not present)
3. Convert all `int128` values to decimal strings
4. Output as JSON object

**Solang Implementation Pattern:**
```solidity
// Pseudo-code for delta computation
// NOTE: Must use SHA-256, not keccak256()
mapping(bytes32 => int128) delta;  // Internal storage

for each withdrawal {
    bytes32 asset_id = sha256(abi.encodePacked(asset_code, issuer));  // Use SHA-256
    delta[asset_id] += withdrawal.amount;  // int128 arithmetic
}

// Convert to JSON: asset_id (bytes32) -> hex string, amount (int128) -> decimal string
```

### 2.5 Example

**Input Withdrawals:**
```
Withdrawal 1: user_id=0x0001, asset="USDC", issuer=0x1234...5678, amount=1500000
Withdrawal 2: user_id=0x0002, asset="USDC", issuer=0x1234...5678, amount=500000
Withdrawal 3: user_id=0x0003, asset="XLM", issuer="NATIVE", amount=20000000
```

**Computation:**
```
asset_id_USDC = SHA256("USDC\0" || 0x1234...5678)
asset_id_XLM = SHA256("XLM\0" || "NATIVE")

delta = {
  hex(asset_id_USDC): "2000000",  // 1500000 + 500000
  hex(asset_id_XLM): "20000000"
}
```

**Output JSON:**
```json
{
  "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456": "2000000",
  "fedcba0987654321098765432109876543210fedcba098765432109876543210": "20000000"
}
```

**Note:** The actual hex values above are placeholders. In practice, compute the real SHA-256 hashes.

### 2.6 Deliverable Statement

> **Arko must be able to recompute the same delta from withdrawals.**
> 
> Given a withdrawal queue, Arko should:
> 1. Group withdrawals by `(asset_code, issuer)` pair
> 2. Compute `asset_id = SHA256(asset_code || issuer)` for each unique asset
> 3. Sum all `amount` values for each `asset_id`
> 4. Output as JSON: `{ "asset_id_hex": "i128_string", ... }`
> 
> The output must match exactly what Dev A produces from the same withdrawal queue.

---

## 3. Memo Format

### 3.1 Definition

The memo attached to Stellar settlement transactions is computed as the **first 28 bytes** of a SHA-256 hash.

### 3.2 Input Format

**Concatenation:**
```
memo_input = subnet_id || block_number
```

Where:
- `subnet_id`: `bytes32` (32 bytes, opaque identifier)
- `block_number`: `uint64` (8 bytes, big-endian unsigned integer)

**Total input length:** 40 bytes

### 3.3 Computation

```
memo_hash_full = SHA256(subnet_id || block_number)
memo = first_28_bytes(memo_hash_full)
```

**Output:** 28 bytes (exactly)

**Solang Implementation Pattern:**
```solidity
// Pseudo-code for memo computation
// NOTE: Must use SHA-256, not keccak256()
bytes memory memoInput = abi.encodePacked(
    subnet_id,      // bytes32 (32 bytes)
    block_number    // uint64 (8 bytes, big-endian)
);
bytes32 memo_hash_full = sha256(memoInput);  // Use SHA-256 host function
bytes28 memo = bytes28(memo_hash_full);  // Truncate to first 28 bytes
```

### 3.4 Stellar Memo Encoding

**Memo Type:** `MemoHash` (Stellar XDR type)

**Stellar XDR Specification:**
- Stellar supports `MemoHash` of exactly 32 bytes
- However, we use only the **first 28 bytes** to fit within Stellar's memo constraints and provide a deterministic, compact identifier

**Encoding in Transaction:**
- The 28-byte memo is encoded as a `MemoHash` in the Stellar transaction
- When submitting via Stellar SDK, use `Memo.hash(memo_bytes)` where `memo_bytes` is the 28-byte value
- The SDK will pad or handle the encoding appropriately

**Reference:** Stellar XDR defines `MemoHash` as 32 bytes, but we truncate to 28 bytes for our use case.

### 3.5 Example

**Input:**
```
subnet_id = 0x0123456789ABCDEF... (32 bytes, bytes32)
block_number = 42 (uint64: 0x000000000000002A)
```

**Computation:**
```
memo_input = 0x0123456789ABCDEF... || 0x000000000000002A (40 bytes)
memo_hash_full = SHA256(memo_input)  // 32 bytes
memo = memo_hash_full[0:28]  // First 28 bytes
```

**Output:**
```
memo = 0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8 (28 bytes)
```

**In Stellar SDK (JavaScript):**
```javascript
const memo = Memo.hash(Buffer.from(memo_bytes, 'hex'));
```

**In Stellar SDK (Go):**
```go
memo := txnbuild.MemoHash(memo_bytes)
```

### 3.6 Deliverable Statement

> **Memo format is fixed as:**
> 
> `memo = first_28_bytes(SHA256(subnet_id || block_number))`
> 
> Where:
> - `subnet_id` is 32 bytes (`bytes32`)
> - `block_number` is 8 bytes (big-endian `uint64`)
> - Output is exactly 28 bytes
> 
> This memo is attached to all Stellar settlement transactions to link them back to the committed state root.

---

## 4. Reference Specifications

### 4.1 Stellar Core & XDR
- **Stellar XDR Definitions:** https://github.com/stellar/stellar-core/blob/main/src/xdr/Stellar-transaction.x
- **Stellar Consensus Protocol:** https://www.stellar.org/papers/stellar-consensus-protocol.pdf
- **Stellar Core Architecture:** https://developers.stellar.org/docs/stellar-core/overview/

### 4.2 Stellar SDK
- **JavaScript SDK:** https://stellar.github.io/js-stellar-sdk/
- **Go SDK:** https://pkg.go.dev/github.com/stellar/go/txnbuild
- **Transaction Building:** https://developers.stellar.org/docs/glossary/xdr/

### 4.3 Solang & Soroban
- **Solang GitHub:** https://github.com/hyperledger-solang/solang
- **Solang Soroban Documentation:** https://solang.readthedocs.io/en/latest/targets/soroban.html
- **Soroban Overview:** https://developers.stellar.org/docs/soroban/getting-started/overview/
- **Soroban Data Types:** https://soroban.stellar.org/docs/reference/data
- **Contract Model:** https://developers.stellar.org/docs/soroban/reference/contracts
- **Solang Playground:** https://solang.io

### 4.4 Stellar Assets & Trustlines
- **Asset Behavior:** https://developers.stellar.org/docs/glossary/asset/
- **PathPaymentStrictReceive:** https://developers.stellar.org/docs/start/list-of-operations/#pathpaymentstrictreceive
- **Multisig & Thresholds:** https://developers.stellar.org/docs/glossary/multisig/

### 4.5 Horizon API
- **Account Details:** https://developers.stellar.org/api/resources/accounts/
- **Transaction Submission:** https://developers.stellar.org/api/resources/transactions/

---

## 5. Solang-Specific Implementation Notes

### 5.1 Storage Types

When implementing state root computation in Solang contracts:

- **Persistent Storage:** Use `persistent` keyword for balance maps and withdrawal queues that need to survive archival
- **Instance Storage:** Use `instance` keyword for contract-wide configuration (subnet_id, admin, etc.)
- **Temporary Storage:** Use `temporary` keyword for intermediate computation values

**Example:**
```solidity
contract StateRoot {
    bytes32 public instance subnet_id;
    mapping(bytes32 => int128) public persistent balances;
    Withdrawal[] public persistent withdrawalQueue;
    uint64 public persistent nonce;
}
```

### 5.2 Type Conversions

**Important:** Solang auto-rounds integer types. Ensure compatibility:
- `int128` is natively supported (no rounding needed)
- `uint64` is natively supported (no rounding needed)
- `bytes32` is natively supported

**String to Bytes:**
```solidity
bytes memory assetCodeBytes = bytes(asset_code);  // UTF-8 encoding
```

**Int128 to Bytes (Big-Endian):**
```solidity
// Solang/Soroban handles int128 serialization in abi.encodePacked()
bytes memory balanceBytes = abi.encodePacked(balance);  // 16 bytes big-endian
```

### 5.3 Hash Functions

**Critical:** The PRD specifies **SHA-256** for all hash operations (state roots, asset IDs, memos). Solang provides `keccak256()` by default, which is **NOT** the same as SHA-256.

**Solution Options:**
1. **Use Soroban Host Functions:** If Soroban provides SHA-256 host functions, call them directly from Solang
2. **Verify Mapping:** Confirm if Solang's `keccak256()` can be configured to use SHA-256 (unlikely)
3. **External Library:** Implement SHA-256 in Solidity/Solang if host functions are not available

**Implementation Requirement:**
- All hash computations MUST use SHA-256, not Keccak-256
- State root, asset_id, and memo computations are cryptographically dependent on SHA-256
- **DO NOT** use `keccak256()` unless it is confirmed to map to SHA-256 on Soroban

**Verification:** Before deployment, verify that your hash function produces SHA-256 outputs matching the specifications in this document.

### 5.4 Authorization

When implementing PoM checks that require auditor signatures:

```solidity
function commitStateRoot(bytes32 root, address[] memory auditors) public {
    // Require each auditor to authorize
    for (uint i = 0; i < auditors.length; i++) {
        auditors[i].requireAuth();
    }
    // ... PoM validation and commit logic ...
}
```

---

## 6. Example Deliverables

### 6.1 Example State Root

**Input State:**
```
Balances:
  (user_0x0001, USDC, issuer_0x1234, 1500000)
  (user_0x0002, XLM, NATIVE, 20000000)

Withdrawals:
  (wd_0xABCD, user_0x0001, USDC, issuer_0x1234, 500000, dest_0x9876)

NONCE: 42
```

**Computed State Root:**
```
state_root = 0x1F2E3D4C5B6A7988... (32 bytes, hex)
```

*(Actual value depends on exact Merkle tree construction)*

### 6.2 Example PoM Delta JSON

```json
{
  "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456": "500000",
  "fedcba0987654321098765432109876543210fedcba098765432109876543210": "0"
}
```

### 6.3 Example Memo

```
subnet_id = 0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF
block_number = 42

memo = 0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8
```

---

## 7. Change Control

**This document is FROZEN.** Any changes require:
1. Coordination between Dev A and Dev B
2. Version increment
3. Migration plan for existing data
4. Updated examples and test vectors

**Current Version:** 1.0  
**Last Updated:** 2024-11-14  
**Development Stack:** Solang (Solidity for Soroban)  
**Next Review:** TBD

---

**END OF INTERFACE SPECIFICATION**

