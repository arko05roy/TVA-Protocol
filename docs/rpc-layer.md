# RPC Translation Layer

The TVA RPC layer is an EVM-compatible JSON-RPC server that translates Ethereum-format requests into Stellar/Soroban operations. This allows standard Ethereum tooling (Hardhat, Foundry, MetaMask, ethers.js) to interact with contracts deployed on Soroban without modification.

## Architecture Overview

```
+-------------------+         +-------------------+         +-------------------+
|                   |         |                   |         |                   |
|  EVM Tooling      |  eth_*  |  TVA RPC Layer    | Soroban |  Stellar Network  |
|  (Hardhat,        | ------> |                   | ------> |  (Soroban VM)     |
|   MetaMask,       |         |  - Tx translator  |         |                   |
|   ethers.js)      | <------ |  - Block emulator | <------ |  (SCP Consensus)  |
|                   |  JSON   |  - Account mapper |  XDR    |                   |
+-------------------+         +-------------------+         +-------------------+
```

The RPC layer performs three core translations:

1. **Transaction translation** -- EVM transactions become Soroban `InvokeHostFunction` operations
2. **Block/receipt emulation** -- Stellar ledger data is presented as EVM blocks and receipts
3. **Account mapping** -- Ethereum addresses map to Stellar/Soroban addresses via the AccountRegistry

## Supported eth_* Methods

### Account Methods

| Method | Translation |
|--------|-------------|
| `eth_getBalance` | Query XLM balance (or wrapped token balance) for the mapped Stellar address |
| `eth_getTransactionCount` | Stellar account sequence number |
| `eth_getCode` | Soroban contract WASM hash (returns non-empty if contract exists) |

### Transaction Methods

| Method | Translation |
|--------|-------------|
| `eth_sendRawTransaction` | Decode EVM tx, translate to Stellar tx, submit to network |
| `eth_getTransactionByHash` | Look up Stellar tx by mapped hash |
| `eth_getTransactionReceipt` | Construct receipt from Stellar transaction result |
| `eth_estimateGas` | Simulate on Soroban, convert resource units to gas equivalent |
| `eth_call` | Simulate Soroban invocation (read-only, no state changes) |

### Block Methods

| Method | Translation |
|--------|-------------|
| `eth_blockNumber` | Latest Stellar ledger sequence number |
| `eth_getBlockByNumber` | Construct EVM block from Stellar ledger data |
| `eth_getBlockByHash` | Look up ledger by hash |

### Log/Event Methods

| Method | Translation |
|--------|-------------|
| `eth_getLogs` | Query Soroban events, translate to EVM log format |
| `eth_subscribe` (WebSocket) | Stream Soroban events as EVM logs |

### Chain Methods

| Method | Translation |
|--------|-------------|
| `eth_chainId` | Returns `0x5448D640` (TVA chain ID: 1414676736) |
| `net_version` | Network identifier string |
| `eth_gasPrice` | Current Stellar base fee converted to gas price equivalent |

### Contract Deployment

When `eth_sendRawTransaction` receives a transaction with an empty `to` field, it is treated as a contract deployment:

1. Extract bytecode/source from transaction data
2. If Solidity source: compile via `solang --target soroban`
3. If pre-compiled WASM: use directly
4. Upload WASM to Soroban
5. Create contract instance
6. Call `init()` with constructor arguments
7. Return contract address (Soroban contract ID mapped to 20-byte EVM address)

## Transaction Translation

### EVM to Stellar Mapping

```
EVM Transaction                     Stellar Transaction
+--------------------------+        +--------------------------+
| nonce                    |        | source_account           |
| gasPrice / maxFeePerGas  |  --->  | fee (stroops)            |
| gasLimit                 |        | sequence_number          |
| to (contract address)    |        | operations[]             |
| value                    |        |   InvokeHostFunction     |
| data (ABI-encoded call)  |        |     contract_id          |
| v, r, s (signature)      |        |     function_name        |
+--------------------------+        |     args[] (ScVal)       |
                                    | signatures[]             |
                                    +--------------------------+
```

### Translation Steps

1. **Address resolution** -- Look up the Stellar address for the EVM `to` address via the AccountRegistry contract
2. **Calldata decoding** -- Extract the 4-byte function selector, look up the function name from the contract ABI, decode ABI-encoded parameters
3. **Argument re-encoding** -- Convert ABI-decoded values to Soroban ScVal format
4. **Fee translation** -- Convert gas price/limit to Stellar fee in stroops (1 XLM = 10,000,000 stroops)
5. **Signature adaptation** -- Translate secp256k1 ECDSA signature to Ed25519 (via dual-key wallet or shim)

### Receipt Construction

After a Stellar transaction settles:

```
Stellar Ledger Close                EVM Block
+--------------------------+        +--------------------------+
| ledger_sequence          |  --->  | block_number             |
| close_time               |        | timestamp                |
| tx_set_hash              |        | hash                     |
| base_fee                 |        | gasUsed / gasLimit       |
| transaction_results[]    |        | transactions[]           |
+--------------------------+        +--------------------------+
```

## Configuration

The RPC server is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TVA_RPC_PORT` | `8545` | Port for the JSON-RPC server |
| `TVA_RPC_HOST` | `0.0.0.0` | Host to bind |
| `TVA_CHAIN_ID` | `1414676736` | Chain ID returned by `eth_chainId` |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network passphrase for tx signing |
| `SOLANG_PATH` | `./tooling/bin/solang` | Path to the Solang compiler binary |
| `RUST_LOG` | `info` | Log level (trace, debug, info, warn, error) |

## Running the RPC Server

```bash
# Set up environment (copy and edit .env.example)
cp .env.example .env

# Start the RPC server (once implemented)
# The server will listen on TVA_RPC_PORT (default 8545)
cargo run --release -p tva-rpc

# Or with custom configuration
TVA_RPC_PORT=8545 STELLAR_RPC_URL=https://soroban-testnet.stellar.org cargo run --release -p tva-rpc
```

## Connecting Developer Tools

### MetaMask

Add a custom network:
- Network Name: `TVA Testnet`
- RPC URL: `http://localhost:8545`
- Chain ID: `1414676736`
- Currency Symbol: `XLM`

### Hardhat

```javascript
// hardhat.config.js
module.exports = {
  networks: {
    tva: {
      url: "http://localhost:8545",
      chainId: 1414676736,
    }
  }
};
```

### ethers.js

```javascript
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// Deploy and interact as you would on any EVM chain
const factory = new ethers.ContractFactory(abi, bytecode, signer);
const contract = await factory.deploy();
```

### Foundry

```bash
forge create src/Counter.sol:Counter \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY
```

## Current Status

The RPC layer is under active development. The compilation pipeline (Solang to Soroban WASM) and direct Stellar CLI deployment are functional today. The JSON-RPC translation server is the next major milestone.
