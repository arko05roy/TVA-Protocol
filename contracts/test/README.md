# Testing ASTRAEUS Contracts

## Overview

This directory contains test contracts for SubnetFactory and ExecutionCore.

## Test Files

- `TestSubnetFactory.sol` - Tests for SubnetFactory contract
- `TestExecutionCore.sol` - Tests for ExecutionCore contract

## Running Tests

### Using Solang CLI

1. **Compile the test contracts:**
```bash
solang compile contracts/test/TestSubnetFactory.sol --target soroban
solang compile contracts/test/TestExecutionCore.sol --target soroban
```

2. **Deploy to testnet:**
```bash
# Deploy SubnetFactory
soroban contract deploy --wasm SubnetFactory.wasm --source alice --network testnet

# Deploy ExecutionCore (pass SubnetFactory address)
soroban contract deploy --wasm ExecutionCore.wasm --source alice --network testnet

# Deploy TestSubnetFactory
soroban contract deploy --wasm TestSubnetFactory.wasm --source alice --network testnet

# Deploy TestExecutionCore
soroban contract deploy --wasm TestExecutionCore.wasm --source alice --network testnet
```

3. **Initialize and run tests:**
```bash
# Initialize TestSubnetFactory
soroban contract invoke --id <TEST_SUBNET_FACTORY_ID> --source alice --network testnet -- init --admin <ADMIN_ADDRESS>

# Run all SubnetFactory tests
soroban contract invoke --id <TEST_SUBNET_FACTORY_ID> --source alice --network testnet -- run_all_tests

# Initialize TestExecutionCore
soroban contract invoke --id <TEST_EXECUTION_CORE_ID> --source alice --network testnet -- init --testAdmin <ADMIN_ADDRESS>

# Run all ExecutionCore tests
soroban contract invoke --id <TEST_EXECUTION_CORE_ID> --source alice --network testnet -- run_all_tests
```

### Using Solang Playground

1. Go to https://solang.io
2. Copy the contract code and test contract code
3. Compile and test in the browser

## Test Coverage

### SubnetFactory Tests

- ✅ `test_create_subnet_valid` - Creates subnet with valid parameters
- ✅ `test_create_subnet_too_few_auditors` - Rejects subnet with < 3 auditors
- ✅ `test_create_subnet_threshold_too_low` - Rejects subnet with threshold < floor(n/2)+1
- ✅ `test_create_subnet_no_assets` - Rejects subnet with no assets
- ✅ `test_register_treasury` - Registers treasury and activates subnet
- ✅ `test_is_asset_whitelisted` - Checks asset whitelist functionality

### ExecutionCore Tests

- ✅ `test_credit` - Credits balance to user
- ✅ `test_debit` - Debits balance from user
- ✅ `test_debit_insufficient_balance` - Rejects debit with insufficient balance
- ✅ `test_transfer` - Transfers between users
- ✅ `test_request_withdrawal` - Creates withdrawal and adds to queue
- ✅ `test_withdrawal_queue_format` - Verifies withdrawal queue structure
- ✅ `test_credit_negative_amount` - Rejects negative credit amounts
- ✅ `test_transfer_to_self` - Rejects transfer to self

## Expected Results

All tests should pass. If a test fails, check:

1. Contract deployment was successful
2. Contracts were initialized with `init()`
3. Test admin address has proper permissions
4. SubnetFactory is properly linked to ExecutionCore

## Manual Testing

You can also test individual functions:

```bash
# Test creating a subnet
soroban contract invoke --id <FACTORY_ID> --source alice --network testnet -- \
  create_subnet \
  --admin <ADMIN_BYTES32> \
  --auditors '[<AUDITOR1>, <AUDITOR2>, <AUDITOR3>]' \
  --threshold 2 \
  --assets '[{"code":"XLM","issuer":"NATIVE"}]'

# Test crediting balance
soroban contract invoke --id <EXECUTION_ID> --source alice --network testnet -- \
  credit \
  --subnet_id <SUBNET_ID> \
  --user_id <USER_ID> \
  --asset_code "XLM" \
  --issuer "NATIVE" \
  --amount 1000000
```

