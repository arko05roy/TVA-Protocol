#!/bin/bash
# =============================================================================
# TVA Protocol - Set Up Testnet Identity
# Generates a testnet identity and funds it via friendbot
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STELLAR="$PROJECT_ROOT/tooling/bin/stellar"
IDENTITY_NAME="${1:-tva-deployer}"
ENV_FILE="$PROJECT_ROOT/.env"

# Verify Stellar CLI exists
if [ ! -x "$STELLAR" ]; then
    echo "ERROR: Stellar CLI not found at $STELLAR"
    exit 1
fi

echo "=== TVA Protocol Testnet Setup ==="
echo "Stellar CLI: $($STELLAR --version 2>&1 | head -1)"
echo "Identity: $IDENTITY_NAME"
echo ""

# Configure testnet network
echo "Configuring testnet network..."
$STELLAR network add testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015" 2>/dev/null || true

# Check if identity already exists
echo "Checking for existing identity '$IDENTITY_NAME'..."
EXISTING_KEY=$($STELLAR keys public-key "$IDENTITY_NAME" 2>/dev/null || true)

if [ -n "$EXISTING_KEY" ]; then
    echo "Identity '$IDENTITY_NAME' already exists with public key: $EXISTING_KEY"
    echo ""
    read -p "Overwrite? (y/N): " -r REPLY
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing identity."
        echo "Public Key: $EXISTING_KEY"
        exit 0
    fi
    OVERWRITE="--overwrite"
else
    OVERWRITE=""
fi

# Check if we have keys in .env file
if [ -f "$ENV_FILE" ]; then
    echo "Found existing .env file."
    source "$ENV_FILE" 2>/dev/null || true
    if [ -n "$private_key" ]; then
        echo "Adding identity from .env private key..."
        $STELLAR keys add "$IDENTITY_NAME" --secret-key $OVERWRITE <<< "$private_key" 2>&1 || true
        PUBLIC_KEY=$($STELLAR keys public-key "$IDENTITY_NAME" 2>/dev/null || echo "$public_key")
        echo "Identity loaded from .env"
        echo "Public Key: $PUBLIC_KEY"
    fi
else
    # Generate new identity
    echo "Generating new identity '$IDENTITY_NAME'..."
    $STELLAR keys generate "$IDENTITY_NAME" \
        --network testnet \
        --fund \
        $OVERWRITE 2>&1

    PUBLIC_KEY=$($STELLAR keys public-key "$IDENTITY_NAME" 2>/dev/null)
    SECRET_KEY=$($STELLAR keys secret "$IDENTITY_NAME" 2>/dev/null || true)

    echo "New identity generated!"
    echo "Public Key: $PUBLIC_KEY"

    # Save to .env
    echo "Saving keys to $ENV_FILE..."
    cat > "$ENV_FILE" << EOF
private_key=$SECRET_KEY
public_key=$PUBLIC_KEY
EOF
    echo "Keys saved to .env"
fi

# Fund via friendbot
echo ""
echo "Funding account via friendbot..."
FUND_RESULT=$($STELLAR keys fund "$IDENTITY_NAME" --network testnet 2>&1 || true)
echo "$FUND_RESULT"

# Verify the account
echo ""
echo "=== Identity Summary ==="
echo "Name: $IDENTITY_NAME"
echo "Public Key: $($STELLAR keys public-key "$IDENTITY_NAME" 2>/dev/null || echo 'unknown')"
echo "Network: testnet (soroban-testnet.stellar.org)"
echo ""
echo "Setup complete! Use --source $IDENTITY_NAME in deploy commands."
