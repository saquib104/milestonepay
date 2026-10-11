# MilestonePay — Contract Design Decision
# (Prompt 2 Output)

> **Status:** Design decision complete. No Solidity has been written or modified in this document.
> **Date:** 2026-10-11
> **Scope:** ERC-8183 evaluation, design decision rationale, complete contract specification.
> This document supersedes the preliminary §9 sketch in `milestonepay-plan.md`.

---

## Table of Contents

1. [ERC-8183 Evaluation](#1-erc-8183-evaluation)
2. [Design Decision](#2-design-decision)
3. [State Diagram](#3-state-diagram)
4. [Function and Permission Table](#4-function-and-permission-table)
5. [Events](#5-events)
6. [Expiry, Cancellation, Change-Request, and Dispute Rules](#6-expiry-cancellation-change-request-and-dispute-rules)
7. [Failure and Stuck-Funds Cases](#7-failure-and-stuck-funds-cases)
8. [What the Contract Enforces vs. Human Judgment](#8-what-the-contract-enforces-vs-human-judgment)
9. [Who Can Release, Refund, or Split Escrowed Funds](#9-who-can-release-refund-or-split-escrowed-funds)
10. [Security Assumptions](#10-security-assumptions)
11. [Unresolved Choices](#11-unresolved-choices)

---

## 1. ERC-8183 Evaluation

### 1.1 What the Docs Say

**Source examined:** Arc tutorial "Create your first ERC-8183 job"
(https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job),
Arc contract addresses page
(https://docs.arc.io/arc/references/contract-addresses),
and the agent-standards skill (which reproduces the normative interface).

**ERC-8183 deployment status as of 2026-10-11:**

| Network | Contract | Address | Status in official docs |
|---|---|---|---|
| Arc Testnet | AgenticCommerce reference implementation | `0x0747EEf0706327138c69792bF28Cd525089e4583` | Listed in tutorial as testnet-only |
| Arc Mainnet | AgenticCommerce | — | **Not listed anywhere in Arc's contract address docs** |

The Arc contract addresses page lists stablecoins, CCTP, Gateway, StableFX, ERC-8004 registries, wrapped assets, and DeFi contracts for mainnet. ERC-8183 does not appear in the mainnet section. The tutorial's header reads: "This quickstart guides you through the ERC-8183 job lifecycle on **Arc Testnet**." No audited mainnet address is published or inferable from authoritative documentation.

**EIP status:** ERC-8183 is a Draft EIP. The spec and the reference deployment can change without notice.

### 1.2 Can One ERC-8183 Job Represent One Milestone?

**Structurally: yes.** ERC-8183 defines one escrow budget per `jobId`. A milestone with a fixed USDC amount maps cleanly to a single job. The `budget` field, funded via `fund()`, is a single `uint256` in USDC atomic units (6 decimals) — identical to what MilestonePay needs per milestone.

**Operationally: partially.** The lifecycle Open → Funded → Submitted → Completed/Rejected/Expired covers the happy path and clean-failure path. However:

- There is no "revision requested" state between Submitted and Completed/Rejected. A provider's deliverable can only be accepted or fully rejected, not returned for rework.
- The evaluator role is trusted and final by design. It is not the same as a named third-party Resolver whose identity was agreed at contract creation time; the evaluator could be set to the client's own address, making the client the final judge — which is an asymmetric trust model the product explicitly rejects.
- `claimRefund` (called `claimRefund` in some ERC-8183 implementations, corresponding to expiry handling) requires `expiredAt` to have passed. The product needs a dispute-deadline fallback that is distinct from the milestone delivery expiry. The two timeouts serve different purposes.

### 1.3 Can Multiple Jobs Be Grouped Into One Offchain Project?

**Technically yes, via an offchain `projectHash`.** Each `createJob` call could embed the same SHA-256 project identifier in its `description` field or as a bytes32 in `hook`. Indexing by that hash would group jobs into one project.

**Consequences:**
- No single onchain transaction creates "an agreement." Agreement creation becomes N separate transactions (one per milestone job), each costing gas.
- There is no onchain proof that all N jobs were agreed to simultaneously by both parties. A client could fund milestone 1, refuse to create milestone 2, and the provider has no recourse — the agreed total is only offchain.
- The `termsHash` (the hash of the offchain agreement document, anchoring both parties' commitments) would need to be duplicated or only stored on the first job, creating a non-atomic link between terms and milestones.
- A single-contract approach that creates one Agreement record with N Milestones atomically solves all of these with one transaction and cleaner event structure.

### 1.4 Does ERC-8183's Dispute Behavior Fit This Product?

ERC-8183's documented `reject()` function:
- Can be called by the evaluator at any point from Funded onward.
- Results in a full refund to the client.
- There is no built-in provision for a split, a partial payment, or a neutral third party whose identity is agreed by both parties at job creation time and whose authority is bounded.

**What the product needs that ERC-8183 does not provide:**
- A `Revision` state (client asks for rework without rejecting).
- A `Disputed` state where neither party can unilaterally act and only the Resolver can proceed.
- A configurable dispute deadline after which a deterministic fallback applies (to prevent resolver-liveness lock).
- A `disputeDefaultToProvider` flag (agreed at creation) that determines the timeout outcome.
- Per-agreement `maxRevisions` count before auto-escalation to dispute.

### 1.5 Is There a Production-Ready ERC-8183 Contract for Arc Mainnet?

**No.** As of the documentation fetched on 2026-10-11:
- No ERC-8183 contract address appears in the Arc mainnet section of `docs.arc.io/arc/references/contract-addresses`.
- The only published address is a testnet reference implementation at `0x0747EEf0706327138c69792bF28Cd525089e4583` on Arc Testnet.
- The ERC is a Draft; the reference deployment is explicitly a quickstart tutorial target, not an audited production contract.
- Inferring that the testnet address equals a mainnet address would be factually wrong and dangerous — the two chains are distinct and the deployer controls each independently.

**Conclusion:** No production-ready ERC-8183 contract for Arc Mainnet can be verified from authoritative documentation. Any use of ERC-8183 in a mainnet deployment would require deploying and independently auditing the reference implementation, which is equivalent to or more work than deploying a custom contract with better-fit semantics.

---

## 2. Design Decision

### Decision: Custom Contract — `MilestonePayEscrow.sol`

**Rationale (summary):**

| Test | ERC-8183 | Custom contract |
|---|---|---|
| Mainnet-ready deployment verifiable | No | Yes (self-deployed after audit) |
| Revision/rework state | No | Yes |
| Named third-party Resolver agreed at creation | No (evaluator can be client) | Yes |
| Bounded dispute authority | No | Yes (resolver + dispute deadline) |
| Atomic multi-milestone agreement creation | No (one job per transaction) | Yes |
| Offchain terms hash anchored at creation | Not enforced | Yes (`termsHash`) |
| Configurable dispute timeout + default outcome | No | Yes |
| ERC-8183 compatibility risk if spec changes | High (draft EIP) | None |

**What ERC-8183 IS good for (v2 note):** Once an audited mainnet ERC-8183 deployment exists on Arc, the inner milestone lifecycle (fund/submit/complete/reject) could be delegated to it via a hook or wrapper. The custom contract's Agreement + Resolver + Revision layers would remain as the outer shell. This migration path is additive and does not require breaking changes.

**What ERC-8183 hooks ARE noted but not used in v1:** The `IACPHook.beforeAction/afterAction` hook mechanism could in theory carry the Revision state as a side-channel. But building on an undocumented hook behavior of a Draft EIP reference implementation against a testnet-only deployment is not acceptable for real-funds production use.

---

## 3. State Diagram

Each milestone has its own independent state. The diagram applies to a single milestone.

```
                    ┌─────────────────────────────────────────────┐
                    │                  PENDING                     │
                    │  Milestone created, not yet funded           │
                    └──────────────────┬──────────────────────────┘
                                       │ fund()
                                       │ [caller: client]
                                       │ [effect: USDC transferFrom client → contract]
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │                  FUNDED                      │
                    │  USDC held in escrow                         │
                    └──────┬───────────────────┬──────────────────┘
                           │                   │
          submitDeliverable│                   │ raiseDispute()
          [caller: provider│                   │ [caller: client or provider]
          before expiry]   │                   │
                           ▼                   ▼
          ┌────────────────────┐    ┌──────────────────────────────┐
          │     SUBMITTED      │    │                              │
          │  Hash onchain,     │    │         DISPUTED             │
          │  awaiting review   │    │  (see Disputed branch below) │
          └──┬──────────┬──────┘    └──────────────────────────────┘
             │          │
 approveRelease()       │ requestChanges()
 [caller: client]       │ [caller: client]
             │          │
             │          ├─ if revisionCount < maxRevisions ──────────┐
             │          │                                            │
             │          └─ if revisionCount >= maxRevisions ─────────┼──► DISPUTED
             │                                                       │
             │          ┌──────────────────────────────────────────  ▼ ──┐
             │          │                  REVISION                       │
             │          │  Provider must rework and resubmit              │
             │          └──────┬────────────────────────────────────────  ┘
             │                 │ submitDeliverable()
             │                 │ [caller: provider, before expiry]
             │                 │ [increments revisionCount]
             │                 └───────────────► SUBMITTED (loop)
             │
             ▼
  ┌──────────────────────┐
  │       RELEASED       │  ◄── resolveDispute(toProvider=true)  [caller: resolver]
  │  USDC credited to    │       [or claimDisputeRefund when disputeDefaultToProvider=true]
  │  provider's pending  │
  │  withdrawals         │
  └──────────────────────┘  [TERMINAL]


DISPUTED branch (entered from Funded, Submitted, or Revision):
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                              DISPUTED                                        │
  │  disputeDeadline = block.timestamp + agreement.disputeTimeout (1–90 days)   │
  │  Neither party can unilaterally act. Only resolver or timeout path applies.  │
  └──────┬────────────────────────────────┬─────────────────────────────────────┘
         │                                │
         │ resolveDispute(toProvider)      │ block.timestamp >= disputeDeadline
         │ [caller: resolver]              │ claimDisputeRefund()
         │                                │ [caller: client OR provider]
         ▼                                ▼
  ┌──────────────────────┐     ┌──────────────────────┐
  │       RELEASED       │     │  RELEASED or REFUNDED │
  │  or REFUNDED         │     │  per disputeDefault   │
  │  per resolver call   │     │  ToProvider flag      │
  └──────────────────────┘     └──────────────────────┘
  [TERMINAL]                   [TERMINAL]


EXPIRY path (from FUNDED only — provider never submitted):
  block.timestamp >= milestone.expiry
  claimRefund()  [caller: client]
         │
         ▼
  ┌──────────────────────┐
  │       REFUNDED       │
  │  USDC credited to    │
  │  client's pending    │
  │  withdrawals         │
  └──────────────────────┘  [TERMINAL]


WITHDRAWAL (separate from milestone state):
  withdraw()  [caller: any address with pendingWithdrawals > 0]
  → USDC transferred from contract to caller
```

**Terminal statuses:** Released, Refunded.
**Non-terminal statuses:** Pending, Funded, Submitted, Revision, Disputed.
**Payment model:** Pull-over-push. All USDC credits accumulate in `pendingWithdrawals[address]`. Recipient calls `withdraw()` to receive funds. This prevents a blocklisted or self-destructed address from permanently locking an entire milestone.

---

## 4. Function and Permission Table

### Agreement-Level Functions

| Function | Caller | Pre-condition | State Change | USDC Movement |
|---|---|---|---|---|
| `createAgreement(provider, resolver, termsHash, amounts[], expiries[], maxRevisions[], disputeTimeout, disputeDefaultToProvider)` | Anyone (becomes `client`) | provider ≠ 0, resolver ≠ 0, resolver ≠ client, resolver ≠ provider; 1–5 milestones; arrays same length; all amounts > 0; all expiries > now; disputeTimeout 1–90 days (0 = default 30 days) | Creates Agreement + N Milestone records (all Pending) | None |

### Milestone-Level Functions

| Function | Caller | Pre-condition | Effect on Milestone Status | USDC Movement |
|---|---|---|---|---|
| `fund(agreementId, milestoneIndex)` | `agreement.client` | status == Pending | → Funded | `transferFrom(client, contract, amount)` |
| `submitDeliverable(agreementId, milestoneIndex, deliverableHash)` | `agreement.provider` | status == Funded OR Revision; `block.timestamp < expiry`; deliverableHash ≠ 0 | → Submitted; stores deliverableHash | None |
| `approveRelease(agreementId, milestoneIndex)` | `agreement.client` | status == Submitted | → Released | `pendingWithdrawals[provider] += amount` |
| `requestChanges(agreementId, milestoneIndex, reasonHash)` | `agreement.client` | status == Submitted | → Revision (if revisionCount < maxRevisions); or → Disputed + set disputeDeadline (if revisionCount >= maxRevisions) | None |
| `raiseDispute(agreementId, milestoneIndex, reasonHash)` | `agreement.client` OR `agreement.provider` | status == Funded, Submitted, or Revision | → Disputed; sets `disputeDeadline = now + disputeTimeout` | None |
| `resolveDispute(agreementId, milestoneIndex, releaseToProvider)` | `agreement.resolver` | status == Disputed | → Released (if true) or → Refunded (if false) | `pendingWithdrawals[provider or client] += amount` |
| `claimRefund(agreementId, milestoneIndex)` | `agreement.client` | status == Funded; `block.timestamp >= expiry` | → Refunded | `pendingWithdrawals[client] += amount` |
| `claimDisputeRefund(agreementId, milestoneIndex)` | `agreement.client` OR `agreement.provider` | status == Disputed; disputeDeadline ≠ 0; `block.timestamp >= disputeDeadline` | → Released or Refunded per `disputeDefaultToProvider` | `pendingWithdrawals[provider or client] += amount` |

### Withdrawal

| Function | Caller | Pre-condition | Effect | USDC Movement |
|---|---|---|---|---|
| `withdraw()` | Any address | `pendingWithdrawals[msg.sender] > 0` | Zeroes balance before transfer (CEI) | `transfer(msg.sender, amount)` |

### View Functions (read-only, no restrictions)

| Function | Returns |
|---|---|
| `getAgreement(agreementId)` | Full `Agreement` struct |
| `getMilestone(agreementId, milestoneIndex)` | Full `Milestone` struct |
| `pendingWithdrawals(address)` | Claimable USDC balance |

---

## 5. Events

All events are emitted by `MilestonePayEscrow.sol`. Off-chain components (the frontend, future indexers) rely exclusively on events — no contract function is designed to iterate over storage.

```solidity
// Agreement lifecycle
event AgreementCreated(
    uint256 indexed agreementId,
    address indexed client,
    address indexed provider,
    address resolver,
    bytes32 termsHash,
    uint8 milestoneCount
);

// Milestone funding
event MilestoneFunded(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    uint256 amount
);

// Provider delivery
event DeliverableSubmitted(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    bytes32 deliverableHash
);

// Client approves — payment credited
event PaymentReleased(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    address indexed recipient,
    uint256 amount
);

// Client requests rework
event ChangesRequested(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    bytes32 reasonHash,
    uint8 revisionCount       // count AFTER this increment
);

// Dispute raised (by either party, or auto-escalated from requestChanges)
event DisputeRaised(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    address indexed raisedBy,
    bytes32 reasonHash
);

// Dispute deadline set (always emitted alongside DisputeRaised)
event DisputeDeadlineSet(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    uint256 disputeDeadline
);

// Resolver acts
event DisputeResolved(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    bool releaseToProvider,
    uint256 amount
);

// Refund credited (client expiry claim or resolver refund or dispute timeout)
event RefundClaimed(
    uint256 indexed agreementId,
    uint8 indexed milestoneIndex,
    address indexed client,
    uint256 amount
);

// Withdrawal executed
event Withdrawn(
    address indexed recipient,
    uint256 amount
);
```

**Indexing note:** `AgreementCreated` is the entry point for building a per-wallet agreement list. Filter by `client` or `provider` address. Milestone state is reconstructed by replaying `MilestoneFunded` → `DeliverableSubmitted` → `PaymentReleased` / `ChangesRequested` / `DisputeRaised` / `RefundClaimed` for each `(agreementId, milestoneIndex)` pair.

---

## 6. Expiry, Cancellation, Change-Request, and Dispute Rules

### Expiry Rules

| Condition | Who Triggers | Function | Outcome |
|---|---|---|---|
| Provider has not submitted and `block.timestamp >= milestone.expiry` | Client | `claimRefund()` | Milestone → Refunded; USDC credited to client |
| Provider has submitted (status = Submitted or Revision) and `block.timestamp >= milestone.expiry` | — | `claimRefund()` **reverts** (`InvalidMilestoneStatus`) | Client must instead use `raiseDispute()` — provider did submit |
| Dispute is open and `block.timestamp >= disputeDeadline` | Client or Provider | `claimDisputeRefund()` | Milestone → Released or Refunded per `disputeDefaultToProvider` flag |
| Dispute is open and resolver acts before `disputeDeadline` | Resolver | `resolveDispute()` | Milestone → Released or Refunded per resolver decision |

**Key invariant:** Once the provider has committed a deliverable hash onchain, the client cannot unilaterally take back the money by waiting for expiry. The provider's submission is an onchain fact. The only paths forward at that point are: approve, request changes (within revision limit), raise a dispute, or wait for dispute timeout.

### Cancellation Rules

**There is no cancellation function.** Cancellation before funding is not needed — an unfunded milestone is in `Pending` status and no USDC is held. Once funded, the only ways to return USDC to the client are:
1. Provider has not submitted: `claimRefund()` after expiry.
2. Dispute raised and resolver decides for client: `resolveDispute(toProvider=false)`.
3. Dispute raised and timeout expires with `disputeDefaultToProvider=false`: `claimDisputeRefund()`.

There is deliberately no "cancel at will" function for the client, because once the provider starts work, unilateral cancellation would harm the provider.

### Change-Request Rules

| Condition | Function | Outcome |
|---|---|---|
| `revisionCount < maxRevisions` | `requestChanges(agreementId, milestoneIndex, reasonHash)` | Milestone → Revision; revisionCount++; reasonHash stored; provider must resubmit |
| `revisionCount >= maxRevisions` | `requestChanges(...)` | Milestone → Disputed; `disputeDeadline` set; `DisputeRaised` + `DisputeDeadlineSet` emitted |
| Provider resubmits from Revision | `submitDeliverable(...)` | Milestone → Submitted again; `revisionCount` is NOT reset; it accumulates |

**maxRevisions** is set per-milestone at agreement creation (1–5; default 3 if 0 is passed). It is immutable after creation.

**revisionCount** counts the number of times the client has sent the work back. It starts at 0 and increments with each `requestChanges` call. It never decrements. When `revisionCount >= maxRevisions`, the next `requestChanges` auto-escalates to Disputed.

### Dispute Rules

| Trigger | Caller | Allowed From | Dispute Deadline |
|---|---|---|---|
| Explicit `raiseDispute()` | Client or Provider | Funded, Submitted, Revision | `now + agreement.disputeTimeout` |
| Auto-escalation via `requestChanges()` at revision limit | Client (indirectly) | Submitted | `now + agreement.disputeTimeout` |

**`disputeTimeout`** is set at agreement creation:
- If passed as 0: defaults to 30 days.
- Valid range: 1 day to 90 days.
- Immutable after creation.

**`disputeDefaultToProvider`** is set at agreement creation as a bool:
- `true`: if the dispute timeout expires, the provider gets paid. Use this when the client proposed the project scope and is more likely to cause bad-faith disputes.
- `false`: if the dispute timeout expires, the client is refunded. Use this for higher-risk engagements or first-time provider relationships.
- Immutable after creation.

**`claimDisputeRefund()`** (after timeout) is callable by either party. The caller identity does not affect the outcome — outcome is solely determined by `disputeDefaultToProvider`. This prevents either side from grief-locking the other by refusing to trigger resolution.

**Resolver authority is bounded:**
- The resolver is named at agreement creation and cannot be changed.
- The resolver can only act on milestones that are in `Disputed` status.
- The resolver can only choose between two outcomes: release to provider or refund to client.
- The resolver cannot move funds to any address other than the named client or provider.
- The resolver cannot act on milestones that are in any other status (Pending, Funded, Submitted, Revision, Released, Refunded).
- After the `disputeDeadline`, the resolver can still act if `claimDisputeRefund` has not yet been called (the status is still Disputed). Once `claimDisputeRefund` is called (status → Released or Refunded), the resolver's function reverts on `InvalidMilestoneStatus`.

---

## 7. Failure and Stuck-Funds Cases

This section inventories every scenario where USDC could become inaccessible or permanently locked, and the mitigation for each.

| Scenario | Without mitigation | Mitigation in this design |
|---|---|---|
| **Resolver wallet is lost or unresponsive** | Disputed milestone locked forever | `claimDisputeRefund()` after `disputeDeadline` (1–90 days) unlocks via `disputeDefaultToProvider` policy |
| **Provider never submits before expiry** | Client's funds locked until expiry | `claimRefund()` after `milestone.expiry` |
| **Client raises dispute in bad faith then ignores resolver** | If resolver acts, resolves fairly. If resolver also ignores, fallback fires | `claimDisputeRefund()` after `disputeDeadline` |
| **Provider raises dispute in bad faith to block expiry refund** | If `claimRefund()` precedes dispute: refund succeeds. If dispute precedes expiry: timeout fallback applies per `disputeDefaultToProvider` | The `claimRefund()` function only works from `Funded` status; once provider submits, `raiseDispute` is the only path, and `disputeDefaultToProvider` determines the timeout outcome |
| **Client refuses to call `claimDisputeRefund` when `disputeDefaultToProvider=false`** | Provider cannot recover | Either party can call `claimDisputeRefund` — caller identity does not affect outcome |
| **Provider refuses to call `claimDisputeRefund` when `disputeDefaultToProvider=true`** | Client cannot recover | Either party can call `claimDisputeRefund` |
| **Recipient address is USDC-blocklisted** | Direct push-payment `transfer()` reverts, locking milestone | Pull-over-push: `pendingWithdrawals` credit cannot revert; only the recipient's own `withdraw()` fails, and only for them. All other milestones and all other parties are unaffected |
| **Contract receives USDC via `msg.value` (native)** | Could mix native and ERC-20 balances | No `receive()` or `fallback()` implemented; any native transfer attempt reverts |
| **Resolver sends funds to wrong party by mistake** | Irreversible | The resolver can only address `agreement.provider` or `agreement.client`; no third address is possible in the resolver path |
| **Agreement has milestones that are never funded** | Unfunded milestones stay Pending forever | No USDC is held for Pending milestones; they do not lock anything |
| **Client double-approves release** | Would double-pay provider | After first `approveRelease`, status → Released (terminal); second call reverts on `InvalidMilestoneStatus` |

**One remaining acknowledged risk (not mitigable in the contract):**
The Resolver is a trusted human or multisig. If the Resolver colludes with one party, they can direct funds to that party despite a legitimate dispute from the other. This is disclosed in the UI. The contract cannot prevent collusion; it can only ensure the Resolver acts within their bounded authority (choose between two known parties, no other destinations).

---

## 8. What the Contract Enforces vs. Human Judgment

### Enforced by the contract (trustless)

- That USDC is held in escrow until a terminal state is reached.
- That only the named client can fund, approve, request changes, or expiry-refund.
- That only the named provider can submit a deliverable.
- That only the named resolver can decide a dispute outcome, within the named parties.
- That a deliverable hash is onchain before approval can happen.
- That the revision counter is accurate and the escalation threshold is honored.
- That the dispute deadline is set atomically when the dispute is raised.
- That the timeout outcome follows `disputeDefaultToProvider` regardless of who calls it.
- That no address can receive more than their credited amount.
- That reentrancy cannot drain the contract (pull-payment pattern + ReentrancyGuard on `fund` and `withdraw`).
- That USDC amount arithmetic uses 6-decimal ERC-20 units exclusively.

### Requires human judgment (NOT enforced by the contract)

- Whether the deliverable content (behind the hash) actually meets the agreed specification. The contract stores a hash; it cannot read the file.
- Whether the resolver makes a fair decision. The resolver is a named human or multisig, not a neutral oracle. Their decision is final and cannot be appealed onchain.
- Whether the offchain terms document (whose hash is stored as `termsHash`) is legally enforceable in the parties' jurisdictions.
- Whether the agreed expiry timestamps give the provider enough time to do the work.
- Whether `maxRevisions` and `disputeDefaultToProvider` were negotiated fairly before signing.
- Whether the resolver's wallet is actually controlled by a neutral party, not by the client or provider.

### What "trustless" means in this context

The escrow logic is trustless: the contract does exactly what it says with the USDC. The *outcome* — whether the provider gets paid or the client gets a refund — is not trustless when a dispute is involved, because the resolver is a human. This is disclosed prominently in the design and must be disclosed in the frontend UI. The product should never be described as fully trustless arbitration.

---

## 9. Who Can Release, Refund, or Split Escrowed Funds

There is no split function. Funds are always entirely released to one party or the other.

| Action | Who can trigger | Conditions |
|---|---|---|
| Release to provider | Client (via `approveRelease`) | Milestone in Submitted status |
| Release to provider | Resolver (via `resolveDispute(true)`) | Milestone in Disputed status |
| Release to provider | Client or Provider (via `claimDisputeRefund`) | Disputed; `disputeDefaultToProvider=true`; after `disputeDeadline` |
| Refund to client | Client (via `claimRefund`) | Milestone in Funded status; after `milestone.expiry` |
| Refund to client | Resolver (via `resolveDispute(false)`) | Milestone in Disputed status |
| Refund to client | Client or Provider (via `claimDisputeRefund`) | Disputed; `disputeDefaultToProvider=false`; after `disputeDeadline` |

**Nobody else.** The contract has no owner, no admin, no upgradeability, no `selfdestruct`. No address other than `agreement.client` or `agreement.provider` can ever receive funds from a specific milestone.

---

## 10. Security Assumptions

The following assumptions must hold for the contract to behave as intended. They are documented here so that auditors, users, and integrators understand the trust model explicitly.

| # | Assumption | What breaks if false |
|---|---|---|
| SA-1 | USDC at `0x3600000000000000000000000000000000000000` behaves as a standard ERC-20 with no reentrancy callbacks | Reentrancy guard and CEI mitigate this; standard Arc USDC has no nonstandard callbacks |
| SA-2 | The resolver address is controlled by a neutral party, not by the client or provider | Resolver collusion; one party gets all disputed funds regardless of merit |
| SA-3 | The resolver wallet is not lost, stolen, or abandoned for longer than `disputeTimeout` | Funds sit in Disputed until `disputeDeadline`; then `claimDisputeRefund` fires per `disputeDefaultToProvider` |
| SA-4 | Block timestamps on Arc are accurate within the granularity used (milestones use day-scale expiries) | Timestamp manipulation by validators is bounded by network rules; irrelevant for day-scale deadlines |
| SA-5 | The off-chain document whose SHA-256 hash is stored as `termsHash` is accessible to both parties throughout the agreement | If the document is lost, the hash is unverifiable; the contract still executes but the offchain enforceability is weakened |
| SA-6 | Both parties hash the same document and compare the hash before the client calls `createAgreement` | If provider accepts the wrong `termsHash`, the agreed terms are ambiguous offchain |
| SA-7 | Arc Mainnet's USDC ERC-20 address does not change after deployment | The address is passed to the constructor and immutable; re-deployment would be required if the address changed. Currently confirmed as `0x3600000000000000000000000000000000000000` from official docs. |
| SA-8 | The contract is deployed at a known address and that address is not a proxy pointing to different logic | No upgradeability in this contract; verified source code on Arc explorer is the source of truth |
| SA-9 | `pendingWithdrawals` credits are not lost if the contract is redeployed | A redeployment creates a new contract at a new address; any unclaimed `pendingWithdrawals` in the old contract would require a migration. This is a known operational risk of immutable contracts. |

---

## 11. Unresolved Choices

The following items are noted as implementation-time decisions that do not require a new design round, but should be explicitly confirmed before the frontend is built:

| # | Item | Current contract choice | Frontend implication |
|---|---|---|---|
| UC-1 | `disputeDefaultToProvider` UX label | Bool stored onchain | UI must explain clearly: "If no one resolves this dispute within [X days], who should receive the funds?" with two radio options and plain-English explanation of risk |
| UC-2 | Default `maxRevisions` in the frontend | Default 3 if createAgreement receives 0 for a given milestone | UI form should pre-fill 3 and allow 1–5 |
| UC-3 | Default `disputeTimeout` in the frontend | Default 30 days if 0 is passed | UI form should pre-fill 30 days and allow 1–90 days |
| UC-4 | Deliverable hash format | `bytes32` keccak256 of any content | UI should hash the deliverable client-side (browser `crypto.subtle.digest` on a file or a URL string) and display the hex |
| UC-5 | Terms hash format | `bytes32` stored as-is | UI should hash the terms document client-side and display the hex before the client calls `createAgreement`; both parties should be shown the hash for comparison |
| UC-6 | Resolver identity disclosure | Named address in `Agreement` struct, readable onchain | UI should show the resolver address on every dispute screen with a plain-English label: "This is not an automated system. The resolver is a human whose decision is final." |
| UC-7 | `withdraw()` UX | Separate pull step after approval/refund | UI should show a "Withdraw available USDC" button whenever `pendingWithdrawals[connectedAddress] > 0` |
| UC-8 | Gas estimation for `createAgreement` | Single transaction creates all milestone records | For 5 milestones, gas is higher than for 1; UI should warn that agreement creation involves one on-chain transaction covering all milestones |

---

*End of contract design decision. No Solidity was written or modified in this document.*
*The existing `MilestonePayEscrow.sol` already implements this specification as of Prompt 1.*
*The contract is ready for a third-party audit engagement.*
