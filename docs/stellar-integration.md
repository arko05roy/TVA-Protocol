# Stellar/Soroban Integration

TVA Protocol deploys compiled Solidity contracts to Stellar's Soroban smart contract platform, settling all transactions via the Stellar Consensus Protocol (SCP).

## How Contracts Deploy to Soroban

Deployment is a two-step process on Soroban: uploading the WASM bytecode, then creating a contract instance.

### Deployment Steps

```bash
# Step 1: Compile Solidity to Soroban WASM
./tooling/bin/solang compile contracts/Counter.sol --target soroban

# Step 2: Deploy the WASM to the network
./tooling/bin/stellar contract deploy \
  --wasm Counter.wasm \
  --source alice \
  --network testnet

# This returns a contract ID, e.g.: CDLZFC...K4WE

# Step 3: Initialize the contract (calls the constructor logic)
./tooling/bin/stellar contract invoke \
  --id CDLZFC...K4WE \
  --source alice \
  --network testnet \
  -- init --_admin alice
```

### What Happens On-Chain

1. **WASM Upload** -- The compiled `.wasm` binary is uploaded to the Stellar network as an installable code entry. This is a ledger entry with its own TTL.
2. **Instance Creation** -- A new contract instance is created referencing the uploaded WASM hash. The instance gets its own ledger entry and TTL.
3. **Initialization** -- The `init()` function (Solidity constructor) is invoked to set up initial state. This creates contract data entries for state variables.

### Contract Invocation

Once deployed, invoke contract functions directly:

```bash
# Call a function
./tooling/bin/stellar contract invoke \
  --id CDLZFC...K4WE \
  --source alice \
  --network testnet \
  -- increment

# Read state
./tooling/bin/stellar contract invoke \
  --id CDLZFC...K4WE \
  --source alice \
  --network testnet \
  -- get
```

## How Transactions Settle on Stellar

Every contract invocation is a Stellar transaction that settles via SCP:

```
Transaction Submitted
        |
        v
   Stellar Core Node
   (validates, adds to candidate tx set)
        |
        v
   SCP Consensus Round (~5 seconds)
   (federated voting among validators)
        |
        v
   Ledger Close
   (transaction result is final, deterministic)
        |
        v
   Result Available
   (no rollbacks, no challenge periods)
```

### Settlement Properties

| Property | Value |
|----------|-------|
| Finality | 5 seconds, deterministic |
| Consensus | Federated Byzantine Agreement (SCP) |
| Rollback risk | Zero (once in ledger, it is final) |
| Transaction fee | ~0.00001 XLM (~$0.000001) |
| Throughput | ~1000 TPS (Soroban operations) |

### Fee Model

Soroban uses a resource-based fee model, not gas:

- **Inclusion fee** -- Base fee to include the transaction in a ledger
- **Resource fee** -- Based on CPU instructions, memory, storage reads/writes, and transaction size

The TVA RPC layer translates this into a gas-equivalent for EVM tooling compatibility.

## Account Model

TVA bridges the EVM and Stellar account models.

### EVM vs Stellar Addressing

| | EVM | Stellar |
|---|-----|---------|
| Key type | secp256k1 | Ed25519 |
| Address format | 20-byte hex (`0x...`) | 56-char base32 (`G...`) |
| Address derivation | keccak256(pubkey)[12:] | Base32-encode(pubkey) |

### Account Mapping

Each TVA user maintains a dual-key account:

```
TVA Account
+----------------------------------+
| secp256k1 keypair (EVM-facing)   |
|   -> 0x742d35Cc...               |
|                                  |
| Ed25519 keypair (Stellar-facing) |
|   -> GBXY...4FDE                 |
|                                  |
| Mapping stored in                |
| AccountRegistry contract         |
+----------------------------------+
```

### AccountRegistry Contract

The `AccountRegistry.sol` contract (deployed on Soroban) maintains bidirectional mappings:

```solidity
// Bidirectional lookup
mapping(address => address) public evmToStellar;
mapping(address => address) public stellarToEvm;

// Registration (Stellar account must authorize)
function register(address evmAccount, address stellarAccount) public {
    stellarAccount.requireAuth();
    evmToStellar[evmAccount] = stellarAccount;
    stellarToEvm[stellarAccount] = evmAccount;
    isRegistered[evmAccount] = true;
}
```

The RPC layer resolves addresses through this registry when translating transactions.

### Registration Flow

1. User generates a Stellar keypair
2. RPC layer derives the Soroban address representation for their EVM address
3. User calls `register()` with both addresses, proving Stellar key ownership via `requireAuth()`
4. Bidirectional lookup is stored on-chain

## Token Integration (ERC20 on Stellar)

TVA enables ERC20-compatible tokens on Soroban. The `TVAToken.sol` contract demonstrates the pattern:

### Key Differences from EVM ERC20

| Standard ERC20 | TVA Token on Soroban |
|---------------|---------------------|
| `msg.sender` for auth | `from.requireAuth()` explicit auth |
| `uint256` amounts | `int128` amounts (Soroban token standard) |
| Transfer events | Not yet supported |
| 18 decimals default | 7 decimals (Stellar convention) |
| Implicit caller | Explicit address parameters |

### Token Function Signatures

```solidity
// Transfer: 'from' must authorize
function transfer(address from, address to, int128 amount) public;

// Approve: 'owner' must authorize
function approve(address owner, address spender, int128 amount) public;

// Mint: admin must authorize
function mint(address to, int128 amount) public;
```

### Stellar Native Asset Interaction

Stellar has built-in multi-asset support. XLM and issued assets (like USDC on Stellar) can interact with Soroban contracts via the Stellar Asset Contract (SAC), which wraps classic Stellar assets for Soroban use.

## TTL and State Management

Soroban uses a state archival system where all ledger entries have a Time-To-Live (TTL). Data that is not refreshed eventually gets archived (removed from active ledger state).

### Storage Types and TTL

| Storage Type | TTL Behavior | Use Case |
|-------------|-------------|----------|
| Instance | Entire contract shares one TTL | Config, admin, flags |
| Persistent | Each entry has individual TTL | Balances, counters, mappings |
| Temporary | Deleted at end of transaction | Intermediate calculations |

### Extending TTL

```solidity
// Extend a specific persistent variable's TTL
// extendTtl(threshold, extend_to)
// If remaining TTL < threshold, extend to extend_to ledgers
counter.extendTtl(100, 5000);

// Extend the contract instance TTL (keeps instance storage alive)
extendInstanceTtl(1000, 50000);
```

### TTL Values

- 1 ledger ~ 5 seconds
- 1000 ledgers ~ 83 minutes
- 50000 ledgers ~ 2.9 days
- 100000 ledgers ~ 5.8 days
- For production, use larger values or implement periodic TTL extension

### Archival Recovery

If state is archived (TTL expires), it can be restored by providing a proof of the archived entry. The TVA RPC layer handles archival monitoring and automatic TTL extension for active contracts.

### Best Practices

- Always extend TTL after writing to persistent storage
- Use `extendInstanceTtl()` in frequently-called functions to keep the contract alive
- Only `uint64` persistent variables support `.extendTtl()` in current Solang -- use `extendInstanceTtl()` for other types
- Set threshold values high enough that normal usage keeps state alive
- Monitor TTL values for production contracts
