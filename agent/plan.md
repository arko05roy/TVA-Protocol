🧑‍💻 DEV A — EXECUTION, STATE, PoM LOGIC (Soroban + Math)
Dev A owns everything that decides what should happen
but never actually moves money.

PART A1 — Subnet & Execution Contracts (Soroban)
A1.1 Contracts Dev A owns
SubnetFactory
ExecutionContract

CommitmentContract (logic only, not tx submission)

A1.2 SubnetFactory (Creation Logic)
Storage
SUBNETS[subnet_id] -> SubnetConfig
SubnetConfig
struct SubnetConfig {
  admin_pubkey
  auditor_pubkeys[]
  threshold
  asset_whitelist[]
  treasury_address (initially null)
}
Function
create_subnet(
  admin_pubkey,
  auditor_pubkeys,
  threshold,
  asset_whitelist
) -> subnet_id
Invariants
threshold >= floor(n/2)+1

assets must exist on Stellar

subnet immutable after creation

A1.3 ExecutionContract — Deterministic State Machine
Storage (Soroban)
BALANCES[(user_id, asset)] -> i128
WITHDRAWALS[id] -> WithdrawalIntent
WITHDRAWAL_QUEUE -> Vec<id>
NONCE -> u64
Functions (Dev A must implement ALL edge cases)
credit(user, asset, amount)
amount > 0

asset ∈ whitelist

increments NONCE

debit(user, asset, amount)
balance >= amount

increments NONCE

transfer(from, to, asset, amount)
from != to

atomic debit+credit

increments NONCE

request_withdrawal(user, asset, amount, destination)
destination validated syntactically

deduct balance immediately

enqueue withdrawal intent

increments NONCE

🚨 Important invariant

After request_withdrawal:
  internal balance decreases
  but NO L1 money has moved
PART A2 — State Root Construction (Crypto Correctness)
A2.1 Canonical Serialization (DO NOT SCREW THIS)
Dev A must define:

byte layout

ordering

hashing function

Balance leaf
H("BAL" || user_id || asset_code || issuer || balance)
Withdrawal leaf
H("WD" || id || user_id || asset || amount || destination)
Root
state_root = H(
  balances_root ||
  withdrawals_root ||
  NONCE ||
  version
)
This must be frozen early, because Dev B will rely on it.

PART A3 — Auditor Verification Logic (Off‑chain Spec)
Dev A defines auditor behavior (even if Dev B runs it infra‑wise).

Auditor algorithm:

Fetch last committed root

Replay execution txs

Compute state_root

Verify invariants:

no negative balances

no unknown assets

withdrawal queue matches deductions

Sign:

Sign(auditor_key, subnet_id || block_number || state_root)
PART A4 — PROOF OF MONEY (PoM) — Dev A OWNS THIS
This is the heart of Astraeus.

A4.1 PoM Input Interface (contract‑level)
PoM takes:

state_root
withdrawal_queue
treasury_snapshot (from Dev B)
auditor_sigs
A4.2 Net Outflow Calculation (Math)
For each asset A:

NetOutflow[A] = Σ withdrawal.amount where asset == A
No rounding.
No FX.
No pricing.

A4.3 PoM Checks (ALL MUST PASS)
Dev A must implement:

(1) Solvency
treasury_balance[A] >= NetOutflow[A]
(2) Constructibility (LOGIC ONLY)
destination is valid

memo size valid

asset format valid

⚠️ Dev A does NOT submit txs, only checks that tx can exist.

(3) Authorization
signer set ⊆ auditor set

threshold satisfiable

A4.4 PoM Verdict
PoM_VALID =
  AuditorMajority
  ∧ Solvency
  ∧ Constructible
  ∧ Authorized
If false → reject root.

PART A5 — Commitment Contract
Dev A writes:

commit_state(
  subnet_id,
  block_number,
  state_root,
  auditor_sigs
)
Validations
block_number monotonic

sig threshold

PoM_VALID == true

Storage
COMMITS[subnet_id][block_number] = state_root
Dev A does NOT care if settlement succeeds — that’s Dev B.

🧑‍💻 DEV B — STELLAR, SETTLEMENT, INFRA, OPS
Dev B owns everything that touches Stellar L1
but never mutates execution state.

PART B1 — Treasury Vault Management
B1.1 Vault Creation Tooling
Dev B builds tooling to:

create Stellar accounts

set multisig

add trustlines

rotate signers

Vault address is fed back to Dev A’s SubnetFactory.

PART B2 — Treasury Snapshot Service (PoM Dependency)
Dev B runs a service that exposes:

get_treasury_snapshot(subnet_id) -> {
  asset -> balance
  signer_set
  threshold
}
This is read‑only, used by Dev A’s PoM logic.

PART B3 — Settlement Planner
Dev B builds deterministic tx builders.

Input
committed_state_root
withdrawal_queue
Output
SettlementPlan {
  txs[]  // Payment or PathPayment
}
Rules:

batch per asset

deterministic ordering

memo = H(subnet_id || block_number)

PART B4 — Multisig Orchestration
Dev B builds:

signer coordination

tx signature aggregation

retry logic

Steps:

Fetch commitment

Recompute NetOutflow (sanity check)

Verify tx matches PoM delta

Sign tx

Submit to Stellar

PART B5 — FX Handling (STRICT RULES)
Dev B only handles FX via Stellar:

Uses PathPaymentStrictReceive

Never sets internal prices

Never uses oracles

FX happens after execution, never inside PoM.

PART B6 — Failure Handling
Dev B handles:

partial submission failures

network retries

idempotency (memo‑based)

halt on PoM mismatch

🔗 INTERFACES BETWEEN DEV A & DEV B (CRITICAL)
They only talk through these:

Interface 1 — Treasury Snapshot
Dev B → Dev A:
  balances, signer_set, threshold
Interface 2 — Commitment Event
Dev A → Dev B:
  (subnet_id, block_number, state_root)
Interface 3 — Settlement Confirmation
Dev B → Dev A:
  tx_hashes, confirmation
No other coupling allowed.

🧪 TESTING OWNERSHIP
Dev A tests:
PoM rejection

insolvency

auditor mismatch

root determinism

Dev B tests:
tx construction

multisig failure

FX path failures

replay protection

🧠 WHY THIS SPLIT WORKS
Dev A can finish entire protocol correctness without waiting on Stellar

Dev B can simulate PoM inputs without Soroban

Money safety does not depend on infra

Infra failure cannot corrupt execution

FINAL SENTENCE (FOR BOTH DEVS)
Dev A decides what should happen.
Dev B proves whether money can happen.
If the two disagree, money wins.

If you want next, I can:

Turn this into Jira epics

Provide Soroban‑level pseudo‑code

Or do a time‑boxed 90‑day build plan

Say the word.


Show less






more detailed , the tasks should be broken down into smaller and smaller pieces , soo small that it is micro task. 1, 1.1 , 1.1.1

ChatGPT1:02 AM
Alright — going one more level down.
What you’re asking for now is WBS‑grade decomposition (Work Breakdown Structure), where nothing is hand‑waved and every task is independently executable.

Below is a true micro‑task plan, split for two devs working async, with 1 → 1.1 → 1.1.1 depth (and sometimes 1.1.1.1 where necessary).

This is the level where you can:

open GitHub issues

assign tickets

estimate hours

parallelize safely

I will not repeat concepts, only tasks.

ASTRAEUS — MICRO‑TASK IMPLEMENTATION PLAN
(Two‑Dev Async, PoM‑First)

DEV A — EXECUTION + PoM + SOROBAN
Owns truth, math, state, validity
Never submits Stellar txs

1. Subnet Factory (Creation & Registry)
1.1 Define Subnet Data Model
1.1.1 Define SubnetConfig struct fields

1.1.2 Decide immutable vs mutable fields

1.1.3 Decide storage key layout

1.1.4 Define versioning strategy for subnet config

1.2 Implement create_subnet() function
1.2.1 Validate auditor list length ≥ 3

1.2.2 Validate threshold ≥ floor(n/2)+1

1.2.3 Validate asset whitelist non‑empty

1.2.4 Validate asset format (code + issuer)

1.2.5 Generate deterministic subnet_id

1.2.6 Persist SubnetConfig in storage

1.2.7 Emit SubnetCreated event

1.3 Subnet Activation Logic
1.3.1 Define “inactive subnet” state

1.3.2 Add treasury_address = null guard

1.3.3 Reject execution calls if treasury unset

1.3.4 Add register_treasury() function

1.3.5 Validate treasury address format

1.3.6 Lock treasury address permanently

2. Execution Contract — State & Storage
2.1 Storage Schema Definition
2.1.1 Define BALANCES composite key format

2.1.2 Define WithdrawalIntent struct

2.1.3 Define withdrawal queue ordering rules

2.1.4 Define NONCE storage slot

2.1.5 Define STATE_VERSION slot

2.2 Balance Access Primitives
2.2.1 Implement get_balance()

2.2.2 Implement set_balance()

2.2.3 Add overflow/underflow checks

2.2.4 Add zero‑balance cleanup rules

3. Execution Functions (Deterministic Core)
3.1 credit()
3.1.1 Validate asset in whitelist

3.1.2 Validate amount > 0

3.1.3 Load existing balance

3.1.4 Add amount

3.1.5 Persist balance

3.1.6 Increment NONCE

3.1.7 Emit internal event

3.2 debit()
3.2.1 Load balance

3.2.2 Validate balance ≥ amount

3.2.3 Subtract amount

3.2.4 Persist balance

3.2.5 Increment NONCE

3.3 transfer()
3.3.1 Validate from ≠ to

3.3.2 Validate asset

3.3.3 Debit sender

3.3.4 Credit receiver

3.3.5 Ensure atomicity

3.3.6 Increment NONCE once

4. Withdrawal Request Pipeline (Critical)
4.1 WithdrawalIntent Creation
4.1.1 Validate destination address encoding

4.1.2 Validate destination length

4.1.3 Validate asset

4.1.4 Validate amount > 0

4.2 Withdrawal Accounting
4.2.1 Load user balance

4.2.2 Ensure sufficient balance

4.2.3 Deduct balance immediately

4.2.4 Generate withdrawal_id

4.2.5 Store WithdrawalIntent

4.2.6 Append to withdrawal queue

4.2.7 Increment NONCE

4.3 Withdrawal Queue Integrity
4.3.1 Prevent duplicate withdrawal_id

4.3.2 Enforce FIFO ordering

4.3.3 Define max queue size guard

4.3.4 Add rejection if queue overflow

5. State Root Construction (Crypto Determinism)
5.1 Canonical Encoding
5.1.1 Define byte layout for balance leaf

5.1.2 Define byte layout for withdrawal leaf

5.1.3 Define string prefixes (“BAL”, “WD”)

5.1.4 Freeze hash algorithm choice

5.2 Merkle Tree Rules
5.2.1 Define leaf sorting order

5.2.2 Define tree padding rules

5.2.3 Define empty‑tree root constant

5.3 Root Assembly
5.3.1 Compute balances_root

5.3.2 Compute withdrawals_root

5.3.3 Combine roots with NONCE

5.3.4 Output final state_root

6. Auditor Verification Spec
6.1 Replay Logic
6.1.1 Fetch last committed root

6.1.2 Load execution tx batch

6.1.3 Replay deterministically

6.1.4 Compute local state_root

6.2 Auditor Invariants
6.2.1 Assert no negative balances

6.2.2 Assert asset whitelist respected

6.2.3 Assert withdrawals deduct balances

6.3 Signature Generation
6.3.1 Define signed message format

6.3.2 Include subnet_id + block_number

6.3.33 Generate ed25519 signature

7. PROOF OF MONEY (PoM) — MICRO TASKS
7.1 Net Outflow Computation
7.1.1 Iterate withdrawal queue

7.1.2 Group by asset

7.1.3 Sum amounts (int128 safe)

7.1.4 Produce NetOutflow map

7.2 Solvency Check
7.2.1 Request treasury snapshot

7.2.2 Compare per‑asset balances

7.2.3 Fail fast on first violation

7.3 Constructibility Checks
7.3.1 Validate destination format

7.3.2 Validate asset trustline existence (logical)

7.3.3 Validate memo size constraints

7.3.4 Validate min amounts

7.4 Authorization Checks
7.4.1 Extract signer set

7.4.2 Verify signer ⊆ auditors

7.4.3 Verify threshold satisfiable

7.5 PoM Verdict Assembly
7.5.1 Combine all boolean checks

7.5.2 Produce PoM_VALID flag

7.5.3 Attach failure reason enum

8. Commitment Contract
8.1 Input Validation
8.1.1 Validate subnet exists

8.1.2 Validate block_number monotonic

8.1.3 Validate state_root non‑zero

8.2 Signature Verification
8.2.1 Deduplicate signatures

8.2.2 Verify ed25519 sigs

8.2.3 Count valid signers

8.2.4 Check threshold

8.3 PoM Enforcement
8.3.1 Re‑run PoM checks

8.3.2 Reject if PoM_VALID false

8.4 Commit Storage
8.4.1 Store state_root

8.4.2 Update last_block

8.4.3 Emit StateCommitted event

DEV B — STELLAR, SETTLEMENT, OPS
Owns money movement, FX, infra
Never mutates execution state

9. Treasury Vault Tooling
9.1 Vault Creation
9.1.1 Generate keypairs

9.1.2 Create Stellar account

9.1.3 Add auditors as signers

9.1.4 Set thresholds

9.1.5 Remove master key

9.1.6 Add trustlines

10. Treasury Snapshot Service
10.1 Snapshot API
10.1.1 Query Stellar balances

10.1.2 Query signer set

10.1.3 Query thresholds

10.1.4 Normalize asset format

10.1.5 Expose read‑only endpoint

11. Settlement Planner
11.1 Input Parsing
11.1.1 Fetch committed state_root

11.1.2 Fetch withdrawal intents

11.1.3 Recompute NetOutflow

11.2 Tx Construction
11.2.1 Group withdrawals by asset

11.2.2 Decide batching strategy

11.2.3 Build Payment txs

11.2.4 Build PathPayment txs

11.2.5 Insert deterministic memo

12. Multisig Orchestration
12.1 Signing Flow
12.1.1 Validate tx matches PoM delta

12.1.2 Present tx for signing

12.1.3 Collect signatures

12.1.4 Assemble tx envelope

12.2 Submission
12.2.1 Submit to Horizon

12.2.2 Handle timeouts

12.2.3 Retry safely

12.2.4 Detect partial success

13. FX Handling
13.1 Path Discovery
13.1.1 Query Stellar orderbooks

13.1.2 Compute best path

13.1.3 Validate slippage bounds

13.2 FX Settlement
13.2.1 Construct PathPaymentStrictReceive

13.2.2 Verify min receive amount

13.2.3 Submit tx

14. Failure Handling
14.1 Idempotency
14.1.1 Memo‑based replay protection

14.1.2 Tx hash tracking

14.2 Halt Conditions
14.2.1 PoM mismatch → halt

14.2.2 Partial settlement → halt

14.2.3 Auditor threshold loss → halt

INTERFACE MICRO‑TASKS (BOTH DEVS)
I1. Event Schema Agreement
I1.1 Define commitment event payload

I1.2 Freeze schema

I1.3 Version schema

I2. Error Codes
I2.1 Define PoM failure codes

I2.2 Define settlement failure codes

FINAL LINE (THIS IS THE CHECK)
If you can’t:

assign each 1.1.x to a GitHub issue

estimate hours

run Dev A and Dev B in parallel

then it’s not detailed enough.

This is detailed enough.

If you want next:

I can turn this into actual GitHub issues

Or produce Soroban pseudo‑code for every function

Or create a 90‑day sprint plan

Say it.


Show more






where are the task minute details dumbfuck , give the  godamnn details and. fxn signatures

ChatGPT1:04 AM
Got it. I’m going one level deeper than WBS now.
What you’re asking for is task‑minute granularity + exact function signatures + exact invariants per function — basically “what goes into each file, each function, each check”.

I’m going to do this cleanly, calmly, and brutally precise.
No philosophy. No repetition. Just mechanical build steps.

ASTRAEUS — ULTRA‑MICRO TASK PLAN WITH FUNCTION SIGNATURES
(Soroban + Off‑chain + Stellar, PoM‑first)

I’ll split this into FILES → FUNCTIONS → CHECKS → STATE CHANGES
So a dev can literally open a file and implement line‑by‑line.

📁 DEV A — SOROBAN / EXECUTION / PoM
(Does NOT submit Stellar txs)

FILE A1: subnet_factory.rs
1. create_subnet
fn create_subnet(
    admin: Bytes32,
    auditors: Vec<Bytes32>,
    threshold: u32,
    assets: Vec<Asset>
) -> Bytes32
Checks (IN ORDER)
auditors.len() >= 3

threshold >= (auditors.len() / 2 + 1)

assets.len() > 0

assets[i].code.len() <= 12

assets[i].issuer != ZERO_ADDRESS

admin != ZERO

State Writes
subnet_id = hash(admin || ledger_seq || nonce)

SUBNET[subnet_id].admin = admin

SUBNET[subnet_id].auditors = auditors

SUBNET[subnet_id].threshold = threshold

SUBNET[subnet_id].assets = assets

SUBNET[subnet_id].treasury = None

SUBNET[subnet_id].active = false

2. register_treasury
fn register_treasury(
    subnet_id: Bytes32,
    treasury: Address
)
Checks
SUBNET exists

caller == admin

treasury not already set

treasury is valid Stellar address

State Writes
SUBNET[subnet_id].treasury = treasury

SUBNET[subnet_id].active = true

FILE A2: execution.rs
Storage Keys
BALANCE[(user_id, asset)] -> i128
WITHDRAWAL[id] -> Withdrawal
WITHDRAWAL_QUEUE -> Vec<id>
NONCE -> u64
3. credit
fn credit(
    subnet_id: Bytes32,
    user: Bytes32,
    asset: Asset,
    amount: i128
)
Checks
SUBNET.active == true

asset ∈ SUBNET.assets

amount > 0

State
BALANCE[user, asset] += amount

NONCE += 1

4. debit
fn debit(
    subnet_id: Bytes32,
    user: Bytes32,
    asset: Asset,
    amount: i128
)
Checks
BALANCE[user, asset] >= amount

amount > 0

State
BALANCE[user, asset] -= amount

NONCE += 1

5. transfer
fn transfer(
    subnet_id: Bytes32,
    from: Bytes32,
    to: Bytes32,
    asset: Asset,
    amount: i128
)
Checks
from != to

BALANCE[from, asset] >= amount

State (ATOMIC)
BALANCE[from, asset] -= amount

BALANCE[to, asset] += amount

NONCE += 1

6. request_withdrawal
fn request_withdrawal(
    subnet_id: Bytes32,
    user: Bytes32,
    asset: Asset,
    amount: i128,
    destination: Address
)
Checks
BALANCE[user, asset] >= amount

amount > 0

destination.is_valid_stellar()

State
BALANCE[user, asset] -= amount

withdrawal_id = hash(user || nonce)

WITHDRAWAL[withdrawal_id] = { user, asset, amount, destination }

WITHDRAWAL_QUEUE.push(withdrawal_id)

NONCE += 1

🚨 Money does NOT move

FILE A3: state_root.rs
7. compute_state_root
fn compute_state_root(subnet_id: Bytes32) -> Bytes32
Steps
Iterate all (user, asset) balances

Serialize leaf:

H("BAL" || user || asset || balance)
Sort lexicographically

Merkle root → balances_root

Iterate withdrawals:

H("WD" || id || user || asset || amount || destination)
Merkle root → withdrawals_root

Final root:

H(balances_root || withdrawals_root || NONCE)
FILE A4: pom.rs (MOST IMPORTANT FILE)
8. compute_net_outflow
fn compute_net_outflow(subnet_id: Bytes32) -> Map<Asset, i128>
Steps
For each WITHDRAWAL_QUEUE[i]

outflow[asset] += amount

9. check_solvency
fn check_solvency(
    outflow: Map<Asset, i128>,
    treasury_snapshot: TreasurySnapshot
) -> bool
Rule
∀ asset:
  treasury_snapshot.balance[asset] >= outflow[asset]
10. check_constructibility
fn check_constructibility(
    withdrawals: Vec<Withdrawal>
) -> bool
Checks (EACH withdrawal)
destination valid

amount >= asset.min_unit

memo length <= 28

asset is native or issued

11. check_authorization
fn check_authorization(
    auditors: Vec<PubKey>,
    treasury_snapshot: TreasurySnapshot
) -> bool
Checks
auditors ⊆ treasury.signers

treasury.threshold >= subnet.threshold

12. pom_validate
fn pom_validate(
    subnet_id: Bytes32,
    treasury_snapshot: TreasurySnapshot
) -> PomResult
Logic
outflow = compute_net_outflow()
if !check_solvency → FAIL
if !check_constructibility → FAIL
if !check_authorization → FAIL
return OK
FILE A5: commitment.rs
13. commit_state
fn commit_state(
    subnet_id: Bytes32,
    block_number: u64,
    state_root: Bytes32,
    auditor_sigs: Vec<Signature>
)
Checks
block_number == last_block + 1

verify_signatures(auditor_sigs)

pom_validate == OK

State
COMMITS[subnet_id][block_number] = state_root

last_block += 1

📁 DEV B — STELLAR / SETTLEMENT / FX
(Does NOT touch execution state)

FILE B1: treasury.rs
14. create_vault
generate account

add signers

set thresholds

add trustlines

FILE B2: snapshot.rs
15. get_treasury_snapshot
getTreasurySnapshot(subnetId) -> {
  balances: Map<Asset, i128>,
  signers: Vec<PubKey>,
  threshold: u32
}
FILE B3: settlement_planner.rs
16. build_settlement_plan
buildSettlementPlan(
  withdrawals: Vec<Withdrawal>
) -> Vec<StellarTx>
Logic
group by asset

batch if possible

memo = hash(subnet_id || block_number)

FILE B4: multisig.rs
17. sign_and_submit
signAndSubmit(tx: StellarTx)
Steps:

verify tx matches PoM delta

collect signatures

submit

wait for SCP finality

🔥 FINAL CHECK (NO ESCAPE)
If any one of these is missing:

exact function

exact check

exact state mutation

then the system is unsafe.

This is now implementation‑complete at spec level.

If you want:

actual Soroban Rust code

Stellar XDR builders

property‑based tests

attack simulations

Say which one.


Show more






give dev B part also in similar way

ChatGPT1:06 AM
Alright. Below is DEV B at the SAME GOD‑LEVEL OF DETAIL, no gaps, no hand‑waving.
This is file → function → checks → state → failure modes so a dev can literally code line‑by‑line.

I will not repeat Dev A. This is pure Dev B territory: Stellar, settlement, FX, multisig, infra.

🧑‍💻 DEV B — ULTRA‑MICRO TASKS (STELLAR / SETTLEMENT / FX / OPS)
Dev B moves real money.
Dev B never mutates execution state.
Dev B enforces Proof‑of‑Money in reality.

📁 FILE B1 — vault_manager.ts
(Treasury vault lifecycle)

1. createVault
async function createVault(
  subnetId: Bytes32,
  auditorPubkeys: PubKey[],
  threshold: number,
  assetList: Asset[]
): Promise<VaultAddress>
Steps (MANDATORY ORDER)
Generate new Stellar keypair

Fund account with base XLM

Add each auditor as signer

Set signer weights = 1

Set thresholds:

medium = threshold

high = threshold

Remove master key

Add trustlines for each asset

Return vault address

Failure cases
insufficient base reserve

trustline limit exceeded

signer add failure

2. rotateSigner
async function rotateSigner(
  vault: Address,
  oldSigner: PubKey,
  newSigner: PubKey
)
Checks
caller authorized

vault thresholds unchanged

Steps
Add new signer

Remove old signer

Verify signer set consistency

📁 FILE B2 — treasury_snapshot.ts
(PoM dependency — read‑only)

3. getTreasurySnapshot
async function getTreasurySnapshot(
  vault: Address
): Promise<TreasurySnapshot>
Snapshot structure
type TreasurySnapshot = {
  balances: Map<Asset, bigint>,
  signers: PubKey[],
  threshold: number
}
Steps
Fetch account from Horizon

Parse balances

Normalize asset format

Extract signer list

Extract thresholds

Return snapshot

Failure cases
Horizon timeout

account missing

malformed asset

📁 FILE B3 — settlement_planner.ts
(Builds enforceable Stellar txs)

4. buildSettlementPlan
function buildSettlementPlan(
  subnetId: Bytes32,
  blockNumber: number,
  withdrawals: Withdrawal[]
): SettlementPlan
Steps
Group withdrawals by asset

Sort destinations deterministically

Decide batching strategy

Build tx templates

Attach memo = hash(subnetId || blockNumber)

Output tx list

5. buildPaymentTx
function buildPaymentTx(
  vault: Address,
  dest: Address,
  asset: Asset,
  amount: bigint,
  memo: Memo
): StellarTx
Checks
amount > 0

dest valid

asset valid

6. buildPathPaymentTx (FX)
function buildPathPaymentTx(
  vault: Address,
  dest: Address,
  sendAsset: Asset,
  sendMax: bigint,
  recvAsset: Asset,
  recvAmount: bigint,
  memo: Memo
): StellarTx
Rules
ONLY PathPaymentStrictReceive

No price assumptions

No internal FX logic

📁 FILE B4 — fx_engine.ts
(Pure Stellar DEX usage)

7. discoverPath
async function discoverPath(
  sendAsset: Asset,
  recvAsset: Asset,
  recvAmount: bigint
): Promise<Path>
Steps
Query Horizon strict‑receive endpoint

Sort by lowest sendMax

Reject if slippage > bound

8. validateFxPath
function validateFxPath(
  path: Path,
  recvAmount: bigint
): boolean
Checks
recvAmount exact

sendMax bounded

path length reasonable

📁 FILE B5 — multisig_orchestrator.ts
(PoM enforcement at signing time)

9. verifySettlementMatchesPoM
function verifySettlementMatchesPoM(
  plan: SettlementPlan,
  pomDelta: Map<Asset, bigint>
): boolean
Rule
Σ(tx.amount per asset) == pomDelta[asset]
Mismatch → HALT

10. signTx
async function signTx(
  tx: StellarTx,
  signerKey: Keypair
): StellarTx
11. collectSignatures
async function collectSignatures(
  tx: StellarTx,
  signerKeys: Keypair[],
  threshold: number
): StellarTx
Steps
Sign sequentially

Track signature count

Stop at threshold

12. submitTx
async function submitTx(tx: StellarTx): Promise<TxHash>
Steps
Submit via Horizon

Wait for SCP confirmation

Return hash

📁 FILE B6 — settlement_executor.ts
(End‑to‑end settlement)

13. executeSettlement
async function executeSettlement(
  subnetId: Bytes32,
  blockNumber: number,
  settlementPlan: SettlementPlan
)
Steps
Fetch treasury snapshot

Re‑compute PoM delta

Verify plan matches PoM

Sign txs

Submit txs

Await finality

Emit SettlementComplete event

14. Failure handling
partial tx failure → STOP

Horizon timeout → retry safe

signature refusal → STOP

📁 FILE B7 — replay_protection.ts
(Idempotency & safety)

15. isAlreadySettled
async function isAlreadySettled(
  memo: Memo
): boolean
Logic
query Horizon for memo

if found → skip

📁 FILE B8 — monitoring.ts
(Ops & alerts)

16. Alert triggers
PoM mismatch

signer count < threshold

treasury balance low

FX slippage exceeded

repeated settlement failure

