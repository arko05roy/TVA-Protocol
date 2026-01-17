# Solang for Stellar/Soroban: Complete Agent Reference Guide

> **Purpose**: This document serves as the definitive reference for writing Solidity code that compiles to Stellar's Soroban smart contract platform using the Solang compiler. When asked to write Solang code for Stellar, consult this document first.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Compilation Pipeline](#2-compilation-pipeline)
3. [Development Environment Setup](#3-development-environment-setup)
4. [Critical Differences from EVM Solidity](#4-critical-differences-from-evm-solidity)
5. [Storage System](#5-storage-system)
6. [Authorization Model](#6-authorization-model)
7. [Supported Types](#7-supported-types)
8. [Builtin Functions](#8-builtin-functions)
9. [TTL and State Archival](#9-ttl-and-state-archival)
10. [Contract Lifecycle](#10-contract-lifecycle)
11. [Events and Logging](#11-events-and-logging)
12. [Common Patterns](#12-common-patterns)
13. [Porting EVM Contracts](#13-porting-evm-contracts)
14. [Limitations and Unsupported Features](#14-limitations-and-unsupported-features)
15. [Complete Code Examples](#15-complete-code-examples)
16. [Troubleshooting](#16-troubleshooting)
17. [Quick Reference Cheat Sheet](#17-quick-reference-cheat-sheet)

---

## 1. Overview

### What is Solang?

Solang is a Solidity compiler built on LLVM that targets multiple blockchain platforms:
- **Solana** (eBPF)
- **Polkadot** (Wasm via contracts pallet)
- **Stellar/Soroban** (Wasm)

Solang is maintained by the [Hyperledger community](https://github.com/hyperledger-solang/solang) and aims for source compatibility with Solidity 0.8.

### What is Soroban?

Soroban is Stellar's smart contract platform. Key characteristics:
- Contracts run in an **isolated WebAssembly (Wasm) virtual machine**
- Uses a **host-guest architecture** where contracts communicate with the host via encoded 64-bit values called "Vals"
- Contracts are intentionally lightweight, delegating heavy operations to **host functions**
- Features built-in **state archival** with TTL-based storage management

### Current Status

> **WARNING**: The Soroban target is currently in **Pre-Alpha stage**. Many features are still being implemented.

---

## 2. Compilation Pipeline

```
Solidity Source Code
        ↓
   Solang Compiler (LLVM-based)
        ↓
     LLVM IR
        ↓
   WebAssembly (.wasm)
        ↓
   Soroban VM (on Stellar network)
```

The Solang compiler translates Solidity's surface syntax into the correct Soroban host function calls for storage, hashing, logging, and inter-contract communication.

---

## 3. Development Environment Setup

### Option A: Web IDE (Fastest)

Use the Solang Playground at **https://solang.io**
- No installation required
- Compile, deploy, and interact with contracts directly in browser
- Best for learning and prototyping

### Option B: Local Development

#### Step 1: Install Solang

Download pre-built binaries from the [Solang releases page](https://github.com/hyperledger-solang/solang/releases) or build from source.

#### Step 2: Install Soroban CLI

```bash
# Install Rust first if needed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Soroban CLI (protocol version 21+)
cargo install --locked soroban-cli
```

#### Step 3: Configure Stellar Identity

```bash
# Create a new identity
soroban config identity generate alice

# Fund the account on testnet
soroban config identity fund alice --network testnet
```

### Compile and Deploy Workflow

```bash
# 1. Compile Solidity to Wasm
solang compile counter.sol --target soroban

# 2. Deploy to testnet
soroban contract deploy --wasm counter.wasm --source alice --network testnet
# Returns: CONTRACT_ID (e.g., CBVJO3HVJQWI6Y4NTKFC64ZE4QU5KAZM5OTSJGI4JZIF6F6WWHWXJMVX)

# 3. Initialize the contract (REQUIRED - see Section 10)
soroban contract invoke --id <CONTRACT_ID> --source alice --network testnet -- init

# 4. Invoke functions
soroban contract invoke --id <CONTRACT_ID> --source alice --network testnet -- <function_name>
```

---

## 4. Critical Differences from EVM Solidity

### Summary Table

| Feature | EVM Solidity | Solang for Soroban |
|---------|--------------|-------------------|
| Sender identification | `msg.sender` | `address.requireAuth()` |
| Storage model | Single type | `temporary`, `instance`, `persistent` |
| Constructors | Native support | Use `init()` function |
| Arithmetic | Wrapping (pre-0.8) | Always checked, reverts on overflow/underflow |
| State lifetime | Permanent | TTL-based with archival |
| Function dispatch | ABI selector | Direct function export |
| Integer sizes | 8-bit increments | 32, 64, 128, 256-bit only |
| Low-level calls | `call`, `delegatecall` | Not supported |
| Inline assembly | Supported | Not supported |

### Key Behavioral Changes

1. **No `msg.sender`**: You cannot access caller address implicitly
2. **No wrapping arithmetic**: All overflow/underflow causes revert
3. **No constructors**: Use explicit `init()` function
4. **State expires**: Data must have TTL managed or it gets archived

---

## 5. Storage System

Soroban has three distinct storage types with different characteristics:

### Storage Types

| Type | Lifetime | Archival | Use Case |
|------|----------|----------|----------|
| `temporary` | Single invocation | Auto-deleted | Scratch variables, intermediate calculations |
| `instance` | Contract lifetime | With contract | Contract metadata, admin addresses, config |
| `persistent` | Durable (with TTL) | Can be archived | Token balances, user data, critical state |

### Declaration Syntax

```solidity
contract StorageExample {
    // Temporary: Vanishes after invocation
    uint64 public temporary scratchValue = 0;

    // Instance: Tied to contract instance lifetime
    uint64 public instance configValue = 100;

    // Persistent: Long-term storage (default for state variables)
    uint64 public persistent userBalance = 0;

    // Without keyword: Compiler assigns default based on context
    uint64 public count = 10;
}
```

### Storage Selection Guidelines

```
Use TEMPORARY when:
├── Data is only needed during single transaction
├── Intermediate calculation results
└── Loop counters or temporary buffers

Use INSTANCE when:
├── Contract-wide configuration
├── Admin/owner addresses
├── Pool reserves or global counters
└── Data that should live/die with contract instance

Use PERSISTENT when:
├── User balances and ownership records
├── Historical data that must survive
├── Any data that needs restoration after archival
└── Cross-session state
```

---

## 6. Authorization Model

### The Problem

EVM Solidity uses `msg.sender` for access control:
```solidity
// EVM Pattern - DOES NOT WORK on Soroban
require(msg.sender == admin, "Not authorized");
```

**Soroban does not inject caller address automatically.** There is no `msg.sender`.

### The Solution: `requireAuth()`

Soroban uses explicit authorization where the caller must prove their identity:

```solidity
contract AuthExample {
    address public owner;
    uint64 public counter;

    constructor(address _owner) {
        owner = _owner;
    }

    function increment() public returns (uint64) {
        // Caller must explicitly authorize themselves
        owner.requireAuth();

        counter = counter + 1;
        return counter;
    }

    function adminAction(address caller) public {
        // Any address can be required to auth
        caller.requireAuth();
        // ... perform action
    }
}
```

### How `requireAuth()` Works

1. When called, it triggers a **host function call** to Soroban environment
2. The host verifies that the address has **signed the transaction**
3. If verification fails, the **entire transaction reverts**
4. All replay prevention and signature verification is handled automatically

### Authorization Patterns

```solidity
// Pattern 1: Owner-only function
function ownerOnly() public {
    owner.requireAuth();
    // ... owner-only logic
}

// Pattern 2: Self-authorization (caller authorizes themselves)
function selfAuth(address caller) public {
    caller.requireAuth();
    // ... caller-specific logic
}

// Pattern 3: Multi-party authorization
function multiParty(address party1, address party2) public {
    party1.requireAuth();
    party2.requireAuth();
    // ... requires both parties to authorize
}
```

### When to Use `requireAuth()`

**DO use** when:
- Modifying user-specific data (balances, settings)
- Performing actions that aren't strictly beneficial to the address
- Administrative functions
- Token transfers (from sender's perspective)

**DON'T need** when:
- Read-only access to public data
- Actions that only benefit the address holder
- Querying state without modification

---

## 7. Supported Types

### Primitive Types

| Type | Supported | Notes |
|------|-----------|-------|
| `bool` | Yes | Standard boolean |
| `int8` to `int256` | Yes | Rounded to 32/64/128/256-bit |
| `uint8` to `uint256` | Yes | Rounded to 32/64/128/256-bit |
| `address` | Yes | Soroban address type |
| `string` | Yes | Dynamic strings |
| `bytes` | Yes | Dynamic byte arrays |
| `bytes1` to `bytes32` | Yes | Fixed-size byte arrays |

### Integer Width Auto-Rounding

Soroban only supports 32, 64, 128, and 256-bit integers. Solang automatically rounds:

```solidity
// Source code          → Compiled as
uint8 smallNum;         → uint32
int16 signedSmall;      → int32
uint24 oddSize;         → uint32
int56 medium;           → int64
uint96 larger;          → uint128
int200 veryLarge;       → int256
```

**Compiler flags**:
- Default: Auto-rounds with warnings
- `--strict-soroban-types`: Errors on non-standard widths

### Composite Types

```solidity
// Mappings
mapping(address => uint256) public balances;
mapping(address => mapping(address => uint256)) public allowances;

// Arrays (dynamic)
uint64[] public values;
address[] public participants;

// Fixed-size arrays
uint64[10] public fixedValues;

// Structs
struct User {
    address wallet;
    uint256 balance;
    bool isActive;
}
User public currentUser;

// Enums
enum Status { Pending, Active, Completed }
Status public currentStatus;
```

### Type Conversion

```solidity
// Safe conversions
uint64 small = 100;
uint128 larger = uint128(small);  // OK: widening

// Checked conversions (may revert)
uint128 big = 300;
uint64 smaller = uint64(big);  // OK if value fits, reverts if overflow

// Address to/from bytes32
address addr = address(someBytes32);
bytes32 b = bytes32(addr);
```

---

## 8. Builtin Functions

### Authorization Functions

```solidity
// Require the address to have authorized this call
address.requireAuth();

// Check if address has authorized (returns bool, doesn't revert)
bool authorized = address.hasAuth();  // If supported
```

### TTL Management Functions

```solidity
// Extend TTL for a specific storage variable
// If current TTL < threshold, extend to extend_to ledgers
int64 result = storageVariable.extendTtl(threshold, extend_to);

// Example: Extend 'count' variable TTL
function extendCountTtl() public view returns (int64) {
    return count.extendTtl(1000, 5000);
    // If TTL < 1000 ledgers, extend to 5000 ledgers
}

// Extend TTL for contract instance storage
int64 result = extendInstanceTtl(threshold, extend_to);

// Example: Extend contract instance TTL
function extendContract() public view returns (int64) {
    return extendInstanceTtl(2000, 10000);
}
```

### Hash Functions

```solidity
// Keccak256 hash (available on Soroban)
bytes32 hash = keccak256(abi.encodePacked(data));

// Note: blake2_256 is Polkadot-only, not available on Soroban
```

### Encoding Functions

```solidity
// ABI encoding (for data serialization)
bytes memory encoded = abi.encode(value1, value2);
bytes memory packed = abi.encodePacked(value1, value2);

// ABI decoding
(uint256 a, address b) = abi.decode(data, (uint256, address));
```

### Utility Functions

```solidity
// Type information
uint256 maxVal = type(uint256).max;
uint256 minVal = type(uint256).min;

// Assertions
assert(condition);  // Reverts if false
require(condition, "Error message");  // Reverts with message if false
revert("Error message");  // Always reverts
```

---

## 9. TTL and State Archival

### Understanding State Archival

Soroban uses **state archival** to manage blockchain bloat:

1. All persistent storage has a **Time-To-Live (TTL)** measured in ledgers
2. When TTL expires, data moves to **off-chain archive**
3. Archived data can be **restored** by paying rent
4. **Temporary** storage is deleted, not archived
5. **Instance** storage shares TTL with the contract instance

### TTL Timeline

```
Contract Deployed
       ↓
  TTL = 4095 ledgers (default, ~5.5 hours at 5s/ledger)
       ↓
  ... time passes, TTL decreases ...
       ↓
  TTL = 0 → Data ARCHIVED (persistent) or DELETED (temporary)
       ↓
  Restoration required to access archived data
```

### Managing TTL in Contracts

```solidity
contract TtlManagement {
    uint64 public persistent counter = 0;
    uint64 public persistent importantData = 42;

    // Extend TTL for specific variable
    function extendCounterTtl() public returns (int64) {
        // If TTL < 1000, extend to 5000 ledgers
        return counter.extendTtl(1000, 5000);
    }

    // Extend TTL for all instance storage
    function extendInstanceTtl() public returns (int64) {
        // If TTL < 2000, extend to 10000 ledgers
        return extendInstanceTtl(2000, 10000);
    }

    // Good practice: Extend TTL on every write
    function incrementWithTtl() public returns (uint64) {
        counter += 1;
        counter.extendTtl(100, 5000);  // Maintain healthy TTL
        return counter;
    }
}
```

### TTL Best Practices

```
DO:
├── Extend TTL on every write to important state
├── Use threshold/extend_to pattern for efficiency
├── Set higher TTL for critical data
└── Consider TTL costs in contract design

DON'T:
├── Assume state will persist forever
├── Forget to handle archived state restoration
├── Set TTL higher than needed (costs more)
└── Ignore TTL for long-running contracts
```

### Ledger Time Reference

```
1 ledger ≈ 5 seconds
100 ledgers ≈ 8.3 minutes
1000 ledgers ≈ 1.4 hours
10000 ledgers ≈ 13.9 hours
100000 ledgers ≈ 5.8 days
535679 ledgers ≈ 31 days (CLI max TTL extension)
```

---

## 10. Contract Lifecycle

### The `init()` Function Requirement

**Critical**: Soroban does NOT support traditional constructors. Solang generates an `init()` function that must be called after deployment.

```solidity
contract Counter {
    uint64 public count = 10;

    // This constructor syntax is compiled to init()
    constructor(uint64 initialValue) {
        count = initialValue;
    }

    function increment() public returns (uint64) {
        count += 1;
        return count;
    }
}
```

### Deployment Sequence

```bash
# 1. Deploy the contract (doesn't initialize storage)
CONTRACT_ID=$(soroban contract deploy --wasm counter.wasm --source alice --network testnet)

# 2. MUST call init() to initialize storage
soroban contract invoke --id $CONTRACT_ID --source alice --network testnet -- init

# 3. Now contract is ready for use
soroban contract invoke --id $CONTRACT_ID --source alice --network testnet -- increment
```

### What Happens Without `init()`?

- State variables won't be initialized
- Getter functions may return zero/default values
- Contract behavior will be undefined

### Simple Contract Without Constructor

```solidity
// If no constructor is defined, init() still exists but does minimal setup
contract Simple {
    uint64 public value = 42;  // Initialized via init()

    function getValue() public view returns (uint64) {
        return value;
    }
}
```

---

## 11. Events and Logging

### Event Declaration and Emission

```solidity
contract EventExample {
    // Event declaration
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed account, uint256 amount);
    event StatusChanged(uint64 indexed id, string message);

    function transfer(address to, uint256 amount) public {
        // ... transfer logic ...

        // Emit event
        emit Transfer(msg.sender, to, amount);  // Note: msg.sender may not work
    }

    function deposit(address account, uint256 amount) public {
        account.requireAuth();
        // ... deposit logic ...

        emit Deposit(account, amount);
    }
}
```

### Event Characteristics on Soroban

- Events are stored in the **transaction log**
- **Topics** (indexed parameters) are hashed for efficient filtering
- Maximum of 3 indexed parameters typically
- Events are available for off-chain querying after transaction confirmation
- Use the `soroban events` CLI command to watch for events

### Event Best Practices

```solidity
// Good: Meaningful events with indexed keys for filtering
event TokenTransfer(
    address indexed from,
    address indexed to,
    uint256 amount,
    string memo
);

// Good: Status change events
event ContractPaused(address indexed admin, uint64 timestamp);
event ContractResumed(address indexed admin, uint64 timestamp);

// Consider: Anonymous events (no topic signature hash)
event anonymous Debug(string message);
```

---

## 12. Common Patterns

### Pattern 1: Ownable Contract

```solidity
contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address _owner) {
        owner = _owner;
    }

    modifier onlyOwner() {
        owner.requireAuth();
        _;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
```

### Pattern 2: Simple Token

```solidity
contract SimpleToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public persistent balanceOf;
    mapping(address => mapping(address => uint256)) public persistent allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply;
        // Note: Can't use msg.sender, need to pass owner address
    }

    function transfer(address from, address to, uint256 amount) public returns (bool) {
        from.requireAuth();

        require(balanceOf[from] >= amount, "Insufficient balance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        // Extend TTL for modified balances
        balanceOf[from].extendTtl(100, 5000);
        balanceOf[to].extendTtl(100, 5000);

        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address owner, address spender, uint256 amount) public returns (bool) {
        owner.requireAuth();

        allowance[owner][spender] = amount;
        allowance[owner][spender].extendTtl(100, 5000);

        emit Approval(owner, spender, amount);
        return true;
    }
}
```

### Pattern 3: Counter with TTL Management

```solidity
contract Counter {
    uint64 public persistent count = 0;
    address public instance admin;

    event CountIncremented(uint64 newValue);
    event CountDecremented(uint64 newValue);

    constructor(address _admin) {
        admin = _admin;
    }

    function increment() public returns (uint64) {
        count += 1;
        count.extendTtl(100, 5000);
        emit CountIncremented(count);
        return count;
    }

    function decrement() public returns (uint64) {
        require(count > 0, "Counter underflow");
        count -= 1;
        count.extendTtl(100, 5000);
        emit CountDecremented(count);
        return count;
    }

    function reset() public {
        admin.requireAuth();
        count = 0;
        count.extendTtl(100, 5000);
    }

    function extendTtl() public returns (int64) {
        return count.extendTtl(1000, 10000);
    }
}
```

### Pattern 4: Multi-Signature Requirement

```solidity
contract MultiSig {
    address public persistent signer1;
    address public persistent signer2;
    uint256 public persistent pendingAmount;
    bool public persistent sig1Approved;
    bool public persistent sig2Approved;

    constructor(address _signer1, address _signer2) {
        signer1 = _signer1;
        signer2 = _signer2;
    }

    function proposeTransfer(uint256 amount) public {
        signer1.requireAuth();  // Only signer1 can propose
        pendingAmount = amount;
        sig1Approved = true;
        sig2Approved = false;
    }

    function approveTransfer() public {
        signer2.requireAuth();  // Only signer2 can approve
        require(sig1Approved, "No pending transfer");
        sig2Approved = true;
    }

    function executeTransfer() public returns (uint256) {
        require(sig1Approved && sig2Approved, "Not fully approved");
        uint256 amount = pendingAmount;

        // Reset state
        pendingAmount = 0;
        sig1Approved = false;
        sig2Approved = false;

        // ... execute transfer logic ...

        return amount;
    }
}
```

### Pattern 5: Pausable Contract

```solidity
contract Pausable {
    address public instance admin;
    bool public instance paused;

    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Contract is not paused");
        _;
    }

    constructor(address _admin) {
        admin = _admin;
        paused = false;
    }

    function pause() public whenNotPaused {
        admin.requireAuth();
        paused = true;
        emit Paused(admin);
    }

    function unpause() public whenPaused {
        admin.requireAuth();
        paused = false;
        emit Unpaused(admin);
    }

    function protectedFunction() public whenNotPaused returns (bool) {
        // ... logic that only works when not paused ...
        return true;
    }
}
```

---

## 13. Porting EVM Contracts

### Porting Checklist

```
□ Replace msg.sender with explicit address parameter + requireAuth()
□ Add storage type keywords (temporary, instance, persistent)
□ Replace constructor logic with init() awareness
□ Remove low-level calls (call, delegatecall, staticcall)
□ Remove inline assembly
□ Add TTL management for persistent storage
□ Handle checked arithmetic (no wrapping)
□ Adjust integer sizes to 32/64/128/256-bit boundaries
□ Test for underflow/overflow behavior
□ Remove block.timestamp if used (check Soroban equivalents)
□ Remove block.number if used (check ledger sequence alternatives)
```

### Common Transformations

#### msg.sender → requireAuth()

```solidity
// BEFORE (EVM)
function withdraw(uint256 amount) public {
    require(balances[msg.sender] >= amount);
    balances[msg.sender] -= amount;
    payable(msg.sender).transfer(amount);
}

// AFTER (Soroban)
function withdraw(address caller, uint256 amount) public {
    caller.requireAuth();
    require(balances[caller] >= amount, "Insufficient balance");
    balances[caller] -= amount;
    // Note: Native token transfer is different on Soroban
}
```

#### onlyOwner modifier

```solidity
// BEFORE (EVM)
modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
}

// AFTER (Soroban)
modifier onlyOwner() {
    owner.requireAuth();
    _;
}
```

#### SafeMath → Built-in

```solidity
// BEFORE (EVM pre-0.8)
using SafeMath for uint256;
function add(uint256 a, uint256 b) public pure returns (uint256) {
    return a.add(b);
}

// AFTER (Soroban) - SafeMath not needed, arithmetic is checked
function add(uint256 a, uint256 b) public pure returns (uint256) {
    return a + b;  // Automatically reverts on overflow
}
```

#### Storage with TTL

```solidity
// BEFORE (EVM)
mapping(address => uint256) public balances;

function setBalance(address user, uint256 amount) public {
    balances[user] = amount;
}

// AFTER (Soroban)
mapping(address => uint256) public persistent balances;

function setBalance(address user, uint256 amount) public {
    balances[user] = amount;
    balances[user].extendTtl(100, 5000);  // Maintain TTL
}
```

---

## 14. Limitations and Unsupported Features

### Not Supported on Soroban

| Feature | Status | Alternative |
|---------|--------|-------------|
| `msg.sender` | Not available | Use `address.requireAuth()` |
| `msg.value` | Not available | Explicit token transfer logic |
| `block.timestamp` | Not available | Use ledger sequence or oracle |
| `block.number` | Not available | Use ledger sequence |
| `call()` | Not supported | Interface-based calls |
| `delegatecall()` | Not supported | Redesign pattern |
| `staticcall()` | Not supported | Direct function calls |
| Inline assembly | Not supported | Use host functions |
| `selfdestruct` | Not supported | Use admin disable pattern |
| `receive()` fallback | Not supported | Explicit receive functions |
| `fallback()` | Not supported | Named functions only |
| Create/Create2 | Not supported | Deploy separately |
| Try/catch for external calls | Limited | Check return values |

### Integer Width Restrictions

Soroban only natively supports:
- `int32` / `uint32`
- `int64` / `uint64`
- `int128` / `uint128`
- `int256` / `uint256`

Other widths are automatically rounded up with compiler warnings.

### Constructor Limitations

- No constructor parameters at deployment time
- Must use `init()` function pattern
- Initialize with separate transaction after deployment

### Gas/Resource Model

- Soroban uses **resource accounting** instead of EVM gas
- Costs are calculated differently
- No `gasleft()` equivalent
- Resource limits enforced by host

---

## 15. Complete Code Examples

### Example 1: Basic Counter

```solidity
pragma solidity 0;

contract Counter {
    uint64 public persistent count = 0;

    function increment() public returns (uint64) {
        count += 1;
        count.extendTtl(100, 5000);
        return count;
    }

    function decrement() public returns (uint64) {
        require(count > 0, "Cannot decrement below zero");
        count -= 1;
        count.extendTtl(100, 5000);
        return count;
    }

    function get() public view returns (uint64) {
        return count;
    }

    function reset() public {
        count = 0;
        count.extendTtl(100, 5000);
    }
}
```

### Example 2: Token with Full Features

```solidity
pragma solidity 0;

contract StellarToken {
    // Instance storage - tied to contract lifetime
    string public instance name;
    string public instance symbol;
    uint8 public instance decimals;
    address public instance admin;
    bool public instance paused;

    // Persistent storage - survives archival
    uint256 public persistent totalSupply;
    mapping(address => uint256) public persistent balances;
    mapping(address => mapping(address => uint256)) public persistent allowances;

    // Events
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event Paused();
    event Unpaused();

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _admin
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        admin = _admin;
        paused = false;
    }

    modifier whenNotPaused() {
        require(!paused, "Token is paused");
        _;
    }

    modifier onlyAdmin() {
        admin.requireAuth();
        _;
    }

    function mint(address to, uint256 amount) public onlyAdmin whenNotPaused {
        totalSupply += amount;
        balances[to] += amount;

        // Extend TTL for modified storage
        balances[to].extendTtl(100, 10000);

        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) public whenNotPaused {
        from.requireAuth();

        require(balances[from] >= amount, "Insufficient balance");

        balances[from] -= amount;
        totalSupply -= amount;

        balances[from].extendTtl(100, 10000);

        emit Burn(from, amount);
        emit Transfer(from, address(0), amount);
    }

    function transfer(address from, address to, uint256 amount) public whenNotPaused returns (bool) {
        from.requireAuth();

        require(balances[from] >= amount, "Insufficient balance");
        require(to != address(0), "Invalid recipient");

        balances[from] -= amount;
        balances[to] += amount;

        // Extend TTL for both balances
        balances[from].extendTtl(100, 10000);
        balances[to].extendTtl(100, 10000);

        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address owner, address spender, uint256 amount) public returns (bool) {
        owner.requireAuth();

        allowances[owner][spender] = amount;
        allowances[owner][spender].extendTtl(100, 10000);

        emit Approval(owner, spender, amount);
        return true;
    }

    function transferFrom(
        address spender,
        address from,
        address to,
        uint256 amount
    ) public whenNotPaused returns (bool) {
        spender.requireAuth();

        require(allowances[from][spender] >= amount, "Insufficient allowance");
        require(balances[from] >= amount, "Insufficient balance");

        allowances[from][spender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;

        // Extend TTL for all modified storage
        allowances[from][spender].extendTtl(100, 10000);
        balances[from].extendTtl(100, 10000);
        balances[to].extendTtl(100, 10000);

        emit Transfer(from, to, amount);
        return true;
    }

    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return allowances[owner][spender];
    }

    function pause() public onlyAdmin {
        paused = true;
        emit Paused();
    }

    function unpause() public onlyAdmin {
        paused = false;
        emit Unpaused();
    }

    function extendContractTtl() public returns (int64) {
        return extendInstanceTtl(1000, 50000);
    }
}
```

### Example 3: Voting Contract

```solidity
pragma solidity 0;

contract Voting {
    struct Proposal {
        string description;
        uint64 yesVotes;
        uint64 noVotes;
        uint64 deadline;
        bool executed;
    }

    address public instance admin;
    uint64 public persistent proposalCount;
    mapping(uint64 => Proposal) public persistent proposals;
    mapping(uint64 => mapping(address => bool)) public persistent hasVoted;

    event ProposalCreated(uint64 indexed id, string description, uint64 deadline);
    event Voted(uint64 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint64 indexed id, bool passed);

    constructor(address _admin) {
        admin = _admin;
        proposalCount = 0;
    }

    function createProposal(string memory description, uint64 duration) public returns (uint64) {
        admin.requireAuth();

        uint64 id = proposalCount;
        proposalCount += 1;

        proposals[id] = Proposal({
            description: description,
            yesVotes: 0,
            noVotes: 0,
            deadline: duration,  // Simplified: would use ledger sequence in production
            executed: false
        });

        proposals[id].extendTtl(100, 10000);

        emit ProposalCreated(id, description, duration);
        return id;
    }

    function vote(address voter, uint64 proposalId, bool support) public {
        voter.requireAuth();

        require(proposalId < proposalCount, "Proposal does not exist");
        require(!hasVoted[proposalId][voter], "Already voted");
        require(!proposals[proposalId].executed, "Proposal already executed");

        hasVoted[proposalId][voter] = true;

        if (support) {
            proposals[proposalId].yesVotes += 1;
        } else {
            proposals[proposalId].noVotes += 1;
        }

        // Extend TTL for modified storage
        hasVoted[proposalId][voter].extendTtl(100, 10000);
        proposals[proposalId].extendTtl(100, 10000);

        emit Voted(proposalId, voter, support);
    }

    function executeProposal(uint64 proposalId) public returns (bool) {
        admin.requireAuth();

        require(proposalId < proposalCount, "Proposal does not exist");
        require(!proposals[proposalId].executed, "Already executed");

        proposals[proposalId].executed = true;
        bool passed = proposals[proposalId].yesVotes > proposals[proposalId].noVotes;

        proposals[proposalId].extendTtl(100, 10000);

        emit ProposalExecuted(proposalId, passed);
        return passed;
    }

    function getProposal(uint64 proposalId) public view returns (
        string memory description,
        uint64 yesVotes,
        uint64 noVotes,
        bool executed
    ) {
        require(proposalId < proposalCount, "Proposal does not exist");
        Proposal storage p = proposals[proposalId];
        return (p.description, p.yesVotes, p.noVotes, p.executed);
    }
}
```

---

## 16. Troubleshooting

### Common Errors and Solutions

#### Error: "Cannot find msg.sender"
```
Problem: Using msg.sender which doesn't exist on Soroban
Solution: Pass address as parameter and use requireAuth()

// Wrong
function doSomething() public {
    require(msg.sender == owner);
}

// Correct
function doSomething() public {
    owner.requireAuth();
}
```

#### Error: "Arithmetic underflow/overflow"
```
Problem: Checked arithmetic caught an overflow/underflow
Solution: Add explicit bounds checking before operations

// Wrong
function decrement() public {
    count -= 1;  // Fails if count is 0
}

// Correct
function decrement() public {
    require(count > 0, "Cannot decrement below zero");
    count -= 1;
}
```

#### Error: "Contract not initialized"
```
Problem: Forgot to call init() after deployment
Solution: Always call init() after deploying

$ soroban contract invoke --id <CONTRACT_ID> --source alice --network testnet -- init
```

#### Error: "State not found / archived"
```
Problem: Storage TTL expired and data was archived
Solution: Restore the data or extend TTL proactively

// Prevention: Extend TTL on writes
function updateValue(uint64 newValue) public {
    value = newValue;
    value.extendTtl(100, 5000);
}
```

#### Error: "Authorization failed"
```
Problem: requireAuth() called but transaction not properly signed
Solution: Ensure correct account is signing the transaction

$ soroban contract invoke --id <CONTRACT_ID> --source <CORRECT_ACCOUNT> ...
```

#### Warning: "Integer width rounded"
```
Problem: Using non-standard integer width (e.g., uint48)
Solution: Use standard widths (32, 64, 128, 256) or accept auto-rounding

// Compiler rounds uint48 → uint64 automatically
// Use --strict-soroban-types to treat as error
```

### Debugging Tips

1. **Use the Solang Playground** (https://solang.io) for quick testing
2. **Check Soroban events** with `soroban events` CLI command
3. **Verify initialization** by calling getter functions after init()
4. **Monitor TTL** and extend before expiration
5. **Test on testnet** before mainnet deployment

---

## 17. Quick Reference Cheat Sheet

### Pragma and Contract Structure
```solidity
pragma solidity 0;

contract MyContract {
    // State variables
    uint64 public persistent myValue;
    address public instance owner;

    // Constructor (becomes init())
    constructor(address _owner) {
        owner = _owner;
    }

    // Functions
    function myFunction() public returns (uint64) {
        owner.requireAuth();
        return myValue;
    }
}
```

### Storage Keywords
```solidity
uint64 public temporary scratch;      // Deleted after invocation
uint64 public instance config;        // Lives with contract instance
uint64 public persistent balance;     // Long-term, can be archived
```

### Authorization
```solidity
address.requireAuth();                // Require address to authorize
```

### TTL Management
```solidity
variable.extendTtl(threshold, extend_to);
extendInstanceTtl(threshold, extend_to);
```

### Compilation
```bash
solang compile contract.sol --target soroban
```

### Deployment
```bash
soroban contract deploy --wasm contract.wasm --source alice --network testnet
soroban contract invoke --id <ID> --source alice --network testnet -- init
soroban contract invoke --id <ID> --source alice --network testnet -- functionName
```

### Supported Types Quick Reference
```
Integers:   uint32, uint64, uint128, uint256, int32, int64, int128, int256
Boolean:    bool
Address:    address
String:     string
Bytes:      bytes, bytes1-bytes32
Arrays:     uint64[], address[]
Mappings:   mapping(address => uint256)
Structs:    struct { ... }
```

---

## Sources and References

- [Solang GitHub Repository](https://github.com/hyperledger-solang/solang)
- [Solang Soroban Documentation](https://solang.readthedocs.io/en/latest/targets/soroban.html)
- [Solang Builtin Functions](https://solang.readthedocs.io/en/latest/language/builtins.html)
- [Stellar Developer Docs](https://developers.stellar.org/docs/tools/sdks/contract-sdks)
- [Soroban Authorization](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
- [Soroban State Archival](https://developers.stellar.org/docs/learn/encyclopedia/storage/state-archival)
- [Soroban Events](https://soroban.stellar.org/docs/soroban-internals/events)
- [Solang Playground Web IDE](https://solang.io)

---

*Document Version: 1.0 | Last Updated: January 2026 | Status: Pre-Alpha Reference*
