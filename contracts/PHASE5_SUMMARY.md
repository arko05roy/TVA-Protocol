# Phase 5: Commitment Contract - Implementation Summary

## Overview

Phase 5 implements the `commit_state()` function, which is the final validation and commitment step before state roots can be settled on Stellar L1. This function enforces all critical security checks and emits the `StateCommitted` event that Arko listens to.

## Implementation

### Function: `commit_state()`

**Location**: `contracts/ExecutionCore.sol`

**Signature**:
```solidity
function commit_state(
    bytes32 subnet_id,
    uint64 block_number,
    bytes32 state_root,
    bytes32[] memory auditor_signers,
    bytes32[] memory treasury_asset_ids,
    int128[] memory treasury_balances,
    bytes32[] memory treasury_signers,
    uint32 treasury_threshold
) public
```

### Validation Rules

1. **Subnet Validation**
   - Subnet must exist and be active
   - Treasury must be registered

2. **State Root Validation**
   - State root cannot be zero

3. **Block Number Monotonicity** ⚠️ **CRITICAL**
   - `block_number` must be strictly greater than `lastCommittedBlock[subnet_id]`
   - Prevents replay attacks and ensures sequential commitment
   - Rejects duplicate or out-of-order block numbers

4. **Auditor Signature Verification**
   - All `auditor_signers` must be valid auditors from the subnet's auditor list
   - Number of valid signers must meet or exceed the subnet threshold
   - Prevents unauthorized commits

5. **Treasury Authorization**
   - Auditors must be authorized treasury signers
   - Uses `check_authorization()` to verify auditors can sign treasury

6. **Proof of Money (PoM) Validation** ⚠️ **CRITICAL**
   - Calls `pom_validate()` with treasury snapshot
   - **If PoM fails, the entire transaction reverts**
   - Ensures no invalid state can be committed

### Storage

```solidity
// Commit storage: subnet_id => block_number => state_root
mapping(bytes32 => mapping(uint64 => bytes32)) public persistent commits;

// Last committed block per subnet (for monotonicity)
mapping(bytes32 => uint64) public persistent lastCommittedBlock;
```

### Event

```solidity
event StateCommitted(
    bytes32 indexed subnet_id,
    uint64 indexed block_number,
    bytes32 state_root
);
```

**This event is what Arko listens to** to trigger settlement execution.

## View Functions

### `get_commit(bytes32 subnet_id, uint64 block_number) -> bytes32`
Returns the committed state root for a specific subnet and block number. Returns `bytes32(0)` if not committed.

### `get_last_committed_block(bytes32 subnet_id) -> uint64`
Returns the last committed block number for a subnet. Returns `0` if no commits exist.

## Integration with Arko

### When a Commit is Final

A commit is **final** when:
1. ✅ `commit_state()` successfully executes (no revert)
2. ✅ `StateCommitted` event is emitted
3. ✅ State root is stored in `commits[subnet_id][block_number]`

### Event Details for Arko

**Event Name**: `StateCommitted`

**Parameters**:
- `subnet_id` (indexed): The subnet identifier (bytes32)
- `block_number` (indexed): The committed block number (uint64)
- `state_root`: The committed state root (bytes32)

**Example Event**:
```solidity
StateCommitted(
    subnet_id: 0x0123456789abcdef...,
    block_number: 42,
    state_root: 0xabcdef1234567890...
)
```

### Arko's Integration Flow

1. **Listen for Event**: Arko's settlement engine listens for `StateCommitted` events
2. **Fetch Withdrawal Queue**: After receiving event, fetch withdrawal queue for the committed block
3. **Verify State Root**: Optionally verify state root matches expected computation
4. **Execute Settlement**: Build and submit Stellar transactions for withdrawals
5. **Confirm Settlement**: Send settlement confirmation back to Dev A (future phase)

## Test Coverage

**Test File**: `contracts/test/TestPhase5.sol`

**6 Comprehensive Tests**:

1. ✅ `test_commit_state_success` - Successful commit with valid PoM
2. ✅ `test_commit_state_monotonicity` - Block number monotonicity enforcement
3. ✅ `test_commit_state_insufficient_signatures` - Rejects insufficient auditor signatures
4. ✅ `test_commit_state_pom_failure` - Reverts when PoM fails (insolvent treasury)
5. ✅ `test_commit_state_invalid_auditor` - Rejects invalid auditor signers
6. ✅ `test_commit_state_zero_root` - Rejects zero state root

## Security Guarantees

1. **No Invalid State**: PoM validation ensures only solvent, constructible, and authorized states can be committed
2. **No Replay**: Block number monotonicity prevents replay attacks
3. **No Unauthorized Commits**: Auditor signature verification ensures only authorized auditors can commit
4. **Deterministic Finality**: Once committed, state root is immutable and final

## Example Usage

```solidity
// Setup: Credit balances and create withdrawals
executionCore.credit(subnet_id, user_id, "USDC", issuer, 1000000);
executionCore.request_withdrawal(subnet_id, user_id, "USDC", issuer, 500000, destination);

// Compute state root
bytes32 stateRoot = executionCore.compute_state_root(subnet_id);

// Prepare treasury snapshot (from Arko)
bytes32[] memory treasuryAssetIds = new bytes32[](1);
treasuryAssetIds[0] = asset_id;
int128[] memory treasuryBalances = new int128[](1);
treasuryBalances[0] = 2000000; // Sufficient balance

bytes32[] memory treasurySigners = new bytes32[](3);
treasurySigners[0] = auditor1;
treasurySigners[1] = auditor2;
treasurySigners[2] = auditor3;

// Auditor signers (meet threshold)
bytes32[] memory auditorSigners = new bytes32[](2);
auditorSigners[0] = auditor1;
auditorSigners[1] = auditor2;

// Commit state (block 1)
executionCore.commit_state(
    subnet_id,
    1,  // block_number (must be > lastCommittedBlock)
    stateRoot,
    auditorSigners,
    treasuryAssetIds,
    treasuryBalances,
    treasurySigners,
    2  // treasury_threshold
);

// StateCommitted event is emitted
// Arko listens and triggers settlement
```

## Failure Modes

| Failure Mode | Result | Reason |
|-------------|--------|--------|
| PoM fails (Insolvent) | Revert | Treasury cannot cover withdrawals |
| PoM fails (NonConstructible) | Revert | Invalid withdrawal destinations |
| PoM fails (Unauthorized) | Revert | Auditors cannot sign treasury |
| Block number not monotonic | Revert | Prevents replay attacks |
| Insufficient signatures | Revert | Threshold not met |
| Invalid auditor | Revert | Signer not in auditor list |
| Zero state root | Revert | Invalid state root |

## Next Steps

- ✅ Phase 5 complete
- 🔄 Phase 6: End-to-end integration (requires both Dev A and Dev B)
- 🔄 Phase 7: Edge cases and final polish

---

**Status**: ✅ **COMPLETE**
**Date**: 2026-01-17
**Tests**: 6/6 passing
**Ready for**: Arko integration and end-to-end testing

