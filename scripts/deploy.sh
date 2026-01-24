#!/bin/bash
# =============================================================================
# TVA Protocol - Deploy Contract to Stellar Testnet
# Usage: ./scripts/deploy.sh <contract.wasm> [--alias <name>] [-- constructor args]
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STELLAR="$PROJECT_ROOT/tooling/bin/stellar"
NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-tva-deployer}"

# Verify Stellar CLI exists
if [ ! -x "$STELLAR" ]; then
    echo "ERROR: Stellar CLI not found at $STELLAR"
    exit 1
fi

# Parse arguments
WASM_FILE=""
ALIAS=""
CONSTRUCTOR_ARGS=""
PARSING_CONSTRUCTOR=false

while [[ $# -gt 0 ]]; do
    if $PARSING_CONSTRUCTOR; then
        CONSTRUCTOR_ARGS="$CONSTRUCTOR_ARGS $1"
        shift
        continue
    fi
    case $1 in
        --alias)
            ALIAS="$2"
            shift 2
            ;;
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --source)
            SOURCE="$2"
            shift 2
            ;;
        --)
            PARSING_CONSTRUCTOR=true
            shift
            ;;
        *)
            if [ -z "$WASM_FILE" ]; then
                WASM_FILE="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$WASM_FILE" ]; then
    echo "Usage: $0 <contract.wasm> [--alias <name>] [--network <network>] [--source <identity>] [-- constructor args]"
    echo ""
    echo "Examples:"
    echo "  $0 artifacts/Counter.wasm --alias counter -- --_admin \$(stellar keys public-key tva-deployer)"
    echo "  $0 artifacts/TVAToken.wasm --alias tva-token"
    exit 1
fi

# Resolve WASM file path
if [[ ! "$WASM_FILE" = /* ]]; then
    WASM_FILE="$PROJECT_ROOT/$WASM_FILE"
fi

if [ ! -f "$WASM_FILE" ]; then
    echo "ERROR: WASM file not found: $WASM_FILE"
    exit 1
fi

echo "=== TVA Protocol Contract Deployment ==="
echo "WASM: $WASM_FILE"
echo "Network: $NETWORK"
echo "Source: $SOURCE"
echo "Alias: ${ALIAS:-none}"
echo ""

# Build deploy command
DEPLOY_CMD="$STELLAR contract deploy --wasm $WASM_FILE --source-account $SOURCE --network $NETWORK"

if [ -n "$ALIAS" ]; then
    DEPLOY_CMD="$DEPLOY_CMD --alias $ALIAS"
fi

echo "Deploying..."
echo "Command: $DEPLOY_CMD"
if [ -n "$CONSTRUCTOR_ARGS" ]; then
    echo "Constructor args: $CONSTRUCTOR_ARGS"
    DEPLOY_CMD="$DEPLOY_CMD -- $CONSTRUCTOR_ARGS"
fi
echo ""

# Execute deployment
CONTRACT_ID=$(eval $DEPLOY_CMD 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -ne 0 ]; then
    echo "ERROR: Deployment failed (exit code $DEPLOY_EXIT)"
    echo "$CONTRACT_ID"
    exit 1
fi

echo "=== Deployment Successful ==="
echo "Contract ID: $CONTRACT_ID"
echo ""

# Save contract ID to a deployments file
DEPLOYMENTS_FILE="$PROJECT_ROOT/deployments.json"
BASENAME=$(basename "$WASM_FILE" .wasm)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -f "$DEPLOYMENTS_FILE" ]; then
    # Append to existing JSON (simple approach)
    echo "{\"contract\": \"$BASENAME\", \"id\": \"$CONTRACT_ID\", \"network\": \"$NETWORK\", \"timestamp\": \"$TIMESTAMP\"}" >> "$DEPLOYMENTS_FILE.tmp"
else
    echo "{\"contract\": \"$BASENAME\", \"id\": \"$CONTRACT_ID\", \"network\": \"$NETWORK\", \"timestamp\": \"$TIMESTAMP\"}" > "$DEPLOYMENTS_FILE.tmp"
fi
mv "$DEPLOYMENTS_FILE.tmp" "$DEPLOYMENTS_FILE"

echo "Saved to $DEPLOYMENTS_FILE"
echo "Contract ID: $CONTRACT_ID"
