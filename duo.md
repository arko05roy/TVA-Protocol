# ASTRAEUS — Dev B Async Checklist (Interleaved with Dev A)

> **You are Dev B.** This document provides your complete task checklist, interleaved with Dev A's work.
> Dev A handles execution logic, state roots, and Proof of Money (PoM) in Soroban/Solang.
> Dev B (you) handles Stellar L1 treasury, settlement, multisig, and FX.

---

## PHASE 0: PRE-WORK (Both, Together)

### JOINT TASK: Lock Interfaces (interfaces.md is IMMUTABLE after this)

**You participate in:**
- [ ] Agree on TreasurySnapshot JSON schema
- [ ] Agree on PoM delta schema (asset_id -> amount mapping)
- [ ] Agree on memo format: `first_28_bytes(SHA256(subnet_id || block_number))`
- [ ] Confirm asset canonical encoding (SHA256, not keccak256)

**Deliverable:** `interfaces.md` frozen. No changes allowed after this.

---

## PHASE 1: INFRASTRUCTURE SETUP

### Dev A is working on:
> SubnetFactory + ExecutionContract (credit, debit, transfer, request_withdrawal)
> Unit tests for balance changes and withdrawal deductions
> NO PoM yet, NO Stellar dependency

### YOUR TASKS (Dev B):

#### 1.1 Stellar Testnet Environment Setup
- [ ] **Install Stellar CLI tools**
  ```bash
  # Install Stellar CLI
  cargo install --locked stellar-cli
  # OR use npm
  npm install -g @stellar/stellar-sdk
  ```
- [ ] **Configure testnet identity**
  ```bash
  stellar keys generate treasury-admin --network testnet
  stellar keys fund treasury-admin --network testnet
  ```

#### 1.2 Vault Creation Tooling (`vault_manager.ts`)
- [ ] **Implement `createVault()` function**
  ```typescript
  async function createVault(
    auditorPubkeys: string[],  // Ed25519 public keys
    threshold: number,
    assetList: Asset[]
  ): Promise<string>  // Returns vault address
  ```

  **Steps to implement:**
  1. Generate new Stellar keypair for vault
  2. Create account with minimum XLM reserve (1 XLM base + 0.5 XLM per entry)
  3. Add each auditor as signer with weight = 1
  4. Set thresholds: `low = 0`, `med = threshold`, `high = threshold`
  5. Remove master key (weight = 0)
  6. Add trustlines for each whitelisted asset
  7. Return vault public key (G... address)

- [ ] **Implement `addTrustline()` helper**
  ```typescript
  async function addTrustline(
    vault: string,
    asset: Asset,
    signerKeys: Keypair[]
  ): Promise<void>
  ```

- [ ] **Implement `rotateSigner()` function**
  ```typescript
  async function rotateSigner(
    vault: string,
    oldSigner: string,
    newSigner: string,
    signerKeys: Keypair[]
  ): Promise<void>
  ```

- [ ] **Manual verification checklist:**
  - [ ] Vault has correct signers
  - [ ] Vault has correct thresholds
  - [ ] Vault has required trustlines
  - [ ] Master key is removed (cannot unilaterally control)

#### 1.3 Deliverable (End of Phase 1)
- [ ] Working multisig vault on Stellar testnet
- [ ] Vault address documented and ready to hand to Dev A
- [ ] Screenshot/proof of vault configuration

---

## PHASE 2: TREASURY SNAPSHOT SERVICE

### Dev A is working on:
> `compute_state_root()` - balance leaves, withdrawal leaves, sorting, merkle root
> Golden test vectors for determinism
> Root spec locked forever after this

### YOUR TASKS (Dev B):

#### 2.1 Treasury Snapshot Service (`treasury_snapshot.ts`)

- [ ] **Define TreasurySnapshot type**
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

- [ ] **Implement `computeAssetId()` helper**
  ```typescript
  function computeAssetId(assetCode: string, issuer: string): string {
    // issuer = "NATIVE" for XLM, or 32-byte Ed25519 pubkey for issued assets
    // Return: SHA256(asset_code_utf8_null_terminated || issuer_bytes) as hex
  }
  ```

  **Critical:** Must use SHA-256 (not keccak256) to match Dev A's computation

- [ ] **Implement `getTreasurySnapshot()`**
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

- [ ] **Implement asset normalization**
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

- [ ] **Add error handling:**
  - [ ] Horizon timeout -> retry with backoff
  - [ ] Account not found -> throw clear error
  - [ ] Malformed asset -> log and skip

#### 2.2 Integration Point
- [ ] **Expose snapshot as API endpoint or module export**
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

#### 2.3 Deliverable (End of Phase 2)
- [ ] `getTreasurySnapshot()` returns correct JSON matching interface spec
- [ ] Dev A can call it locally to test PoM logic
- [ ] Snapshot verified against actual Stellar account state

---

## PHASE 3: SETTLEMENT PLANNER (Core Integration Day)

### Dev A is working on:
> **MOST IMPORTANT DAY FOR DEV A**
> PoM implementation: `compute_net_outflow()`, `check_solvency()`, `check_constructibility()`, `check_authorization()`
> `pom_validate()` with failure enums
> Unit tests for insolvency, fake withdrawals, signer mismatch

### YOUR TASKS (Dev B):

#### 3.1 Settlement Planner (`settlement_planner.ts`)

- [ ] **Define withdrawal intent type (matches Dev A's output)**
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

- [ ] **Implement `computeMemo()`**
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

- [ ] **Implement `buildSettlementPlan()`**
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

- [ ] **Implement `buildPaymentTx()`**
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

- [ ] **Implement `buildPathPaymentTx()` for FX**
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

- [ ] **Implement batching strategy**
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

#### 3.2 Deliverable (End of Phase 3)
- [ ] XDR transactions built (not submitted yet)
- [ ] Transactions match PoM delta exactly
- [ ] Memo correctly computed and attached
- [ ] Unit tests: plan matches expected output for sample withdrawals

---

## PHASE 4: COMMITMENT LINK & REAL MONEY MOVEMENT

### Dev A is working on:
> `commit_state()` — signature verification, PoM enforced inside commit, block monotonicity
> State commits accepted/rejected correctly

### YOUR TASKS (Dev B):

#### 4.1 Multisig Orchestration (`multisig_orchestrator.ts`)

- [ ] **Implement PoM delta verification**
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

- [ ] **Implement `signTx()`**
  ```typescript
  async function signTx(
    tx: Transaction,
    signerKey: Keypair
  ): Transaction {
    tx.sign(signerKey);
    return tx;
  }
  ```

- [ ] **Implement `collectSignatures()`**
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

- [ ] **Implement `submitTx()`**
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

- [ ] **Implement memo-based deduplication**
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

- [ ] **Implement tx hash tracking**
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

- [ ] **Implement `executeSettlement()`**
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

#### 4.4 Deliverable (End of Phase 4)
- [ ] Funds move on Stellar testnet
- [ ] Idempotent submission (same request = same result)
- [ ] Settlement record stored for Dev A confirmation

---

## PHASE 5: FX HANDLING & EDGE CASES

### Dev A is working on:
> Withdrawal queue edge cases
> Duplicate prevention, max queue bounds
> Negative balance impossible proofs

### YOUR TASKS (Dev B):

#### 5.1 FX Engine (`fx_engine.ts`)

- [ ] **Implement `discoverPath()`**
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

- [ ] **Implement slippage bounds**
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

- [ ] **Implement FX settlement**
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

- [ ] **Define failure modes**
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

- [ ] **Implement halt conditions**
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

- [ ] **Implement retry logic**
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

#### 5.3 Deliverable (End of Phase 5)
- [ ] FX withdrawal works on testnet
- [ ] Slippage bounded and enforced
- [ ] Halt on critical failures
- [ ] Retry on transient failures

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

### Interface 2: Commitment Event (Dev A -> Dev B)
```typescript
// Dev A emits this when state is committed
interface CommitmentEvent {
  subnet_id: string;      // bytes32 hex
  block_number: number;   // uint64
  state_root: string;     // bytes32 hex
}
```

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

**Document Version:** 1.0
**Last Updated:** 2025-01-17
**Status:** Active Development
