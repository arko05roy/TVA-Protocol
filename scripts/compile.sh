#!/bin/bash
# =============================================================================
# TVA Protocol - Compile All Contracts
# Compiles Solidity contracts to Soroban WASM using Solang
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOLANG="$PROJECT_ROOT/tooling/bin/solang"
ARTIFACTS="$PROJECT_ROOT/artifacts"
CONTRACTS="$PROJECT_ROOT/contracts"

# Verify Solang binary exists
if [ ! -x "$SOLANG" ]; then
    echo "ERROR: Solang binary not found at $SOLANG"
    exit 1
fi

echo "=== TVA Protocol Contract Compilation ==="
echo "Solang: $SOLANG"
echo "Contracts: $CONTRACTS"
echo "Output: $ARTIFACTS"
echo ""

# Create artifacts directory
mkdir -p "$ARTIFACTS"

# Compile each contract
CONTRACTS_LIST=("Counter.sol" "TVAToken.sol" "AccountRegistry.sol")
FAILED=0

for contract in "${CONTRACTS_LIST[@]}"; do
    echo "Compiling $contract..."
    if $SOLANG compile --target soroban "$CONTRACTS/$contract" -o "$ARTIFACTS" 2>&1; then
        echo "  OK: $contract compiled successfully"
    else
        echo "  FAILED: $contract compilation failed"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=== Compilation Summary ==="
echo "Compiled WASMs:"
ls -la "$ARTIFACTS"/*.wasm 2>/dev/null || echo "  No WASM files found!"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "WARNING: $FAILED contract(s) failed to compile"
    exit 1
fi

echo "All contracts compiled successfully."
echo "Artifacts: $(ls "$ARTIFACTS"/*.wasm | tr '\n' ' ')"
