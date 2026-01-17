# ASTRAEUS — Dev B Async Checklist (Interleaved with Dev A)

> **You are Dev B.** This document provides your complete task checklist, interleaved with Dev A's work.
> Dev A handles execution logic, state roots, and Proof of Money (PoM) in Soroban/Solang.
> Dev B (you) handles Stellar L1 treasury, settlement, multisig, and FX.

---

## DEV A PROGRESS TRACKER

### ✅ PHASE 0: INTERFACE FREEZE (COMPLETED)
- [x] **interfaces.md created and frozen** - All interface specifications locked
  - State Root Format: SHA-256, balance/withdrawal leaf formats, Merkle tree construction
  - PoM Delta Schema: Asset ID format, JSON structure, computation rules
  - Memo Format: `first_28_bytes(SHA256(subnet_id || block_number))`
  - Note: Using keccak256 in Solang implementation (Solang limitation, documented)
- [x] **Documentation**: Complete interface spec with examples and Solang implementation notes
- [x] **File**: `agent/interfaces.md` (566 lines, version 1.0, FROZEN)

### ✅ PHASE 1: EXECUTION CORE (COMPLETED)
- [x] **SubnetFactory.sol** - Subnet creation and management
  - `create_subnet()`: Validates auditors (>=3), threshold (>=floor(n/2)+1), assets (non-empty)
  - `register_treasury()`: Admin-only treasury registration and subnet activation
  - `get_subnet()`: View function for subnet configuration
  - `is_asset_whitelisted()`: Asset whitelist checking
  - Events: `SubnetCreated`, `TreasuryRegistered`
  - TTL management on all write operations
  - File: `contracts/SubnetFactory.sol` (200+ lines)

- [x] **ExecutionCore.sol** - Financial operations and state management
  - `credit()`: Credit balance to user (with subnet/asset validation)
  - `debit()`: Debit balance from user (with negative balance prevention)
  - `transfer()`: Atomic transfer between users
  - `request_withdrawal()`: Create withdrawal, debit balance, add to queue, increment nonce
  - View functions: `get_balance()`, `get_withdrawal_queue()`, `get_nonce()`
  - Storage: Nested mappings for balances, arrays for withdrawal queues, nonces per subnet
  - Events: `Credited`, `Debited`, `Transferred`, `WithdrawalRequested`
  - TTL management on all write operations
  - File: `contracts/ExecutionCore.sol` (400+ lines)

- [x] **ISubnetFactory.sol** - Interface for cross-contract calls
  - Interface definition for SubnetFactory contract
  - Used by ExecutionCore for subnet validation
  - File: `contracts/interfaces/ISubnetFactory.sol`

- [x] **Withdrawal Queue Format Documentation**
  - Complete specification of withdrawal queue JSON format for Arko
  - Field descriptions, examples, integration notes
  - File: `contracts/WITHDRAWAL_QUEUE_FORMAT.md`

- [x] **Test Suite** - Comprehensive test coverage
  - `TestSubnetFactory.sol`: 6 tests covering all SubnetFactory functionality
  - `TestExecutionCore.sol`: 8 tests covering all ExecutionCore functionality
  - Test compilation script: `contracts/test/compile_tests.sh`
  - Test documentation: `contracts/test/README.md`, `contracts/test/TEST_SUMMARY.md`
  - Files: `contracts/test/TestSubnetFactory.sol`, `contracts/test/TestExecutionCore.sol`

### ✅ PHASE 2: STATE ROOT COMPUTATION (COMPLETED)
- [x] **State root computation function** - `compute_state_root()` implemented
- [x] **Merkle tree construction** - Separate trees for balances and withdrawals, deterministic sorting
- [x] **Golden test vectors** - Documented in `GOLDEN_TEST_VECTORS.md` for Arko verification
- [x] **State root spec locked** - Format defined in `interfaces.md`
- [x] **File**: `contracts/ExecutionCore.sol` (Phase 3 section)
- [x] **Tests**: `contracts/test/TestPhase3Phase4.sol` (4 Phase 3 tests)

### ✅ PHASE 3: PROOF OF MONEY (COMPLETED)
- [x] **PoM implementation** - All functions implemented:
  - `compute_net_outflow()` - Aggregates withdrawals by asset
  - `check_solvency()` - Verifies treasury can cover withdrawals
  - `check_constructibility()` - Validates withdrawal destinations and formats
  - `check_authorization()` - Verifies auditors can sign treasury
- [x] **`pom_validate()`** - Complete PoM validation with `PomResult` enum (Ok, Insolvent, NonConstructible, Unauthorized)
- [x] **Unit tests** - 9 Phase 4 tests covering all failure modes
- [x] **Documentation**: `POM_EXAMPLES.md` with failing cases for Arko
- [x] **File**: `contracts/ExecutionCore.sol` (Phase 4 section)
- [x] **Tests**: `contracts/test/TestPhase3Phase4.sol` (9 Phase 4 tests)

### ✅ PHASE 4: COMMITMENT CONTRACT (COMPLETED)
- [x] **`commit_state()` function** - Complete implementation with:
  - Block number monotonicity enforcement
  - Auditor signature verification (threshold check)
  - PoM validation (reverts if PoM fails)
  - Commit storage: `COMMITS[subnet_id][block_number] = state_root`
  - `StateCommitted` event emission
- [x] **State commits** - Accepted/rejected correctly based on all validation rules
- [x] **View functions**: `get_commit()`, `get_last_committed_block()`
- [x] **File**: `contracts/ExecutionCore.sol` (Phase 5 section)
- [x] **Tests**: `contracts/test/TestPhase5.sol` (6 comprehensive tests)

### 📋 PHASE 5: EDGE CASES (PENDING)
- [ ] Withdrawal queue edge cases
- [ ] Duplicate prevention, max queue bounds
- [ ] Negative balance impossible proofs

---

## PHASE 0: PRE-WORK (Both, Together)

### JOINT TASK: Lock Interfaces (interfaces.md is IMMUTABLE after this)

**Status:** ✅ **COMPLETED BY DEV A**

**Dev A has completed:**
- [x] Created `interfaces.md` with all interface specifications
- [x] Defined TreasurySnapshot JSON schema (Section 2.3)
- [x] Defined PoM delta schema: `{ "asset_id_hex": "i128_string" }` (Section 2)
- [x] Defined memo format: `first_28_bytes(SHA256(subnet_id || block_number))` (Section 3)
- [x] Documented asset canonical encoding: `asset_id = SHA256(asset_code || issuer)` (Section 2.2)
- [x] Note: Solang uses keccak256 (documented limitation, will use SHA-256 via host functions or implementation)

**Your participation:** ✅ **COMPLETED**
- [x] Review `agent/interfaces.md` and confirm it matches your expectations
- [x] Verify TreasurySnapshot schema works with your Horizon API responses
- [x] Confirm PoM delta format is usable for your settlement planner
- [x] Verify memo format is compatible with Stellar XDR (28-byte MemoHash)

**Deliverable:** `interfaces.md` frozen. No changes allowed after this. ✅ **DONE**

**Golden Test Vectors Generated (for Dev A cross-verification):**
```
XLM Asset ID:
  asset_code: "XLM"
  issuer: "NATIVE"
  asset_id: 1a630f439abc232a195107111ae6a7c884c5794ca3ec3d7e55cc7230d56b8254

Sample Memo:
  subnet_id: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  block_number: 42
  memo: 3b7a9a04030d34947cfdd00389736175b9c9e40f2d299ddcf7cd4052
```

---

## PHASE 1: INFRASTRUCTURE SETUP

### Dev A Status: ✅ **COMPLETED**

**Dev A has delivered:**
- ✅ `SubnetFactory.sol` - Complete subnet creation and management
- ✅ `ExecutionCore.sol` - Complete financial operations (credit, debit, transfer, request_withdrawal)
- ✅ Comprehensive test suite (14 tests total)
- ✅ Withdrawal queue format documentation for you
- ✅ All contracts use proper Solang/Soroban patterns (persistent/instance storage, TTL management)
- ✅ No PoM yet, NO Stellar dependency (as planned)

**Key files for you:**
- `contracts/ExecutionCore.sol` - Main execution contract
- `contracts/WITHDRAWAL_QUEUE_FORMAT.md` - **READ THIS** - Exact format of withdrawal queue you'll receive
- `contracts/test/TestExecutionCore.sol` - See how withdrawal queue is structured

**Withdrawal Queue Format (for your reference):**
```json
[
  {
    "withdrawal_id": "0x...",
    "user_id": "0x...",
    "asset_code": "USDC",
    "issuer": "0x...",
    "amount": "1000000",
    "destination": "0x..."
  }
]
```
See `contracts/WITHDRAWAL_QUEUE_FORMAT.md` for complete specification.

### DEV B STATUS: ✅ **PHASE 1-4 COMPLETED**

**Dev B has delivered:**
- ✅ Complete TypeScript project structure (`dev-b/`)
- ✅ `VaultManager` class with full functionality
- ✅ `TreasurySnapshotService` for PoM validation
- ✅ SHA-256 crypto utilities matching interfaces.md
- ✅ PoM Delta computation (`computeNetOutflow`, `verifyDeltaMatch`)
- ✅ `SettlementPlanner` class (transaction building, batching, path payments)
- ✅ `MultisigOrchestrator` class (signature collection, PoM verification, submission)
- ✅ `ReplayProtectionService` (memo-based deduplication, settlement tracking)
- ✅ `SettlementExecutor` class (end-to-end settlement orchestration)
- ✅ 63 passing tests
- ✅ Golden test vectors for cross-verification with Dev A

**Files created:**
- `dev-b/src/interfaces/types.ts` - Shared type definitions (TreasurySnapshot, WithdrawalIntent, etc.)
- `dev-b/src/interfaces/crypto.ts` - SHA-256 hashing (computeAssetId, computeMemo, computeBalanceLeaf, etc.)
- `dev-b/src/vault/vault_manager.ts` - Vault creation and management
- `dev-b/src/snapshot/treasury_snapshot.ts` - Treasury snapshot service
- `dev-b/src/settlement/pom_delta.ts` - PoM delta computation and verification
- `dev-b/src/settlement/settlement_planner.ts` - Settlement plan building
- `dev-b/src/settlement/multisig_orchestrator.ts` - Signature collection and submission
- `dev-b/src/settlement/settlement_executor.ts` - End-to-end settlement orchestration
- `dev-b/src/safety/replay_protection.ts` - Memo-based replay protection
- `dev-b/tests/crypto.test.ts` - 29 crypto tests
- `dev-b/tests/snapshot.test.ts` - 15 snapshot tests
- `dev-b/tests/settlement.test.ts` - 19 settlement tests

#### 1.1 Stellar Testnet Environment Setup ✅
- [x] **Stellar SDK installed** via npm (`@stellar/stellar-sdk@12.3.0`)
- [x] **Project configured** with TypeScript, Jest, proper build setup

#### 1.2 Vault Creation Tooling (`vault_manager.ts`) ✅
- [x] **`createVault()` function** - Full implementation
  - Generates keypair, funds via friendbot (testnet) or funder (mainnet)
  - Adds auditors as signers with weight = 1
  - Sets thresholds (low=0, med=threshold, high=threshold)
  - Removes master key
  - Returns vault address and secret

- [x] **`createVaultWithTrustlines()` function** - One-step vault setup
  - Adds trustlines BEFORE removing master key
  - Full atomic setup for production use

- [x] **`addTrustline()` helper** - For existing vaults

- [x] **`rotateSigner()` function** - Signer rotation with proper validation

- [x] **`getVaultConfig()` function** - Read vault state from Stellar

- [x] **`verifyVaultConfig()` function** - Verify vault matches expected config

#### 1.3 Treasury Snapshot Service ✅
- [x] **`getTreasurySnapshot()`** - Returns balances (by asset_id), signers, threshold
- [x] **`getTreasurySnapshotJSON()`** - JSON-serializable version for API
- [x] **`checkSolvency()`** - Verify treasury can cover PoM delta
- [x] **`canMeetThreshold()`** - Verify signers can meet threshold

#### 1.4 Crypto Utilities ✅
- [x] **`computeAssetId()`** - SHA256(asset_code || issuer) per interfaces.md
- [x] **`computeMemo()`** - first_28_bytes(SHA256(subnet_id || block_number))
- [x] **`computeBalanceLeaf()`** - For Merkle tree verification
- [x] **`computeWithdrawalLeaf()`** - For Merkle tree verification
- [x] All conversions: Stellar keys ↔ raw bytes ↔ hex

#### 1.5 Deliverable (End of Phase 1) ✅
- [x] Complete vault management tooling ready for testnet deployment
- [x] Treasury snapshot service ready for PoM integration
- [x] All interfaces match frozen spec in interfaces.md
- [x] Golden test vectors documented for Dev A cross-verification

---

## PHASE 2: TREASURY SNAPSHOT SERVICE

### Dev A Status: ✅ **COMPLETED**

**Dev A has delivered:**
- ✅ `compute_state_root()` - Complete implementation with Merkle tree construction
- ✅ Golden test vectors documented in `GOLDEN_TEST_VECTORS.md`
- ✅ State root spec locked in `interfaces.md`
- ✅ Deterministic computation with explicit sorting

### DEV B STATUS: ✅ **COMPLETED** (as part of Phase 1)

Treasury Snapshot Service was implemented in Phase 1. All tasks complete.

#### 2.1 Treasury Snapshot Service (`treasury_snapshot.ts`)

- [x] **Define TreasurySnapshot type**
  ```typescript
  interface Asset {
    code: string;        // 1-12 alphanumeric
    issuer: string;      // G... address or "native" for XLM
  }

  interface TreasurySnapshot {
    balances: Map<string, bigint>;  // asset_id_hex -> stroops
    signers: string[];              // Ed25519 pubkeys (G... addresses)
    threshold: number;
  }
  ```

- [x] **Implement `computeAssetId()` helper**
  ```typescript
  function computeAssetId(assetCode: string, issuer: string): string {
    // issuer = "NATIVE" for XLM, or 32-byte Ed25519 pubkey for issued assets
    // Return: SHA256(asset_code_utf8_null_terminated || issuer_bytes) as hex
  }
  ```

  **Critical:** Must use SHA-256 (not keccak256) to match Dev A's computation

- [x] **Implement `getTreasurySnapshot()`**
  ```typescript
  async function getTreasurySnapshot(
    vaultAddress: string
  ): Promise<TreasurySnapshot>
  ```

  **Steps:**
  1. Fetch account from Horizon: `GET /accounts/{vaultAddress}`
  2. Parse `balances` array from response
  3. For each balance:
     - If `asset_type === "native"`: asset is XLM
     - Else: extract `asset_code` and `asset_issuer`
     - Compute `asset_id = SHA256(asset_code || issuer)`
     - Store `asset_id_hex -> balance` (in stroops)
  4. Extract `signers` array (filter by weight > 0)
  5. Extract thresholds (use `med_threshold`)
  6. Return snapshot

- [x] **Implement asset normalization**
  ```typescript
  function normalizeAsset(horizonBalance: any): { code: string; issuer: string } {
    if (horizonBalance.asset_type === "native") {
      return { code: "XLM", issuer: "NATIVE" };
    }
    return {
      code: horizonBalance.asset_code,
      issuer: horizonBalance.asset_issuer  // Convert to raw bytes if needed
    };
  }
  ```

- [x] **Add error handling:**
  - [x] Horizon timeout -> retry with backoff
  - [x] Account not found -> throw clear error
  - [x] Malformed asset -> log and skip

#### 2.2 Integration Point
- [x] **Expose snapshot as API endpoint or module export**
  ```typescript
  // Option A: REST API
  app.get('/snapshot/:subnetId', async (req, res) => {
    const vaultAddress = await getVaultForSubnet(req.params.subnetId);
    const snapshot = await getTreasurySnapshot(vaultAddress);
    res.json(snapshot);
  });

  // Option B: Direct export for Dev A to import
  export { getTreasurySnapshot, TreasurySnapshot };
  ```

#### 2.3 Deliverable (End of Phase 2) ✅
- [x] `getTreasurySnapshot()` returns correct JSON matching interface spec
- [x] Dev A can call it locally to test PoM logic
- [x] Snapshot verified against actual Stellar account state

---

## PHASE 3: SETTLEMENT PLANNER (Core Integration Day)

### Dev A Status: ✅ **COMPLETED**

**Dev A has delivered:**
- ✅ Complete PoM implementation: `compute_net_outflow()`, `check_solvency()`, `check_constructibility()`, `check_authorization()`
- ✅ `pom_validate()` with `PomResult` enum (Ok, Insolvent, NonConstructible, Unauthorized)
- ✅ Comprehensive unit tests (9 tests) covering all failure modes
- ✅ PoM examples document for Arko with failing cases

### DEV B STATUS: ✅ **PHASE 3 COMPLETED**

All Settlement Planner tasks complete. Implementation in `settlement_planner.ts` and `pom_delta.ts`.

#### 3.1 Settlement Planner (`settlement_planner.ts`)

- [x] **Define withdrawal intent type (matches Dev A's output)**
  ```typescript
  interface WithdrawalIntent {
    withdrawal_id: string;    // bytes32 hex
    user_id: string;          // bytes32 hex
    asset_code: string;
    issuer: string;           // bytes32 hex or "NATIVE"
    amount: bigint;           // stroops (int128)
    destination: string;      // Ed25519 pubkey (G... address)
  }
  ```

- [x] **Implement `computeMemo()`**
  ```typescript
  function computeMemo(subnetId: string, blockNumber: bigint): Buffer {
    // subnetId: 32 bytes (hex string, 64 chars)
    // blockNumber: uint64 big-endian (8 bytes)
    const input = Buffer.concat([
      Buffer.from(subnetId, 'hex'),  // 32 bytes
      bigintToBuffer(blockNumber, 8) // 8 bytes big-endian
    ]);
    const hash = sha256(input);      // 32 bytes
    return hash.slice(0, 28);        // First 28 bytes
  }
  ```

- [x] **Implement `buildSettlementPlan()`**
  ```typescript
  interface SettlementPlan {
    subnetId: string;
    blockNumber: bigint;
    memo: Buffer;           // 28 bytes
    transactions: StellarTx[];
  }

  function buildSettlementPlan(
    subnetId: string,
    blockNumber: bigint,
    withdrawals: WithdrawalIntent[]
  ): SettlementPlan
  ```

  **Steps:**
  1. Compute memo = `first_28_bytes(SHA256(subnetId || blockNumber))`
  2. Group withdrawals by asset (asset_id)
  3. Sort withdrawals deterministically within each group (by withdrawal_id)
  4. For each group, build payment transactions
  5. Return plan with all transactions

- [x] **Implement `buildPaymentTx()`**
  ```typescript
  function buildPaymentTx(
    vault: string,
    destination: string,
    asset: Asset,
    amount: bigint,
    memo: Buffer
  ): Transaction
  ```

  **Transaction structure:**
  ```typescript
  const tx = new TransactionBuilder(vaultAccount, { fee: "100" })
    .addOperation(Operation.payment({
      destination: destination,
      asset: asset,
      amount: stroopsToDecimal(amount)
    }))
    .addMemo(Memo.hash(memo))  // 28-byte memo as MemoHash
    .setTimeout(300)
    .build();
  ```

- [x] **Implement `buildPathPaymentTx()` for FX**
  ```typescript
  function buildPathPaymentTx(
    vault: string,
    destination: string,
    sendAsset: Asset,
    sendMax: bigint,
    destAsset: Asset,
    destAmount: bigint,
    memo: Buffer
  ): Transaction
  ```

  Uses `PathPaymentStrictReceive`:
  - Destination receives exact `destAmount` of `destAsset`
  - Vault sends at most `sendMax` of `sendAsset`
  - No internal price logic — relies on Stellar DEX

- [x] **Implement batching strategy**
  ```typescript
  function batchWithdrawals(
    withdrawals: WithdrawalIntent[],
    maxOpsPerTx: number = 100
  ): WithdrawalIntent[][]
  ```

  Rules:
  - Max 100 operations per Stellar transaction
  - Group by asset for efficiency
  - Deterministic ordering (sort by withdrawal_id)

#### 3.2 Deliverable (End of Phase 3) ✅
- [x] XDR transactions built (not submitted yet)
- [x] Transactions match PoM delta exactly
- [x] Memo correctly computed and attached
- [x] Unit tests: plan matches expected output for sample withdrawals

---

## PHASE 4: COMMITMENT LINK & REAL MONEY MOVEMENT

### Dev A Status: ✅ **COMPLETED**

**Dev A has delivered:**
- ✅ `commit_state()` - Complete implementation with:
  - Block number monotonicity enforcement
  - Auditor signature verification (threshold check)
  - PoM validation (reverts if PoM fails)
  - Commit storage and `StateCommitted` event
- ✅ State commits accepted/rejected correctly based on all validation rules
- ✅ Comprehensive tests (6 tests) covering all validation scenarios

### DEV B STATUS: ✅ **PHASE 4 COMPLETED**

All Multisig Orchestration, Replay Protection, and Settlement Executor tasks complete.

#### 4.1 Multisig Orchestration (`multisig_orchestrator.ts`)

- [x] **Implement PoM delta verification**
  ```typescript
  function verifySettlementMatchesPoM(
    plan: SettlementPlan,
    pomDelta: Map<string, bigint>  // asset_id_hex -> total_outflow
  ): boolean {
    // Sum all tx amounts per asset
    // Compare against pomDelta
    // Return false if ANY mismatch
  }
  ```

  **Critical:** If mismatch, HALT. Never submit mismatched transactions.

- [x] **Implement `signTx()`**
  ```typescript
  async function signTx(
    tx: Transaction,
    signerKey: Keypair
  ): Transaction {
    tx.sign(signerKey);
    return tx;
  }
  ```

- [x] **Implement `collectSignatures()`**
  ```typescript
  async function collectSignatures(
    tx: Transaction,
    signerKeys: Keypair[],
    threshold: number
  ): Transaction {
    let signedCount = 0;
    for (const key of signerKeys) {
      tx.sign(key);
      signedCount++;
      if (signedCount >= threshold) break;
    }
    return tx;
  }
  ```

- [x] **Implement `submitTx()`**
  ```typescript
  async function submitTx(
    tx: Transaction,
    server: Horizon.Server
  ): Promise<{ hash: string; ledger: number }> {
    try {
      const response = await server.submitTransaction(tx);
      return {
        hash: response.hash,
        ledger: response.ledger
      };
    } catch (error) {
      // Handle specific error types
      throw new SettlementError(error);
    }
  }
  ```

#### 4.2 Replay Protection (`replay_protection.ts`)

- [x] **Implement memo-based deduplication**
  ```typescript
  async function isAlreadySettled(
    memo: Buffer,
    server: Horizon.Server
  ): Promise<boolean> {
    // Query Horizon for transactions with this memo
    const memoHex = memo.toString('hex');
    const txs = await server.transactions()
      .forAccount(vaultAddress)
      .call();

    return txs.records.some(tx =>
      tx.memo_type === 'hash' &&
      tx.memo === memoHex
    );
  }
  ```

- [x] **Implement tx hash tracking**
  ```typescript
  interface SettlementRecord {
    subnetId: string;
    blockNumber: bigint;
    txHashes: string[];
    timestamp: Date;
    status: 'pending' | 'confirmed' | 'failed';
  }

  const settlementLog: Map<string, SettlementRecord> = new Map();
  ```

#### 4.3 Submission Flow

- [x] **Implement `executeSettlement()`**
  ```typescript
  async function executeSettlement(
    subnetId: string,
    blockNumber: bigint,
    withdrawals: WithdrawalIntent[],
    pomDelta: Map<string, bigint>,
    signerKeys: Keypair[]
  ): Promise<SettlementResult> {
    // 1. Build settlement plan
    const plan = buildSettlementPlan(subnetId, blockNumber, withdrawals);

    // 2. Verify against PoM delta
    if (!verifySettlementMatchesPoM(plan, pomDelta)) {
      throw new Error("HALT: Settlement does not match PoM delta");
    }

    // 3. Check for replay
    if (await isAlreadySettled(plan.memo, server)) {
      return { status: 'already_settled', txHashes: [] };
    }

    // 4. Sign and submit each transaction
    const txHashes: string[] = [];
    for (const tx of plan.transactions) {
      const signedTx = await collectSignatures(tx, signerKeys, threshold);
      const result = await submitTx(signedTx, server);
      txHashes.push(result.hash);
    }

    // 5. Return confirmation
    return {
      status: 'confirmed',
      txHashes,
      memo: plan.memo.toString('hex')
    };
  }
  ```

#### 4.4 Deliverable (End of Phase 4) ✅
- [x] Settlement execution ready for Stellar testnet (pending funding)
- [x] Idempotent submission (same request = same result)
- [x] Settlement record stored for Dev A confirmation

---

## PHASE 5: FX HANDLING & EDGE CASES

### Dev A is working on:
> Withdrawal queue edge cases
> Duplicate prevention, max queue bounds
> Negative balance impossible proofs

### DEV B STATUS: ✅ **PHASE 5 COMPLETED**

All FX Engine and Failure Handling tasks complete. 109 tests passing.

#### 5.1 FX Engine (`fx_engine.ts`)

- [x] **Implement `discoverPath()`**
  ```typescript
  async function discoverPath(
    sendAsset: Asset,
    destAsset: Asset,
    destAmount: bigint,
    server: Horizon.Server
  ): Promise<PathResult> {
    const paths = await server.strictReceivePaths(
      sendAsset,
      destAsset,
      stroopsToDecimal(destAmount)
    ).call();

    if (paths.records.length === 0) {
      throw new Error("No path found");
    }

    // Sort by lowest source amount
    const best = paths.records.sort((a, b) =>
      parseFloat(a.source_amount) - parseFloat(b.source_amount)
    )[0];

    return {
      path: best.path,
      sourceAmount: decimalToStroops(best.source_amount),
      destAmount: destAmount
    };
  }
  ```

- [x] **Implement slippage bounds**
  ```typescript
  const MAX_SLIPPAGE_PERCENT = 1;  // 1% max slippage

  function validateSlippage(
    expectedAmount: bigint,
    actualAmount: bigint
  ): boolean {
    const slippage = (actualAmount - expectedAmount) * 100n / expectedAmount;
    return slippage <= BigInt(MAX_SLIPPAGE_PERCENT);
  }
  ```

- [x] **Implement FX settlement**
  ```typescript
  async function settleWithFx(
    withdrawal: WithdrawalIntent,
    vaultAsset: Asset,  // What vault holds
    memo: Buffer,
    signerKeys: Keypair[]
  ): Promise<string> {
    // 1. Discover path
    const path = await discoverPath(
      vaultAsset,
      { code: withdrawal.asset_code, issuer: withdrawal.issuer },
      withdrawal.amount
    );

    // 2. Apply slippage buffer
    const sendMax = path.sourceAmount * 101n / 100n;  // 1% buffer

    // 3. Build PathPaymentStrictReceive
    const tx = buildPathPaymentTx(
      vaultAddress,
      withdrawal.destination,
      vaultAsset,
      sendMax,
      { code: withdrawal.asset_code, issuer: withdrawal.issuer },
      withdrawal.amount,
      memo
    );

    // 4. Sign and submit
    const signedTx = await collectSignatures(tx, signerKeys, threshold);
    return await submitTx(signedTx, server);
  }
  ```

#### 5.2 Failure Handling (`failure_handler.ts`)

- [x] **Define failure modes**
  ```typescript
  enum SettlementFailure {
    POM_MISMATCH = 'POM_MISMATCH',           // HALT
    PARTIAL_SUBMISSION = 'PARTIAL_SUBMISSION', // HALT
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    PATH_NOT_FOUND = 'PATH_NOT_FOUND',
    SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
    HORIZON_TIMEOUT = 'HORIZON_TIMEOUT',       // Retry
    THRESHOLD_NOT_MET = 'THRESHOLD_NOT_MET'    // HALT
  }
  ```

- [x] **Implement halt conditions**
  ```typescript
  function shouldHalt(error: SettlementFailure): boolean {
    const haltConditions = [
      SettlementFailure.POM_MISMATCH,
      SettlementFailure.PARTIAL_SUBMISSION,
      SettlementFailure.THRESHOLD_NOT_MET
    ];
    return haltConditions.includes(error);
  }
  ```

- [x] **Implement retry logic**
  ```typescript
  async function submitWithRetry(
    tx: Transaction,
    maxRetries: number = 3
  ): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await submitTx(tx, server);
        return result.hash;
      } catch (error) {
        if (error.code === 'HORIZON_TIMEOUT') {
          await sleep(1000 * (i + 1));  // Exponential backoff
          continue;
        }
        throw error;
      }
    }
    throw new Error("Max retries exceeded");
  }
  ```

#### 5.3 Deliverable (End of Phase 5) ✅
- [x] FX withdrawal ready for testnet (pending vault funding)
- [x] Slippage bounded and enforced (1% default)
- [x] Halt on critical failures (POM_MISMATCH, PARTIAL_SUBMISSION, THRESHOLD_NOT_MET, INSUFFICIENT_BALANCE)
- [x] Retry on transient failures (HORIZON_TIMEOUT, PATH_NOT_FOUND, SLIPPAGE_EXCEEDED)

---

## PHASE 6: END-TO-END INTEGRATION

### JOINT WORK (Both Devs Together)

#### 6.1 Full Flow Test (Repeat Until Boring)

**The complete flow:**
```
1. [Dev A] Create subnet -> returns subnet_id
2. [Dev B] Create vault for subnet -> returns vault_address
3. [Dev A] Register treasury (vault_address) on subnet
4. [Dev B] Fund vault with test assets
5. [Dev A] Credit user balances
6. [Dev A] User requests withdrawal
7. [Dev A] Compute state_root
8. [Dev A] Get treasury snapshot from Dev B
9. [Dev A] Run PoM validation
10. [Dev A] Commit state_root with auditor signatures
11. [Dev B] Receive commitment event
12. [Dev B] Fetch withdrawal queue from Dev A
13. [Dev B] Build settlement plan
14. [Dev B] Verify plan matches PoM delta
15. [Dev B] Sign and submit transactions
16. [Dev B] Verify L1 balances changed correctly
17. [Dev B] Send settlement confirmation to Dev A
```

#### 6.2 Your Integration Tasks (Dev B)

- [ ] **Implement commitment event listener**
  ```typescript
  interface CommitmentEvent {
    subnetId: string;
    blockNumber: bigint;
    stateRoot: string;
  }

  async function onCommitment(event: CommitmentEvent) {
    // 1. Fetch withdrawal queue for this block
    const withdrawals = await fetchWithdrawals(event.subnetId, event.blockNumber);

    // 2. Get treasury snapshot
    const snapshot = await getTreasurySnapshot(vaultAddress);

    // 3. Compute PoM delta locally (sanity check)
    const pomDelta = computeNetOutflow(withdrawals);

    // 4. Verify solvency
    for (const [assetId, outflow] of pomDelta) {
      if ((snapshot.balances.get(assetId) || 0n) < outflow) {
        throw new Error(`HALT: Insolvent for asset ${assetId}`);
      }
    }

    // 5. Execute settlement
    const result = await executeSettlement(
      event.subnetId,
      event.blockNumber,
      withdrawals,
      pomDelta,
      signerKeys
    );

    // 6. Send confirmation
    await sendConfirmation(event.subnetId, event.blockNumber, result.txHashes);
  }
  ```

- [ ] **Implement withdrawal queue fetcher**
  ```typescript
  async function fetchWithdrawals(
    subnetId: string,
    blockNumber: bigint
  ): Promise<WithdrawalIntent[]> {
    // Call Dev A's contract or API to get withdrawal queue
    // This is an INTERFACE point
  }
  ```

- [ ] **Implement confirmation sender**
  ```typescript
  interface SettlementConfirmation {
    subnetId: string;
    blockNumber: bigint;
    txHashes: string[];
    timestamp: Date;
  }

  async function sendConfirmation(
    subnetId: string,
    blockNumber: bigint,
    txHashes: string[]
  ): Promise<void> {
    // Notify Dev A's system that settlement completed
    // This is an INTERFACE point
  }
  ```

#### 6.3 Test Scenarios

- [ ] **Happy path (3 runs minimum)**
  - Create subnet with 3 auditors
  - Credit 3 users with USDC and XLM
  - Each user withdraws portion
  - Verify all settlements complete

- [ ] **PoM halt test (1 run)**
  - Attempt settlement when treasury is underfunded
  - Verify system halts (does NOT submit)
  - Verify error message is clear

- [ ] **FX test**
  - User deposits USDC
  - User withdraws XLM (requires PathPayment)
  - Verify correct amount received

- [ ] **Replay test**
  - Submit same settlement twice
  - Verify second submission is no-op

#### 6.4 Deliverable (End of Phase 6)
- [ ] 3 clean successful end-to-end runs
- [ ] 1 forced failure run (PoM halt verified)
- [ ] All edge cases documented

---

## PHASE 7: FREEZE & DOCUMENTATION

### JOINT WORK (Both Devs)

#### 7.1 Code Freeze Tasks

- [ ] Remove all debug logs
- [ ] Add invariant comments to critical functions
- [ ] Final code review with Dev A

#### 7.2 Documentation (Dev B owns)

- [ ] **Write `SETTLEMENT_FLOW.md`**
  ```markdown
  # Settlement Flow

  ## Prerequisites
  - Vault created and funded
  - Auditors configured
  - Trustlines added

  ## Trigger
  When Dev A commits a state root...

  ## Steps
  1. Receive commitment event
  2. Fetch withdrawal queue
  3. ...
  ```

- [ ] **Write `TREASURY_OPERATIONS.md`**
  - Vault creation steps
  - Signer rotation procedure
  - Trustline management
  - Emergency procedures

- [ ] **Write `FX_HANDLING.md`**
  - Path discovery logic
  - Slippage configuration
  - Failure handling

#### 7.3 Demo Preparation

- [ ] Prepare demo script for stakeholders
- [ ] Record successful settlement flow
- [ ] Document testnet addresses and tx hashes

#### 7.4 Final Deliverable
- [ ] Working Astraeus on Stellar testnet
- [ ] Tagged release (v0.1.0)
- [ ] All documentation complete

---

## DEPENDENCY GRAPH

```
PHASE 0: Lock Interfaces (JOINT)
    |
    +-> PHASE 1: [Dev A] Subnet + Execution
    |       |
    |       +-> [Dev B] Vault Creation <---------------------+
    |                 |                                      |
    |                 v                                      |
    |       PHASE 2: [Dev A] State Root Computation          |
    |       |         |                                      |
    |       |         +-> [Dev B] Treasury Snapshot ---------+
    |       |                   |
    |       |                   v
    |       +---> PHASE 3: [Dev A] PoM Logic (CRITICAL)
    |                     |
    |                     +-> [Dev B] Settlement Planner
    |                               |
    |                               v
    |           PHASE 4: [Dev A] Commitment Contract
    |                     |
    |                     +-> [Dev B] Multisig + Submission
    |                               |
    |                               v
    |           PHASE 5: [Dev A] Edge Cases
    |                     |
    |                     +-> [Dev B] FX + Failure Handling
    |                               |
    +-------------------------------+-> PHASE 6: E2E (JOINT)
                                              |
                                              v
                                        PHASE 7: FREEZE (JOINT)
```

---

## CRITICAL REMINDERS FOR DEV B

1. **NEVER use keccak256** — All hashes are SHA-256
2. **NEVER submit if PoM doesn't match** — Halt immediately
3. **NEVER set internal FX prices** — Use Stellar DEX only
4. **NEVER mutate execution state** — You only move money
5. **ALWAYS verify before submit** — Re-compute delta locally
6. **ALWAYS use memo-based idempotency** — Prevent double-settlement
7. **ALWAYS halt on partial failure** — Don't leave inconsistent state

---

## FILE STRUCTURE (Dev B)

```
dev-b/
├── src/
│   ├── vault/
│   │   ├── vault_manager.ts      # createVault, rotateSigner
│   │   └── trustlines.ts         # addTrustline
│   ├── snapshot/
│   │   └── treasury_snapshot.ts  # getTreasurySnapshot
│   ├── settlement/
│   │   ├── settlement_planner.ts # buildSettlementPlan
│   │   ├── multisig_orchestrator.ts
│   │   └── settlement_executor.ts
│   ├── fx/
│   │   └── fx_engine.ts          # discoverPath, PathPayment
│   ├── safety/
│   │   ├── replay_protection.ts
│   │   └── failure_handler.ts
│   └── interfaces/
│       ├── types.ts              # Shared types
│       └── commitment_listener.ts
├── tests/
│   ├── vault.test.ts
│   ├── snapshot.test.ts
│   ├── settlement.test.ts
│   └── e2e.test.ts
└── docs/
    ├── SETTLEMENT_FLOW.md
    ├── TREASURY_OPERATIONS.md
    └── FX_HANDLING.md
```

---

## INTERFACE CONTRACTS (Between Dev A & Dev B)

### Interface 1: Treasury Snapshot (Dev B -> Dev A)
```typescript
// Dev B provides this to Dev A for PoM validation
interface TreasurySnapshot {
  balances: { [asset_id_hex: string]: string };  // asset_id -> stroops as string
  signers: string[];                              // Ed25519 pubkeys
  threshold: number;
}
```

### Interface 2: Commitment Event (Dev A -> Dev B) ✅ READY
```typescript
// Dev A emits this when state is committed
// Event: StateCommitted(bytes32 indexed subnet_id, uint64 indexed block_number, bytes32 state_root)
interface CommitmentEvent {
  subnet_id: string;      // bytes32 hex
  block_number: number;   // uint64
  state_root: string;     // bytes32 hex
}
```
- **Location**: `contracts/ExecutionCore.sol` - `StateCommitted` event
- **Function**: `commit_state()` - Emits event after successful commit
- **Status**: ✅ Implemented and ready for Arko to listen

### Interface 3: Settlement Confirmation (Dev B -> Dev A)
```typescript
// Dev B sends this after settlement completes
interface SettlementConfirmation {
  subnet_id: string;
  block_number: number;
  tx_hashes: string[];
  memo: string;           // 28 bytes hex
  timestamp: string;      // ISO 8601
}
```

### Interface 4: Withdrawal Queue (Dev A -> Dev B)
```typescript
// Dev B fetches this from Dev A's contract/API
interface WithdrawalIntent {
  withdrawal_id: string;  // bytes32 hex
  user_id: string;        // bytes32 hex
  asset_code: string;     // 1-12 chars
  issuer: string;         // bytes32 hex or "NATIVE"
  amount: string;         // int128 as decimal string
  destination: string;    // Ed25519 pubkey (G... address)
}
```

---

---

## PROJECT STRUCTURE (Current State)

```
TVA-Protocol/
├── agent/
│   ├── interfaces.md                    ✅ FROZEN - Interface specifications
│   ├── SOLANG_STELLAR_REFERENCE.md      ✅ Solang development reference
│   ├── core-idea.md                     📄 Project concept
│   └── plan.md                          📄 Development plan
├── contracts/                           (Dev A - Soroban/Solang)
│   ├── SubnetFactory.sol                ✅ COMPLETE - Subnet creation/management
│   ├── ExecutionCore.sol                ✅ COMPLETE - Financial ops, State Root, PoM, Commitment
│   ├── interfaces/
│   │   └── ISubnetFactory.sol           ✅ Interface definition
│   ├── test/
│   │   ├── TestSubnetFactory.sol        ✅ 6 tests
│   │   ├── TestExecutionCore.sol         ✅ 8 tests
│   │   ├── TestPhase3Phase4.sol         ✅ 13 tests (Phase 3 & 4)
│   │   ├── TestPhase5.sol                ✅ 6 tests (Phase 5)
│   │   ├── compile_tests.sh             ✅ Test compilation script
│   │   ├── README.md                    ✅ Test instructions
│   │   └── TEST_SUMMARY.md              ✅ Test documentation
│   ├── WITHDRAWAL_QUEUE_FORMAT.md       ✅ Withdrawal format spec
│   ├── GOLDEN_TEST_VECTORS.md           ✅ State root test vectors
│   ├── POM_EXAMPLES.md                  ✅ PoM computation examples
│   └── COMPILATION_NOTES.md             ✅ Solang compilation notes
├── dev-b/                               (Dev B - TypeScript/Stellar)
│   ├── src/
│   │   ├── interfaces/
│   │   │   ├── types.ts                 ✅ Shared type definitions
│   │   │   └── crypto.ts                ✅ SHA-256 hashing utilities
│   │   ├── vault/
│   │   │   └── vault_manager.ts         ✅ Vault creation/management
│   │   ├── snapshot/
│   │   │   └── treasury_snapshot.ts     ✅ Treasury snapshot service
│   │   ├── settlement/
│   │   │   ├── pom_delta.ts             ✅ PoM delta computation
│   │   │   ├── settlement_planner.ts    ✅ Settlement plan building
│   │   │   ├── multisig_orchestrator.ts ✅ Signature collection/submission
│   │   │   └── settlement_executor.ts   ✅ End-to-end settlement
│   │   ├── safety/
│   │   │   ├── replay_protection.ts     ✅ Memo-based replay protection
│   │   │   └── failure_handler.ts       ✅ Failure classification and retry
│   │   ├── fx/
│   │   │   └── fx_engine.ts             ✅ FX path discovery and settlement
│   │   └── index.ts                     ✅ Module exports
│   ├── tests/
│   │   ├── crypto.test.ts               ✅ 29 crypto tests
│   │   ├── snapshot.test.ts             ✅ 15 snapshot tests
│   │   ├── settlement.test.ts           ✅ 19 settlement tests
│   │   └── fx.test.ts                   ✅ 46 FX and failure tests
│   ├── package.json                     ✅ Dependencies
│   ├── tsconfig.json                    ✅ TypeScript config
│   └── README.md                        ✅ Dev B documentation
├── duo.md                               📄 This file (Dev B checklist)
└── README.md                            📄 Project overview
```

---

## INTERFACE POINTS (Ready for Integration)

### 1. Withdrawal Queue Format ✅ READY
- **Location**: `contracts/WITHDRAWAL_QUEUE_FORMAT.md`
- **Function**: `ExecutionCore.get_withdrawal_queue(bytes32 subnet_id)`
- **Returns**: Array of `Withdrawal` structs
- **Format**: JSON array with withdrawal_id, user_id, asset_code, issuer, amount, destination
- **Status**: ✅ Documented and ready for integration

### 2. Subnet Factory Interface ✅ READY
- **Location**: `contracts/interfaces/ISubnetFactory.sol`
- **Functions**: `subnet_exists()`, `is_asset_whitelisted()`, `get_subnet()`
- **Status**: ✅ Interface defined, ready for cross-contract calls

### 3. Events ✅ READY
- **SubnetFactory Events**: `SubnetCreated`, `TreasuryRegistered`
- **ExecutionCore Events**: `Credited`, `Debited`, `Transferred`, `WithdrawalRequested`, `StateRootComputed`, `PomValidated`, `StateCommitted`
- **Status**: ✅ All events defined and emitted

### 4. Treasury Snapshot (Dev B → Dev A) ✅ READY
- **Location**: `dev-b/src/snapshot/treasury_snapshot.ts`
- **Function**: `getTreasurySnapshot(vaultAddress)`
- **Returns**: `{ balances: Map<asset_id, bigint>, signers: string[], threshold: number }`
- **Status**: ✅ Implemented and tested

### 5. Crypto Utilities ✅ READY
- **Location**: `dev-b/src/interfaces/crypto.ts`
- **Functions**: `computeAssetId()`, `computeMemo()`, `computeBalanceLeaf()`, `computeWithdrawalLeaf()`
- **Status**: ✅ All SHA-256 functions matching interfaces.md

### 6. PoM Delta Computation ✅ READY
- **Location**: `dev-b/src/settlement/pom_delta.ts`
- **Functions**: `computeNetOutflow()`, `verifyDeltaMatch()`, `groupWithdrawalsByAsset()`, `sortWithdrawalsDeterministically()`
- **Status**: ✅ Implemented and tested with 19 settlement tests

### 7. Settlement Planner ✅ READY
- **Location**: `dev-b/src/settlement/settlement_planner.ts`
- **Class**: `SettlementPlanner`
- **Functions**: `buildSettlementPlan()`, `buildPaymentTransaction()`, `buildPathPaymentTransaction()`
- **Status**: ✅ Builds deterministic XDR transactions with proper memo

### 8. Multisig Orchestrator ✅ READY
- **Location**: `dev-b/src/settlement/multisig_orchestrator.ts`
- **Class**: `MultisigOrchestrator`
- **Functions**: `verifySettlementMatchesPoM()`, `verifySolvency()`, `signTransaction()`, `submitWithRetry()`
- **Status**: ✅ PoM verification halts on mismatch, retry logic implemented

### 9. Settlement Executor ✅ READY
- **Location**: `dev-b/src/settlement/settlement_executor.ts`
- **Class**: `SettlementExecutor`
- **Functions**: `executeSettlement()`, `onCommitmentEvent()`, `getSettlementConfirmation()`
- **Status**: ✅ End-to-end orchestration ready

### 10. Replay Protection ✅ READY
- **Location**: `dev-b/src/safety/replay_protection.ts`
- **Class**: `ReplayProtectionService`
- **Functions**: `isAlreadySettled()`, `recordConfirmedSettlement()`, `getSettlementConfirmation()`
- **Status**: ✅ Memo-based deduplication and settlement tracking

### 11. FX Engine ✅ READY
- **Location**: `dev-b/src/fx/fx_engine.ts`
- **Class**: `FxEngine`
- **Functions**: `discoverPath()`, `validateSlippage()`, `settleWithFx()`, `batchSettleWithFx()`
- **Status**: ✅ Stellar DEX path discovery and FX settlement with slippage bounds

### 12. Failure Handler ✅ READY
- **Location**: `dev-b/src/safety/failure_handler.ts`
- **Class**: `FailureHandler`
- **Functions**: `shouldHalt()`, `isRetryable()`, `classifyFailure()`, `executeWithRetry()`
- **Status**: ✅ Comprehensive failure classification, halt conditions, and retry logic

---

**Document Version:** 1.4
**Last Updated:** 2026-01-17
**Status:** Active Development - Phase 5 Complete for Dev B
**Dev A Progress:** Phase 0 ✅ | Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ | Phase 5 ✅
**Dev B Progress:** Phase 0 ✅ | Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ | Phase 5 ✅ | Phase 6 (Next - requires Dev A)
