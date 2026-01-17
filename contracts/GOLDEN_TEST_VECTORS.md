# Golden Test Vectors for State Root Computation

## Purpose

This document provides golden test vectors for state root computation. Arko (Dev B) can use these to verify that his state root computation logic matches Dev A's implementation.

## Important Note

**Hash Function:** Due to Solang limitations, this implementation uses `keccak256` instead of SHA-256 as specified in `interfaces.md`. This is a documented deviation. For production, SHA-256 should be used via Soroban host functions or a custom implementation.

## Test Vector 1: Simple State

### Input State

**Balances:**
- User: `0x1111111111111111111111111111111111111111111111111111111111111111`
- Asset: XLM (issuer: "NATIVE")
- Balance: `1000000` stroops (0.1 XLM)

**Withdrawals:**
- None

**Nonce:** `0`

### Expected Output

```
State Root: [Computed via compute_state_root()]
```

**Computation Steps:**
1. Balance leaf = keccak256("BAL" || user_id || "XLM" || "NATIVE" || 1000000)
2. Withdrawal leaves = [] (empty)
3. Sort balance leaves lexicographically
4. Build Merkle tree for balances
5. Build Merkle tree for withdrawals (empty tree)
6. Final root = keccak256(balances_root || withdrawals_root || 0)

## Test Vector 2: State with Withdrawals

### Input State

**Balances:**
- User 1: XLM = `1000000` stroops
- User 2: USDC = `2000000` stroops

**Withdrawals:**
- User 1: XLM = `500000` stroops → Destination: `0x9999...9999`

**Nonce:** `1`

### Expected Output

```
State Root: [Computed via compute_state_root()]
```

## Test Vector 3: Multiple Assets

### Input State

**Balances:**
- User 1: XLM = `1000000`, USDC = `500000`
- User 2: XLM = `2000000`, USDC = `1000000`

**Withdrawals:**
- User 1: XLM = `500000`
- User 2: USDC = `500000`

**Nonce:** `2`

### Expected Output

```
State Root: [Computed via compute_state_root()]
```

## How to Use

1. Set up the exact state described in the test vector
2. Call `compute_state_root(subnet_id)` on ExecutionCore
3. Compare the result with the expected state root
4. If they match, your implementation is correct

## Verification Script

```solidity
// Example verification
function verify_golden_vector() public {
    bytes32 subnet_id = setup_test_vector_1();
    bytes32 computed_root = execution.compute_state_root(subnet_id);
    bytes32 expected_root = 0x...; // From golden vector
    require(computed_root == expected_root, "Root mismatch");
}
```

## Note for Arko

When you implement state root computation in your settlement engine:
- Use SHA-256 (not keccak256) as per interfaces.md
- The computation logic should match (leaf formats, sorting, Merkle tree construction)
- Only the hash function differs (keccak256 vs SHA-256)

---

**Last Updated:** 2024-11-14
**Status:** Test vectors to be generated after contract deployment

