ASTRAEUS
A Proof‑of‑Money Settlement Layer for Parallel Financial Execution on Stellar
Abstract
Stellar is optimized for final settlement, not for high‑frequency or private financial execution. Modern financial systems—payroll engines, DAOs, exchanges, internal treasuries—require fast, private, stateful computation while retaining the guarantees of on‑chain money.

Astraeus introduces a parallel execution architecture anchored to Stellar, where computation occurs in isolated on‑chain subnets while money safety is enforced purely by liquidity constraints, not execution correctness.

The protocol replaces traditional fraud proofs or validity proofs with a stronger invariant: no execution may settle unless it is provably payable by real on‑chain funds. This invariant is formalized as Proof of Money (PoM).

1. Motivation
1.1 The Limits of Smart Contract L1s
Layer‑1 blockchains attempt to simultaneously provide:

Execution

Ordering

Settlement

Storage

Privacy

This leads to unavoidable tradeoffs:

Low throughput

High fees

Public state

Global contention

Stellar intentionally avoids this trap by focusing on settlement correctness.

However, this leaves a gap:
Where should complex financial logic live if not on L1?

1.2 Why Rollups Are Insufficient
Rollups aim to prove execution correctness.

This requires:

Complex proof systems

Heavy cryptography

Tight coupling between execution semantics and settlement

For financial systems, this is unnecessary.

Banks, clearing houses, and payment networks do not prove execution correctness.
They prove liquidity sufficiency.

2. Core Insight
Money safety does not require execution correctness.
It requires settlement enforceability.

If an execution system can only extract money that already exists on L1, then:

Incorrect execution cannot cause insolvency

Malicious execution cannot mint funds

Bugs reduce liveness, not safety

Astraeus formalizes this principle.

3. System Overview
Astraeus consists of:

Parallel Execution Subnets

Run financial logic (payroll, transfers, batching)

Maintain private internal state

Produce deterministic commitments

Settlement Layer (Stellar)

Holds real assets

Enforces multisig authorization

Provides finality via SCP

Proof of Money (PoM)

A liquidity‑based settlement constraint

Independent of execution correctness

4. Formal Model
4.1 Assets and Reality
Let Stellar define the ground truth:

T
=
{
(
a
1
,
b
1
)
,
(
a
2
,
b
2
)
,
…
 
}
T={(a 
1
​
 ,b 
1
​
 ),(a 
2
​
 ,b 
2
​
 ),…}
Where:

a
i
a 
i
​
  is an asset (XLM, issued assets)

b
i
∈
Z
≥
0
b 
i
​
 ∈Z 
≥0
​
  is its balance in stroops

This state is objectively real.

4.2 Execution Claims
Execution subnets produce:

Internal balances (opaque to Stellar)

A withdrawal queue

Withdrawals are:

W
=
{
w
1
,
w
2
,
…
,
w
n
}
W={w 
1
​
 ,w 
2
​
 ,…,w 
n
​
 }
Each withdrawal:

w
j
=
(
a
j
,
x
j
,
d
j
)
w 
j
​
 =(a 
j
​
 ,x 
j
​
 ,d 
j
​
 )
Where:

a
j
a 
j
​
  is the asset

x
j
>
0
x 
j
​
 >0 is the amount

d
j
d 
j
​
  is the destination address

These are claims, not money.

5. Proof of Money (PoM)
5.1 Definition
For each asset 
a
a, define net outflow:

Δ
(
a
)
=
∑
w
j
∈
W
,
 
w
j
.
a
=
a
x
j
Δ(a)= 
w 
j
​
 ∈W,w 
j
​
 .a=a
∑
​
 x 
j
​
 
PoM requires:

∀
a
:
Δ
(
a
)
≤
T
(
a
)
∀a:Δ(a)≤T(a)
5.2 Interpretation
PoM does not prove balances are correct

PoM does not prove execution was fair

PoM proves execution is payable

This is sufficient for settlement safety.

6. State Commitment
6.1 State Roots
Each execution epoch produces a state root:

R
=
H
(
B
,
W
,
n
)
R=H(B,W,n)
Where:

B
B = internal balances

W
W = withdrawal queue

n
n = monotonically increasing nonce

The hash is SHA‑256, chosen for compatibility with Stellar tooling and deterministic cross‑language computation.

6.2 Purpose of State Roots
State roots:

Bind withdrawals to a specific execution snapshot

Prevent history rewriting

Enable replay protection

The settlement layer never interprets internal state—only commits to it.

7. Settlement Mechanics
7.1 Vault Model
All funds are held in a Stellar vault account:

Protected by multisig

Controlled by independent signers

Threshold > 50%

No execution node can move funds alone.

7.2 Transaction Construction
For each asset:

If native → Payment

If issued → Payment

If FX required → PathPaymentStrictReceive

Each transaction:

Encodes (subnet_id, block_number) into the memo

Is deterministic given PoM delta

Fails atomically if constraints are violated

8. Determinism and Replay Protection
Each settlement is bound to:

memo
=
first
28
(
H
(
subnet_id
 
∥
 
block_number
)
)
memo=first 
28
​
 (H(subnet_id∥block_number))
This ensures:

No double settlement

No cross‑subnet confusion

Full traceability

9. Security Model
9.1 Trust Assumptions
Stellar consensus is honest‑majority

Hash functions are collision‑resistant

Multisig signers are independent

No assumptions about:

Execution honesty

Sequencer correctness

Auditor benevolence

9.2 Attack Analysis
Attack	Outcome
Fake balances	Blocked by PoM
Invent withdrawals	Blocked by PoM
Replay attack	Blocked by memo
Malicious sequencer	Funds safe
Buggy execution	Liveness loss only
There is no attack path to insolvency.

10. Privacy Properties
Internal balances never touch L1

Withdrawals reveal only net flows

No per‑user accounting on Stellar

Privacy is achieved structurally, not cryptographically.

11. Comparison to Rollups
Property	Rollups	Astraeus
Proves execution	Yes	No
Proves solvency	Indirect	Direct
Cryptographic complexity	High	Low
Failure mode	Funds frozen	Funds safe
Suitable for finance	Mixed	Native
Astraeus optimizes for financial truth, not computational truth.

12. Design Philosophy
Astraeus follows one rule:

Execution may be wrong.
Money must never be.

Everything else is subordinate.

13. Conclusion
Astraeus reframes blockchain scalability:

Stellar becomes a settlement court

Execution becomes parallel and private

Security reduces to liquidity mathematics

By replacing execution proofs with Proof of Money, Astraeus achieves a simpler, stronger, and more realistic model for financial systems.