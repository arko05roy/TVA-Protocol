# Developer Guide

Get started building on TVA Protocol: write Solidity, compile to Soroban WASM, and deploy to Stellar.

## Prerequisites

### Required

- **Rust** (stable toolchain) -- for building Solang and Stellar CLI
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

- **Node.js** (v18+) -- for frontend tooling and ethers.js integration
  ```bash
  # Via nvm (recommended)
  nvm install 18
  ```

- **Stellar CLI** -- for deploying and invoking contracts on Soroban
  ```bash
  cargo install --locked stellar-cli
  # Or use the bundled binary: ./tooling/bin/stellar
  ```

### Included in Repository

- **Solang compiler** -- pre-built at `./tooling/bin/solang` (Soroban target)
- **LLVM 16** -- extracted at `./tooling/llvm16/` (used during Solang builds)

### Optional

- **Docker** -- for reproducible Solang builds via `tooling/Dockerfile.solang-build`

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/TVA-Protocol.git
cd TVA-Protocol

# Copy environment file
cp .env.example .env
# Edit .env with your Stellar keys (see below)

# Verify the Solang compiler works
./tooling/bin/solang --version

# Set up a Stellar testnet identity
./tooling/bin/stellar keys generate alice --network testnet
./tooling/bin/stellar keys fund alice --network testnet
```

### Generating Stellar Keys

```bash
# Generate a new keypair for testnet
./tooling/bin/stellar keys generate alice --network testnet

# Fund the account with testnet XLM
./tooling/bin/stellar keys fund alice --network testnet

# View the public key
./tooling/bin/stellar keys address alice
```

## Writing Your First Contract

Create a file at `contracts/HelloWorld.sol`:

```solidity
pragma solidity 0;

contract HelloWorld {
    // Instance storage for contract config
    string public instance greeting;
    address public instance owner;

    // Persistent counter
    uint64 public persistent callCount = 0;

    constructor(address _owner, string memory _greeting) {
        owner = _owner;
        greeting = _greeting;
    }

    function greet() public returns (string memory) {
        callCount += 1;
        callCount.extendTtl(100, 5000);
        return greeting;
    }

    function set_greeting(string memory _greeting) public {
        owner.requireAuth();
        greeting = _greeting;
    }

    function get_call_count() public view returns (uint64) {
        return callCount;
    }

    function extend_ttl() public returns (int64) {
        return extendInstanceTtl(1000, 50000);
    }
}
```

Key things to note:
- `pragma solidity 0;` (not `^0.8.0`)
- Storage annotations: `instance` and `persistent`
- `requireAuth()` instead of `msg.sender`
- `extendTtl()` calls for state persistence
- Constructor becomes `init()` on deployment

## Compiling

```bash
# Compile the contract
./tooling/bin/solang compile contracts/HelloWorld.sol --target soroban

# Check output
ls -la HelloWorld.wasm HelloWorld.abi

# Move to artifacts directory
mv HelloWorld.wasm HelloWorld.abi artifacts/
```

The compiler produces:
- `HelloWorld.wasm` -- Soroban-compatible WebAssembly binary
- `HelloWorld.abi` -- Contract interface specification (ScSpec entries)

## Deploying to Testnet

```bash
# Deploy the WASM binary
./tooling/bin/stellar contract deploy \
  --wasm artifacts/HelloWorld.wasm \
  --source alice \
  --network testnet

# Save the returned contract ID
# Example: CDLZFCQ3B2K5X7VZ7LQXO3DKDKT5JWVMHZ2RYFVWK4WE

# Initialize with constructor arguments
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- init --_owner alice --_greeting "Hello from TVA"
```

## Interacting with Your Contract

### Via Stellar CLI

```bash
# Call greet()
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- greet

# Call set_greeting()
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- set_greeting --_greeting "Updated greeting"

# Read call count
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- get_call_count
```

### Via Standard EVM Tools (with RPC layer)

Once the TVA RPC layer is running, use familiar Ethereum tooling:

#### ethers.js

```javascript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Load contract ABI (from artifacts/)
const abi = [...]; // Your contract ABI
const contract = new ethers.Contract(contractAddress, abi, signer);

// Call functions
const greeting = await contract.greet();
console.log(greeting);
```

#### Hardhat

```javascript
// hardhat.config.js
module.exports = {
  solidity: "0.8.19",
  networks: {
    tva: {
      url: "http://localhost:8545",
      chainId: 1414676736,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
```

```bash
npx hardhat run scripts/deploy.js --network tva
```

#### MetaMask

1. Open MetaMask Settings > Networks > Add Network
2. Configure:
   - Network Name: `TVA Testnet`
   - RPC URL: `http://localhost:8545`
   - Chain ID: `1414676736`
   - Currency Symbol: `XLM`
3. Import your account private key

## Project Structure

```
TVA-Protocol/
  contracts/          Solidity source files
    Counter.sol         Basic counter example
    TVAToken.sol        ERC20-compatible token
    AccountRegistry.sol EVM<->Stellar address mapping
  artifacts/          Compiled WASM and ABI output
  tooling/
    bin/              Solang compiler + Stellar CLI binaries
    solang/           Solang compiler source (with Soroban target)
    build_solang.sh   Build script for Solang
  client/             Frontend (Next.js)
  dev-b/              Settlement layer modules (vault, settlement, snapshots)
  agent/              Agent references and task tracking
  docs/               This documentation
  .env.example        Environment template
```

## Common Patterns

### Admin-Controlled Contract

```solidity
pragma solidity 0;

contract AdminControlled {
    address public instance admin;
    bool public instance paused;

    constructor(address _admin) {
        admin = _admin;
        paused = false;
    }

    function admin_action() public {
        admin.requireAuth();
        require(!paused, "Contract is paused");
        // ... action logic
    }

    function pause() public {
        admin.requireAuth();
        paused = true;
    }

    function unpause() public {
        admin.requireAuth();
        paused = false;
    }
}
```

### Token with Allowances

See `contracts/TVAToken.sol` for a complete ERC20-compatible implementation with mint, burn, transfer, and approve patterns adapted for Soroban.

### Address Registry

See `contracts/AccountRegistry.sol` for bidirectional address mapping between EVM and Stellar accounts.

## Troubleshooting

### "pragma solidity 0" required

Solang's Soroban target requires `pragma solidity 0;` at the top of every file. Using `^0.8.0` or other version pragmas will cause compilation errors.

### extendTtl only works on uint64

Currently, only `uint64` persistent variables support `.extendTtl()`. For other types, use `extendInstanceTtl()` to extend the contract instance lifetime.

### No msg.sender

Soroban has no concept of `msg.sender`. You must pass the caller address as a parameter and call `.requireAuth()` on it to verify ownership.

### Constructor not running

On Soroban, constructors become `init()` functions that must be called separately after contract deployment. The deploy command only uploads and instantiates the WASM -- you must explicitly invoke `init`.

### Compilation succeeds but deployment fails

Check that your Stellar account is funded. Testnet accounts need XLM for fees:

```bash
./tooling/bin/stellar keys fund alice --network testnet
```
