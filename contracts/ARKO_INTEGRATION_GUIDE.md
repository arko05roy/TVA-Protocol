# Arko Integration Guide - Phase 3 & 4

## Quick Reference

### State Root Computation

**Function:** `compute_state_root(bytes32 subnet_id) -> bytes32`

**What Arko needs to know:**
- Dev A uses `keccak256` (Solang limitation)
- Arko should use **SHA-256** (as per interfaces.md)
- Computation logic is identical (leaf formats, sorting, Merkle trees)
- Only hash function differs

**Verification:**
1. Get state root from Dev A's contract
2. Compute state root locally using SHA-256
3. Compare (they will differ due to hash function, but logic should match)

### Net Outflow Computation

**Function:** `compute_net_outflow(bytes32 subnet_id) -> (bytes32[] asset_ids, int128[] amounts)`

**What Arko needs:**
- Exact algorithm: Sum withdrawals by asset_id
- Asset ID = `SHA256(asset_code || issuer)` (use SHA-256, not keccak256)
- Output format: Arrays of asset_ids and amounts

**Example:**
```
Withdrawals:
  - USDC: 1000000
  - USDC: 500000
  - XLM: 20000000

Net Outflow:
  asset_id_USDC: 1500000
  asset_id_XLM: 20000000
```

### PoM Validation

**Function:** `pom_validate(...) -> PomResult`

**What Arko needs:**
- Exact failure conditions
- Example failing cases (see `POM_EXAMPLES.md`)

**Failure Cases:**

1. **Insolvent:**
```json
{
  "treasury_balance": { "USDC_asset_id": "500000" },
  "withdrawals": "1000000",
  "result": "Insolvent"
}
```

2. **NonConstructible:**
- Invalid destination (zero bytes)
- Invalid amount (zero or negative)
- Invalid asset code (empty or > 12 chars)

3. **Unauthorized:**
- Auditors not in treasury signers
- Insufficient matching auditors to meet threshold

## Integration Checklist

- [ ] Implement state root computation using SHA-256
- [ ] Verify computation logic matches (leaf formats, sorting, Merkle trees)
- [ ] Implement net outflow computation
- [ ] Verify net outflow matches Dev A's output
- [ ] Implement PoM checks (solvency, constructibility, authorization)
- [ ] Test with example cases from `POM_EXAMPLES.md`
- [ ] Integrate with settlement planner

## Files to Review

1. `contracts/ExecutionCore.sol` - See implementation
2. `contracts/POM_EXAMPLES.md` - Detailed examples
3. `contracts/GOLDEN_TEST_VECTORS.md` - Test vectors
4. `agent/interfaces.md` - Interface specifications

---

**Status:** Ready for Integration
**Last Updated:** 2024-11-14

