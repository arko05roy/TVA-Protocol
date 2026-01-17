#!/bin/bash

# Compile test contracts script
# Usage: ./compile_tests.sh

set -e

echo "Compiling ASTRAEUS test contracts..."

# Check if solang is installed
if ! command -v solang &> /dev/null; then
    echo "Error: solang is not installed"
    echo "Install from: https://github.com/hyperledger-solang/solang/releases"
    exit 1
fi

# Create output directory
mkdir -p ../build/test

# Compile SubnetFactory (dependency)
echo "Compiling SubnetFactory.sol..."
solang compile ../SubnetFactory.sol --target soroban --output ../build/test/ 2>&1 | tee ../build/test/subnet_factory_compile.log

# Compile ExecutionCore (dependency)
echo "Compiling ExecutionCore.sol..."
solang compile ../ExecutionCore.sol --target soroban --output ../build/test/ 2>&1 | tee ../build/test/execution_core_compile.log

# Compile TestSubnetFactory
echo "Compiling TestSubnetFactory.sol..."
solang compile TestSubnetFactory.sol --target soroban --output ../build/test/ 2>&1 | tee ../build/test/test_subnet_factory_compile.log

# Compile TestExecutionCore
echo "Compiling TestExecutionCore.sol..."
solang compile TestExecutionCore.sol --target soroban --output ../build/test/ 2>&1 | tee ../build/test/test_execution_core_compile.log

echo ""
echo "Compilation complete! Check ../build/test/ for output files."
echo ""
echo "If compilation succeeded, you can deploy with:"
echo "  soroban contract deploy --wasm ../build/test/TestSubnetFactory.wasm --source alice --network testnet"
echo "  soroban contract deploy --wasm ../build/test/TestExecutionCore.wasm --source alice --network testnet"

