# Proof of Money (PoM) Examples for Arko

## Purpose

This document provides concrete examples of PoM validation scenarios, including failing cases, to help Arko understand exactly how Dev A computes and validates Proof of Money.

## Example 1: Successful PoM Validation (Ok)

### Input

**Subnet State:**
- Withdrawals:
  - User 1: USDC = `1000000` stroops
  - User 2: USDC = `500000` stroops
  - User 3: XLM = `20000000` stroops

**Treasury Snapshot:**
```json
{
  "balances": {
    "USDC_asset_id_hex": "5000000",
    "XLM_asset_id_hex": "50000000"
  },
  "signers": [
    "GAAA...",  // Auditor 1
    "GBBB...",  // Auditor 2
    "GCCC..."   // Auditor 3
  ],
  "threshold": 2
}
```

**Subnet Configuration:**
- Auditors: [Auditor1, Auditor2, Auditor3]
- Threshold: 2

### Computation

1. **Net Outflow:**
   - USDC: `1000000 + 500000 = 1500000` stroops
   - XLM: `20000000` stroops

2. **Solvency Check:**
   - USDC: `5000000 >= 1500000` ✅
   - XLM: `50000000 >= 20000000` ✅

3. **Constructibility Check:**
   - All withdrawals have valid destinations ✅
   - All amounts are positive ✅

4. **Authorization Check:**
   - All 3 auditors are in treasury signers ✅
   - `3 >= 2` (threshold) ✅

### Result

```json
{
  "result": "Ok",
  "net_outflow": {
    "USDC_asset_id_hex": "1500000",
    "XLM_asset_id_hex": "20000000"
  }
}
```

## Example 2: Insolvent Case

### Input

**Subnet State:**
- Withdrawals:
  - User 1: USDC = `1000000` stroops

**Treasury Snapshot:**
```json
{
  "balances": {
    "USDC_asset_id_hex": "500000"
  },
  "signers": ["GAAA...", "GBBB...", "GCCC..."],
  "threshold": 2
}
```

### Computation

1. **Net Outflow:**
   - USDC: `1000000` stroops

2. **Solvency Check:**
   - USDC: `500000 >= 1000000` ❌ **FAILS**

### Result

```json
{
  "result": "Insolvent",
  "treasury_balance": {
    "USDC_asset_id_hex": "500000"
  },
  "withdrawals": "1000000",
  "asset_id": "USDC_asset_id_hex",
  "shortfall": "500000"
}
```

**Explanation:** Treasury has 500,000 stroops but withdrawals total 1,000,000 stroops. The subnet is insolvent.

## Example 3: Non-Constructible Case

### Input

**Subnet State:**
- Withdrawals:
  - User 1: USDC = `1000000` stroops, destination = `0x0000...0000` (invalid)

### Computation

1. **Constructibility Check:**
   - Destination is zero bytes ❌ **FAILS**

### Result

```json
{
  "result": "NonConstructible",
  "reason": "Invalid destination address (zero bytes)"
}
```

## Example 4: Unauthorized Case

### Input

**Subnet State:**
- Withdrawals:
  - User 1: USDC = `1000000` stroops

**Treasury Snapshot:**
```json
{
  "balances": {
    "USDC_asset_id_hex": "5000000"
  },
  "signers": [
    "GDDD...",  // Not an auditor
    "GEEE..."   // Not an auditor
  ],
  "threshold": 2
}
```

**Subnet Configuration:**
- Auditors: [Auditor1, Auditor2, Auditor3]
- Threshold: 2

### Computation

1. **Solvency Check:** ✅ (treasury has enough)
2. **Constructibility Check:** ✅
3. **Authorization Check:**
   - Treasury signers: [GDDD, GEEE]
   - Subnet auditors: [Auditor1, Auditor2, Auditor3]
   - Matching count: `0` (no auditors in treasury signers)
   - `0 >= 2` ❌ **FAILS**

### Result

```json
{
  "result": "Unauthorized",
  "reason": "Insufficient auditors in treasury signers",
  "matching_auditors": 0,
  "required_threshold": 2
}
```

## Net Outflow Computation Details

### Exact Algorithm

```solidity
function compute_net_outflow(subnet_id) {
    withdrawals = get_withdrawal_queue(subnet_id);
    delta = {};
    
    for each withdrawal in withdrawals {
        asset_id = keccak256(asset_code || issuer);
        delta[asset_id] += withdrawal.amount;
    }
    
    return delta;
}
```

### Example Computation

**Withdrawals:**
1. USDC, amount = 1000000
2. USDC, amount = 500000
3. XLM, amount = 20000000

**Computation:**
```
asset_id_USDC = keccak256("USDC" || USDC_ISSUER)
asset_id_XLM = keccak256("XLM" || "NATIVE")

delta = {
    asset_id_USDC: 1000000 + 500000 = 1500000,
    asset_id_XLM: 20000000
}
```

## When PoM Fails

**Critical Rule:** If `pom_validate()` returns anything other than `Ok`, the state is **INVALID** and must **NOT** be committed.

**Failure Modes:**
1. **Insolvent:** Treasury cannot cover withdrawals → HALT
2. **NonConstructible:** Invalid withdrawal destinations → HALT
3. **Unauthorized:** Auditors cannot sign treasury → HALT

**No partial commits allowed.** Either all checks pass (Ok) or the entire state is rejected.

## Integration with Arko's Settlement

When Arko receives a committed state root:

1. Fetch withdrawal queue from ExecutionCore
2. Compute net outflow locally (should match Dev A's computation)
3. Get treasury snapshot from Horizon
4. Verify solvency (treasury >= net outflow)
5. Verify constructibility (all destinations valid)
6. Verify authorization (auditors ⊆ treasury signers)
7. Only proceed with settlement if all checks pass

---

**Last Updated:** 2024-11-14
**Status:** Ready for Arko integration

