#!/bin/bash
# =============================================================================
# TVA Protocol - End-to-End Testnet Deployment and Testing
# Compiles, deploys, and invokes all contracts on Stellar testnet
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOLANG="$PROJECT_ROOT/tooling/bin/solang"
STELLAR="$PROJECT_ROOT/tooling/bin/stellar"
ARTIFACTS="$PROJECT_ROOT/artifacts"
CONTRACTS="$PROJECT_ROOT/contracts"
NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-tva-deployer}"

RESULTS_FILE="$PROJECT_ROOT/scripts/test-results.log"
PASS=0
FAIL=0
SKIP=0

# Logging functions
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$RESULTS_FILE"; }
pass() { PASS=$((PASS + 1)); log "PASS: $*"; }
fail() { FAIL=$((FAIL + 1)); log "FAIL: $*"; }
skip() { SKIP=$((SKIP + 1)); log "SKIP: $*"; }

# Initialize results log
echo "=== TVA Protocol E2E Test Run ===" > "$RESULTS_FILE"
echo "Date: $(date -u)" >> "$RESULTS_FILE"
echo "Network: $NETWORK" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

log "=== TVA Protocol End-to-End Tests ==="
log "Network: $NETWORK"
log "Source: $SOURCE"
log ""

# ---------------------------------------------------------------------------
# Step 0: Prerequisites
# ---------------------------------------------------------------------------
log "--- Step 0: Verifying Prerequisites ---"

if [ ! -x "$SOLANG" ]; then
    log "ERROR: Solang not found at $SOLANG"
    exit 1
fi
log "Solang binary: OK"

if [ ! -x "$STELLAR" ]; then
    log "ERROR: Stellar CLI not found at $STELLAR"
    exit 1
fi
log "Stellar CLI: $($STELLAR --version 2>&1 | head -1)"

# Configure network
log "Configuring testnet..."
$STELLAR network add testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015" 2>/dev/null || true

# Check identity
PUBLIC_KEY=$($STELLAR keys public-key "$SOURCE" 2>/dev/null || true)
if [ -z "$PUBLIC_KEY" ]; then
    log "Identity '$SOURCE' not found. Setting up..."
    # Try loading from .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        source "$PROJECT_ROOT/.env"
        if [ -n "$private_key" ]; then
            echo "$private_key" | $STELLAR keys add "$SOURCE" --secret-key 2>&1 || true
            PUBLIC_KEY=$($STELLAR keys public-key "$SOURCE" 2>/dev/null || echo "$public_key")
        fi
    fi
    if [ -z "$PUBLIC_KEY" ]; then
        log "ERROR: No identity available. Run setup-testnet.sh first."
        exit 1
    fi
fi
log "Deployer Public Key: $PUBLIC_KEY"

# Fund account
log "Funding account via friendbot..."
$STELLAR keys fund "$SOURCE" --network testnet 2>&1 || log "Funding may have failed (account may already be funded)"

log ""

# ---------------------------------------------------------------------------
# Step 1: Compile All Contracts
# ---------------------------------------------------------------------------
log "--- Step 1: Compiling Contracts ---"
mkdir -p "$ARTIFACTS"

for contract in Counter.sol TVAToken.sol AccountRegistry.sol; do
    log "Compiling $contract..."
    COMPILE_OUTPUT=$($SOLANG compile --target soroban "$CONTRACTS/$contract" -o "$ARTIFACTS" 2>&1)
    COMPILE_EXIT=$?
    if [ $COMPILE_EXIT -eq 0 ]; then
        WASM_NAME=$(basename "$contract" .sol).wasm
        if [ -f "$ARTIFACTS/$WASM_NAME" ]; then
            WASM_SIZE=$(stat --format=%s "$ARTIFACTS/$WASM_NAME" 2>/dev/null || stat -f%z "$ARTIFACTS/$WASM_NAME" 2>/dev/null || echo "unknown")
            pass "$contract compiled ($WASM_SIZE bytes)"
        else
            fail "$contract compiled but WASM not found"
        fi
    else
        fail "$contract compilation: $COMPILE_OUTPUT"
    fi
done

log ""

# ---------------------------------------------------------------------------
# Step 2: Deploy Counter Contract
# ---------------------------------------------------------------------------
log "--- Step 2: Deploying Counter Contract ---"

COUNTER_ID=""
log "Deploying Counter.wasm with constructor arg --_admin $PUBLIC_KEY..."
DEPLOY_OUTPUT=$($STELLAR contract deploy \
    --wasm "$ARTIFACTS/Counter.wasm" \
    --source-account "$SOURCE" \
    --network "$NETWORK" \
    -- --_admin "$PUBLIC_KEY" 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 0 ] && [ -n "$DEPLOY_OUTPUT" ]; then
    COUNTER_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE 'C[A-Z0-9]{55}' | head -1)
    if [ -z "$COUNTER_ID" ]; then
        COUNTER_ID="$DEPLOY_OUTPUT"
    fi
    pass "Counter deployed: $COUNTER_ID"
else
    fail "Counter deployment: $DEPLOY_OUTPUT"
fi

log ""

# ---------------------------------------------------------------------------
# Step 3: Test Counter Functions
# ---------------------------------------------------------------------------
log "--- Step 3: Testing Counter Functions ---"

if [ -n "$COUNTER_ID" ]; then
    # Test increment
    log "Invoking Counter.increment()..."
    INCREMENT_OUTPUT=$($STELLAR contract invoke \
        --id "$COUNTER_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- increment 2>&1)
    INCREMENT_EXIT=$?
    if [ $INCREMENT_EXIT -eq 0 ]; then
        pass "Counter.increment() returned: $INCREMENT_OUTPUT"
    else
        fail "Counter.increment(): $INCREMENT_OUTPUT"
    fi

    # Test get
    log "Invoking Counter.get()..."
    GET_OUTPUT=$($STELLAR contract invoke \
        --id "$COUNTER_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- get 2>&1)
    GET_EXIT=$?
    if [ $GET_EXIT -eq 0 ]; then
        pass "Counter.get() returned: $GET_OUTPUT"
    else
        fail "Counter.get(): $GET_OUTPUT"
    fi

    # Test increment_by
    log "Invoking Counter.increment_by(5)..."
    INCBY_OUTPUT=$($STELLAR contract invoke \
        --id "$COUNTER_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- increment_by --amount 5 2>&1)
    INCBY_EXIT=$?
    if [ $INCBY_EXIT -eq 0 ]; then
        pass "Counter.increment_by(5) returned: $INCBY_OUTPUT"
    else
        fail "Counter.increment_by(5): $INCBY_OUTPUT"
    fi

    # Test get again (should be 6)
    log "Invoking Counter.get() again..."
    GET2_OUTPUT=$($STELLAR contract invoke \
        --id "$COUNTER_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- get 2>&1)
    GET2_EXIT=$?
    if [ $GET2_EXIT -eq 0 ]; then
        pass "Counter.get() after increment_by: $GET2_OUTPUT"
    else
        fail "Counter.get() after increment_by: $GET2_OUTPUT"
    fi

    # Test decrement
    log "Invoking Counter.decrement()..."
    DEC_OUTPUT=$($STELLAR contract invoke \
        --id "$COUNTER_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- decrement 2>&1)
    DEC_EXIT=$?
    if [ $DEC_EXIT -eq 0 ]; then
        pass "Counter.decrement() returned: $DEC_OUTPUT"
    else
        fail "Counter.decrement(): $DEC_OUTPUT"
    fi
else
    skip "Counter function tests (deployment failed)"
fi

log ""

# ---------------------------------------------------------------------------
# Step 4: Deploy TVAToken Contract
# ---------------------------------------------------------------------------
log "--- Step 4: Deploying TVAToken Contract ---"

TVATOKEN_ID=""
log "Deploying TVAToken.wasm..."
DEPLOY_OUTPUT=$($STELLAR contract deploy \
    --wasm "$ARTIFACTS/TVAToken.wasm" \
    --source-account "$SOURCE" \
    --network "$NETWORK" \
    -- --_admin "$PUBLIC_KEY" \
       --_name "TVA Token" \
       --_symbol "TVA" \
       --_decimals 7 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 0 ] && [ -n "$DEPLOY_OUTPUT" ]; then
    TVATOKEN_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE 'C[A-Z0-9]{55}' | head -1)
    if [ -z "$TVATOKEN_ID" ]; then
        TVATOKEN_ID="$DEPLOY_OUTPUT"
    fi
    pass "TVAToken deployed: $TVATOKEN_ID"
else
    fail "TVAToken deployment: $DEPLOY_OUTPUT"
fi

log ""

# ---------------------------------------------------------------------------
# Step 5: Test TVAToken Functions
# ---------------------------------------------------------------------------
log "--- Step 5: Testing TVAToken Functions ---"

if [ -n "$TVATOKEN_ID" ]; then
    # Test name
    log "Invoking TVAToken.name()..."
    NAME_OUTPUT=$($STELLAR contract invoke \
        --id "$TVATOKEN_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- name 2>&1)
    NAME_EXIT=$?
    if [ $NAME_EXIT -eq 0 ]; then
        pass "TVAToken.name() returned: $NAME_OUTPUT"
    else
        fail "TVAToken.name(): $NAME_OUTPUT"
    fi

    # Test symbol
    log "Invoking TVAToken.symbol()..."
    SYMBOL_OUTPUT=$($STELLAR contract invoke \
        --id "$TVATOKEN_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- symbol 2>&1)
    SYMBOL_EXIT=$?
    if [ $SYMBOL_EXIT -eq 0 ]; then
        pass "TVAToken.symbol() returned: $SYMBOL_OUTPUT"
    else
        fail "TVAToken.symbol(): $SYMBOL_OUTPUT"
    fi

    # Test mint
    log "Invoking TVAToken.mint(to=$PUBLIC_KEY, amount=1000000000)..."
    MINT_OUTPUT=$($STELLAR contract invoke \
        --id "$TVATOKEN_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- mint --to "$PUBLIC_KEY" --amount 1000000000 2>&1)
    MINT_EXIT=$?
    if [ $MINT_EXIT -eq 0 ]; then
        pass "TVAToken.mint() returned: $MINT_OUTPUT"
    else
        fail "TVAToken.mint(): $MINT_OUTPUT"
    fi

    # Test balance
    log "Invoking TVAToken.balance(account=$PUBLIC_KEY)..."
    BAL_OUTPUT=$($STELLAR contract invoke \
        --id "$TVATOKEN_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- balance --account "$PUBLIC_KEY" 2>&1)
    BAL_EXIT=$?
    if [ $BAL_EXIT -eq 0 ]; then
        pass "TVAToken.balance() returned: $BAL_OUTPUT"
    else
        fail "TVAToken.balance(): $BAL_OUTPUT"
    fi

    # Test get_total_supply
    log "Invoking TVAToken.get_total_supply()..."
    SUPPLY_OUTPUT=$($STELLAR contract invoke \
        --id "$TVATOKEN_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- get_total_supply 2>&1)
    SUPPLY_EXIT=$?
    if [ $SUPPLY_EXIT -eq 0 ]; then
        pass "TVAToken.get_total_supply() returned: $SUPPLY_OUTPUT"
    else
        fail "TVAToken.get_total_supply(): $SUPPLY_OUTPUT"
    fi
else
    skip "TVAToken function tests (deployment failed)"
fi

log ""

# ---------------------------------------------------------------------------
# Step 6: Deploy AccountRegistry Contract
# ---------------------------------------------------------------------------
log "--- Step 6: Deploying AccountRegistry Contract ---"

REGISTRY_ID=""
log "Deploying AccountRegistry.wasm..."
DEPLOY_OUTPUT=$($STELLAR contract deploy \
    --wasm "$ARTIFACTS/AccountRegistry.wasm" \
    --source-account "$SOURCE" \
    --network "$NETWORK" \
    -- --_admin "$PUBLIC_KEY" 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 0 ] && [ -n "$DEPLOY_OUTPUT" ]; then
    REGISTRY_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE 'C[A-Z0-9]{55}' | head -1)
    if [ -z "$REGISTRY_ID" ]; then
        REGISTRY_ID="$DEPLOY_OUTPUT"
    fi
    pass "AccountRegistry deployed: $REGISTRY_ID"
else
    fail "AccountRegistry deployment: $DEPLOY_OUTPUT"
fi

log ""

# ---------------------------------------------------------------------------
# Step 7: Test AccountRegistry Functions
# ---------------------------------------------------------------------------
log "--- Step 7: Testing AccountRegistry Functions ---"

if [ -n "$REGISTRY_ID" ]; then
    # Test get_registration_count (should be 0)
    log "Invoking AccountRegistry.get_registration_count()..."
    COUNT_OUTPUT=$($STELLAR contract invoke \
        --id "$REGISTRY_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- get_registration_count 2>&1)
    COUNT_EXIT=$?
    if [ $COUNT_EXIT -eq 0 ]; then
        pass "AccountRegistry.get_registration_count() returned: $COUNT_OUTPUT"
    else
        fail "AccountRegistry.get_registration_count(): $COUNT_OUTPUT"
    fi

    # Test is_account_registered (should be false)
    log "Invoking AccountRegistry.is_account_registered()..."
    ISREG_OUTPUT=$($STELLAR contract invoke \
        --id "$REGISTRY_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- is_account_registered --evm_account "$PUBLIC_KEY" 2>&1)
    ISREG_EXIT=$?
    if [ $ISREG_EXIT -eq 0 ]; then
        pass "AccountRegistry.is_account_registered() returned: $ISREG_OUTPUT"
    else
        fail "AccountRegistry.is_account_registered(): $ISREG_OUTPUT"
    fi

    # Test extend_instance_ttl
    log "Invoking AccountRegistry.extend_instance_ttl()..."
    TTL_OUTPUT=$($STELLAR contract invoke \
        --id "$REGISTRY_ID" \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        -- extend_instance_ttl 2>&1)
    TTL_EXIT=$?
    if [ $TTL_EXIT -eq 0 ]; then
        pass "AccountRegistry.extend_instance_ttl() returned: $TTL_OUTPUT"
    else
        fail "AccountRegistry.extend_instance_ttl(): $TTL_OUTPUT"
    fi
else
    skip "AccountRegistry function tests (deployment failed)"
fi

log ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log "=== E2E Test Summary ==="
log "PASSED: $PASS"
log "FAILED: $FAIL"
log "SKIPPED: $SKIP"
log ""
log "Contract IDs:"
log "  Counter: ${COUNTER_ID:-NOT DEPLOYED}"
log "  TVAToken: ${TVATOKEN_ID:-NOT DEPLOYED}"
log "  AccountRegistry: ${REGISTRY_ID:-NOT DEPLOYED}"
log ""

# Save deployment info
DEPLOY_INFO="$PROJECT_ROOT/scripts/last-deployment.env"
cat > "$DEPLOY_INFO" << EOF
# TVA Protocol Last Deployment - $(date -u)
COUNTER_ID=${COUNTER_ID}
TVATOKEN_ID=${TVATOKEN_ID}
REGISTRY_ID=${REGISTRY_ID}
NETWORK=${NETWORK}
DEPLOYER=${PUBLIC_KEY}
EOF
log "Deployment info saved to $DEPLOY_INFO"

if [ $FAIL -gt 0 ]; then
    log "Some tests FAILED. See above for details."
    exit 1
fi

log "All tests PASSED!"
