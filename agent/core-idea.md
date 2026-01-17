📅 DAY 0 (PRE‑WORK — 2 HOURS MAX)
BOTH (Together, live)
Output: interfaces.md (IMMUTABLE)

Lock these EXACTLY:

State root byte layout
Hash algo (SHA256)
Leaf prefixes (BAL, WD)
Asset canonical encoding
PoM delta schema

Memo format (SHA256(subnet_id||block)[0..28])

TreasurySnapshot JSON schema

🚨 After this → NO CHANGES ALLOWED

📅 DAY 1 — EXECUTION CORE (NO STELLAR)
🧠 DEV A (Execution + Soroban)
Goal: Deterministic execution works standalone

Tasks
Implement SubnetFactory

create_subnet

register_treasury

Implement ExecutionContract

credit

debit

transfer

request_withdrawal

Implement storage

balances

withdrawal queue

nonce

Deliverable (EOD)
Soroban contracts compile

Unit tests:

balance changes

withdrawal deducts balance

NO PoM yet

⚔️ DEV B (Infra prep)
Goal: Stellar environment ready

Tasks
Stellar testnet setup

Vault creation script

Multisig config tested manually

Trustlines added

Deliverable (EOD)
Working multisig vault on testnet

Vault address handed to Dev A

📅 DAY 2 — STATE ROOTS + AUDITABILITY
🧠 DEV A
Goal: State → cryptographic truth

Tasks
Implement compute_state_root

balance leaves

withdrawal leaves

sorting

merkle root

Golden test vectors

same state → same root

reordered input → same root

Deliverable (EOD)
Deterministic root verified across runs

Root spec locked forever

⚔️ DEV B
Goal: Read‑only money view

Tasks
Implement getTreasurySnapshot

Normalize assets

Return balances + signers + threshold

Deliverable (EOD)
Snapshot JSON matches interface

Used by Dev A locally

📅 DAY 3 — PROOF OF MONEY (CORE DAY)
🧠 DEV A (MOST IMPORTANT DAY)
Goal: PoM is airtight

Tasks
Implement:

compute_net_outflow

check_solvency

check_constructibility

check_authorization

Implement pom_validate

Failure enums + revert reasons

Unit tests:

insolvent state

fake withdrawals

signer mismatch

Deliverable (EOD)
PoM rejects bad states

PoM accepts valid ones

PoM is FINAL

⚔️ DEV B
Goal: Settlement logic skeleton

Tasks
Implement buildSettlementPlan

Implement buildPaymentTx

Memo injection logic

Deterministic ordering

Deliverable (EOD)
XDR txs built (not submitted)

Matches PoM delta exactly

📅 DAY 4 — COMMITMENT + SETTLEMENT LINK
🧠 DEV A
Goal: On‑chain validity gate

Tasks
Implement commit_state

Signature verification

PoM enforced inside commit

Block monotonicity

Deliverable (EOD)
State commits accepted/rejected correctly

⚔️ DEV B
Goal: Real money movement

Tasks
Implement multisig signing

Implement submit + await finality

Replay protection (memo scan)

Deliverable (EOD)
Funds move on Stellar testnet

Idempotent submission

📅 DAY 5 — FX + EDGE CASES
🧠 DEV A
Goal: Execution safety

Tasks
Withdrawal queue edge cases

Duplicate prevention

Max queue bounds

Negative balance impossible proofs

⚔️ DEV B
Goal: FX correctness

Tasks
Path discovery (strict-receive)

Slippage bounds

FX settlement txs

Deliverable (EOD)
FX withdrawal works on testnet

📅 DAY 6 — END‑TO‑END RUNS
BOTH (Together)
Goal: System actually works

Full flow (repeat until boring)
Create subnet

Credit balances

Request withdrawals

Compute state root

Commit root

Build settlement

Sign + submit

Verify L1 balances

Deliverable (EOD)
3 clean successful runs

1 forced failure run (PoM halt)

📅 DAY 7 — FREEZE & DEMO
BOTH
Goal: No more code changes

Tasks
Remove debug logs

Add invariant comments

Write:

README.md

FLOW.md

Record demo steps

Tag release

Final Deliverable
Working Astraeus on Stellar testnet

