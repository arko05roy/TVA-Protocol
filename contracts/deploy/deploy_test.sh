#!/bin/bash
# Deploy and test TVA contracts on Stellar Testnet
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLING_DIR="$SCRIPT_DIR/../../tooling"
SOLANG="$TOOLING_DIR/bin/solang"
STELLAR="$TOOLING_DIR/bin/stellar"
SOURCE_IDENTITY="tva-deployer"
NETWORK="testnet"

echo "=== TVA Protocol - Soroban Deploy & Test ==="
echo ""

# Verify tools
echo "[0] Verifying tools..."
$SOLANG --version
$STELLAR --version
echo ""

# Compile contracts
echo "[1] Compiling contracts..."
mkdir -p "$SCRIPT_DIR/wasm"

$SOLANG compile "$SCRIPT_DIR/TVACounter.sol" --target soroban -o "$SCRIPT_DIR/wasm/"
echo "  TVACounter compiled"

$SOLANG compile "$SCRIPT_DIR/ExecutionCore.sol" --target soroban -o "$SCRIPT_DIR/wasm/"
echo "  ExecutionCore compiled"

ls -la "$SCRIPT_DIR/wasm/"*.wasm
echo ""

# Deploy TVACounter
echo "[2] Deploying TVACounter..."
COUNTER_ID=$($STELLAR contract deploy \
    --wasm "$SCRIPT_DIR/wasm/TVACounter.wasm" \
    --source $SOURCE_IDENTITY \
    --network $NETWORK)
echo "  ID: $COUNTER_ID"

# Initialize
echo "[3] Initializing TVACounter..."
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- init
echo "  Done"

# Test counter
echo "[4] Testing TVACounter..."
echo -n "  get: "
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- get

echo -n "  increment: "
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- increment

echo -n "  increment: "
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- increment

echo -n "  decrement: "
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- decrement

echo -n "  reset + get: "
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- reset
$STELLAR contract invoke --id "$COUNTER_ID" --source $SOURCE_IDENTITY --network $NETWORK -- get

echo ""
echo "=== TVACounter PASSED ==="
echo ""

# Deploy ExecutionCore
echo "[5] Deploying ExecutionCore..."
EXEC_ID=$($STELLAR contract deploy \
    --wasm "$SCRIPT_DIR/wasm/ExecutionCore.wasm" \
    --source $SOURCE_IDENTITY \
    --network $NETWORK)
echo "  ID: $EXEC_ID"

echo "[6] Initializing ExecutionCore..."
$STELLAR contract invoke --id "$EXEC_ID" --source $SOURCE_IDENTITY --network $NETWORK -- init
echo "  Done"

echo ""
echo "=== Deployment Summary ==="
echo "TVACounter:    $COUNTER_ID"
echo "ExecutionCore: $EXEC_ID"
echo "=== COMPLETE ==="
