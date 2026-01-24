# Solang Compiler Integration

TVA Protocol uses the [Solang compiler](https://github.com/hyperledger-solang/solang) to compile standard Solidity source code into Soroban-compatible WebAssembly. Solang is an LLVM-based compiler that targets multiple blockchain platforms; TVA uses its Soroban backend.

## Compilation Pipeline

```
Solidity Source (.sol)
        |
        v
   [Solang Frontend]
   - Lexer/Parser
   - Semantic analysis, type checking
   - AST construction
        |
        v
   [Codegen Phase]
   - Control Flow Graph generation
   - Soroban dispatch (function exports)
   - ScVal encoding for all values
   - Host function mapping
        |
        v
   [LLVM IR Emission]
   - LLVM 16 module construction
   - Storage load/store via Soroban host functions
        |
        v
   [LLVM Backend]
   - Optimization passes
   - WebAssembly target (wasm32-unknown-unknown)
        |
        v
   [Soroban Linker]
   - wasm-ld linking
   - Host function import resolution
   - Memory configuration (1 MiB initial)
        |
        v
   [Output]
   - .wasm file (Soroban-compatible WebAssembly)
   - .abi file (contract spec metadata)
```

## Compilation Command

```bash
# Basic compilation
./tooling/bin/solang compile contracts/MyContract.sol --target soroban

# Output goes to current directory by default
# Produces: MyContract.wasm, MyContract.abi
```

The compiled binary at `./tooling/bin/solang` is built with the `--features "llvm,soroban"` flag, targeting LLVM 16.

## Building Solang from Source

The build script at `tooling/build_solang.sh` handles the full build:

```bash
cd tooling && ./build_solang.sh
```

This sets up LLVM 16 paths, forces static LLVM linking (to avoid conflicts with rustc's LLVM), and runs:

```bash
cargo build --release --no-default-features --features "llvm,soroban"
```

The built binary lands at `tooling/solang/target/release/solang` and is copied to `tooling/bin/solang`.

A Docker-based build is also available via `tooling/Dockerfile.solang-build`.

## Supported Solidity Features

### Storage Types

Solang maps Solidity state variables to Soroban storage types using annotations:

```solidity
pragma solidity 0;

contract Example {
    // Instance storage - lives with contract instance, no individual TTL
    address public instance admin;
    string public instance name;

    // Persistent storage - durable, individually TTL-managed
    uint64 public persistent counter = 0;

    // Mappings default to persistent storage
    mapping(address => int128) public balances;
}
```

| Annotation | Soroban Storage | Use Case |
|------------|----------------|----------|
| `instance` | Instance | Config, admin addresses, flags |
| `persistent` | Persistent | Counters, balances, long-lived state |
| `temporary` | Temporary | Ephemeral data, deleted after invocation |
| (none/mapping) | Persistent | Default for mappings |

### Authorization

Soroban does not have `msg.sender`. Instead, use `requireAuth()`:

```solidity
function transfer(address from, address to, int128 amount) public {
    from.requireAuth();  // Caller must prove ownership of 'from'
    balances[from] -= amount;
    balances[to] += amount;
}
```

### TTL Management

Persistent state on Soroban is subject to archival. Extend TTL to keep data alive:

```solidity
// Extend TTL on a uint64 persistent variable
counter.extendTtl(100, 5000);  // (threshold, extend_to)

// Extend TTL for the entire contract instance
extendInstanceTtl(1000, 50000);
```

### Constructors

Solidity constructors become Soroban `init()` functions, called separately after deployment:

```solidity
constructor(address _admin) {
    admin = _admin;
}
// On-chain: deploy WASM, then invoke init(_admin)
```

### Integer Types

Solang rounds integer widths to Soroban-supported sizes:

| Solidity Type | Soroban Type | Notes |
|---------------|-------------|-------|
| `uint8` - `uint32` | `u32` | Rounded up |
| `uint33` - `uint64` | `u64` | |
| `uint65` - `uint128` | `u128` | |
| `int128` | `i128` | Matches Soroban token standard |
| `uint256` | `u256` | Full width |

### Supported Constructs

- Functions (public, view, pure)
- State variables with storage annotations
- Mappings (single and nested)
- `require()` with error messages
- Constructors (become `init()`)
- Integer arithmetic
- Boolean logic
- String types
- Address types (Soroban native)
- Structs (basic)
- Inheritance (flattened to single contract)

## Known Limitations

These are current limitations of the Solang Soroban target. Items marked "being fixed" are under active development.

### Events (being fixed)

Event emission is not yet supported on the Soroban target. Contracts compile without events but the `emit` keyword will produce a compilation error. Once supported, events will map to Soroban contract events.

```solidity
// NOT YET SUPPORTED:
// event Transfer(address indexed from, address indexed to, int128 amount);
// emit Transfer(from, to, amount);
```

### TTL Restrictions (being fixed)

`extendTtl()` only works on `uint64` persistent/temporary variables. Other types (int128, mappings, structs) must rely on `extendInstanceTtl()` for lifetime management.

### Byte Type Issues (being fixed)

The `bytes` and `bytesN` types have incomplete support. Use `string` where possible, or encode data as integers.

### Other Limitations

- No `msg.sender`, `msg.value`, `block.timestamp` -- use Soroban equivalents
- No payable functions (XLM transfers handled differently)
- No low-level calls (`call`, `delegatecall`, `staticcall`)
- No inline assembly
- No try/catch
- No function overloading (use distinct names)
- No interface inheritance across contracts (single-contract output)
- Pragma must be `pragma solidity 0;` (not `^0.8.x`)

## Example Compilation Workflow

```bash
# 1. Write your contract
cat > contracts/MyToken.sol << 'EOF'
pragma solidity 0;

contract MyToken {
    string public instance name;
    address public instance admin;
    mapping(address => int128) public balances;

    constructor(address _admin, string memory _name) {
        admin = _admin;
        name = _name;
    }

    function mint(address to, int128 amount) public {
        admin.requireAuth();
        balances[to] = balances[to] + amount;
    }

    function balance(address account) public view returns (int128) {
        return balances[account];
    }
}
EOF

# 2. Compile to Soroban WASM
./tooling/bin/solang compile contracts/MyToken.sol --target soroban

# 3. Verify output
ls -la MyToken.wasm MyToken.abi

# 4. Move artifacts
mv MyToken.wasm MyToken.abi artifacts/

# 5. Deploy to testnet
./tooling/bin/stellar contract deploy \
  --wasm artifacts/MyToken.wasm \
  --source alice \
  --network testnet

# 6. Initialize
./tooling/bin/stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  -- init --_admin alice --_name "My Token"
```

## Key Differences from EVM Solidity

| EVM Pattern | TVA/Soroban Pattern |
|-------------|-------------------|
| `msg.sender` | Explicit `address.requireAuth()` |
| `constructor` auto-runs | `init()` called separately after deploy |
| `uint256` default | `uint64` or `int128` preferred |
| ERC20 Transfer event | Not yet available |
| `payable` functions | Native asset ops via Stellar SDK |
| Storage slots | Named contract data entries |
| Gas metering | Soroban resource model |
