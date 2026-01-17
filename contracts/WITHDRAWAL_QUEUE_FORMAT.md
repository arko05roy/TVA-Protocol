# Withdrawal Queue Format for Settlement Engine (Arko)

## Overview

The withdrawal queue is retrieved from the `ExecutionCore` contract using the `get_withdrawal_queue(bytes32 subnet_id)` function. This document describes the exact format that Arko will receive.

## Function Signature

```solidity
function get_withdrawal_queue(bytes32 subnet_id) public view returns (Withdrawal[] memory)
```

## Withdrawal Struct

```solidity
struct Withdrawal {
    bytes32 withdrawal_id;  // Unique identifier (keccak256 hash)
    bytes32 user_id;        // User requesting withdrawal
    string asset_code;      // Asset code (e.g., "USDC", "XLM")
    bytes32 issuer;         // Asset issuer (Ed25519 public key) or "NATIVE" for XLM
    int128 amount;          // Amount in stroops
    bytes32 destination;    // Stellar destination address (Ed25519 public key)
}
```

## JSON Format

When Arko queries the withdrawal queue via Soroban RPC, it will receive a JSON array of withdrawal objects:

```json
[
  {
    "withdrawal_id": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "user_id": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "asset_code": "USDC",
    "issuer": "0x567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234",
    "amount": "1000000",
    "destination": "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba"
  },
  {
    "withdrawal_id": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    "user_id": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "asset_code": "XLM",
    "issuer": "NATIVE",
    "amount": "20000000",
    "destination": "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
  }
]
```

## Field Descriptions

### withdrawal_id
- **Type**: `bytes32` (32 bytes)
- **Format**: Hex-encoded string (64 hex characters, prefixed with "0x")
- **Generation**: `keccak256(subnet_id || nonce || user_id || amount || destination)`
- **Purpose**: Unique identifier for this withdrawal request

### user_id
- **Type**: `bytes32` (32 bytes)
- **Format**: Hex-encoded string (64 hex characters, prefixed with "0x")
- **Purpose**: Internal user identifier in the subnet

### asset_code
- **Type**: `string`
- **Format**: UTF-8 string (1-12 alphanumeric characters per Stellar spec)
- **Examples**: `"USDC"`, `"XLM"`, `"BTC"`
- **Purpose**: Stellar asset code

### issuer
- **Type**: `bytes32`
- **Format**: 
  - For issued assets: Hex-encoded Ed25519 public key (64 hex characters, prefixed with "0x")
  - For XLM (native): The string `"NATIVE"` (not hex-encoded)
- **Purpose**: Asset issuer identifier

### amount
- **Type**: `int128`
- **Format**: Decimal string representation (not hex)
- **Units**: Stroops
  - 1 XLM = 10,000,000 stroops
  - 1 USDC (6 decimals) = 1,000,000 stroops
- **Examples**: `"1000000"`, `"20000000"`, `"500000"`
- **Note**: Always positive (validated in contract)

### destination
- **Type**: `bytes32` (32 bytes)
- **Format**: Hex-encoded Ed25519 public key (64 hex characters, prefixed with "0x")
- **Purpose**: Stellar account address where funds should be sent

## Example Usage

### Querying the Queue

```javascript
// Using Soroban SDK (JavaScript)
const withdrawalQueue = await executionCore.get_withdrawal_queue(subnetId);
console.log(withdrawalQueue);
```

### Processing Withdrawals

Arko should:
1. Iterate through the withdrawal queue array
2. Group withdrawals by asset (asset_code + issuer)
3. Compute PoM delta (sum amounts per asset)
4. Build Stellar transactions for each withdrawal
5. Use the `withdrawal_id` in transaction memos for tracking

## Important Notes

1. **Order**: Withdrawals are in FIFO order (first requested = first in queue)
2. **Immutability**: Once added, withdrawals remain in queue until settlement processes them
3. **Balance Already Debited**: When a withdrawal is in the queue, the user's balance has already been debited. The money exists in the treasury vault on L1.
4. **Nonce Increment**: Each withdrawal increments the subnet nonce, ensuring unique withdrawal_ids
5. **Empty Queue**: If no withdrawals exist, the function returns an empty array `[]`

## Integration with PoM Delta

The withdrawal queue is used to compute the Proof of Money (PoM) delta:

```javascript
// Pseudo-code for PoM delta computation
const delta = {};
for (const withdrawal of withdrawalQueue) {
    const assetId = sha256(withdrawal.asset_code + withdrawal.issuer);
    delta[assetId] = (delta[assetId] || 0) + parseInt(withdrawal.amount);
}
```

This matches the PoM Delta Schema defined in `interfaces.md`.

