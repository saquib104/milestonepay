# MilestonePayEscrow — Contract Specification

**Contract:** `contracts/MilestonePayEscrow.sol`
**Solidity:** `^0.8.25`
**OpenZeppelin:** `ReentrancyGuard` v5.1.0
**Target chain:** Arc Mainnet (Chain ID 5042)
**USDC:** `0x3600000000000000000000000000000000000000` (6-decimal ERC-20)
**Status:** NOT INDEPENDENTLY AUDITED

---

## Trust Model

| Role | Address source | Powers |
|---|---|---|
| `client` | `msg.sender` at `createAgreement` | Fund, approveRelease, requestChanges, claimRefund |
| `provider` | Parameter at `createAgreement` | submitDeliverable, raiseDispute, claimDisputeRefund |
| `resolver` | Parameter at `createAgreement` | resolveDispute only |
| (none) | — | No owner, admin, or upgrade key. No address can seize funds. |

Resolver must be distinct from both client and provider (enforced at creation).

---

## State Machine

```
                    Pending
                       │
                    fund()
                       │
                    Funded ──────────────── raiseDispute() ──────────┐
                       │                                             │
               submitDeliverable()                                   │
               (before expiry)                                       │
                       │                                             │
                  Submitted ──────── raiseDispute() ─────────────────┤
                  /        \                                         │
    approveRelease()   requestChanges()                              │
           │              │                                          │
        Released     [count < max] → Revision → submitDeliverable() ┤
       (terminal)         │              │                           │
                    [count == max] → Disputed ←──────────────────────┘
                                       │
                            resolveDispute(bool)
                              /               \
                  releaseToProvider=true   releaseToProvider=false
                          │                         │
                       Released                  Refunded
                      (terminal)                (terminal)
                                  OR
                    after disputeDeadline: claimDisputeRefund()
                    outcome set by disputeDefaultToProvider

  Funded + after expiry: claimRefund() → Refunded (terminal)

  All "Released" credits go to pendingWithdrawals[provider]
  All "Refunded" credits go to pendingWithdrawals[client]
  Recipients call withdraw() to pull funds.
```

---

## Data Structures

### Agreement

```solidity
struct Agreement {
    address client;
    address provider;
    address resolver;
    bytes32 termsHash;              // SHA-256 of offchain agreement text
    uint8   milestoneCount;         // 1–5
    bool    active;                 // false when all milestones terminal
    uint256 disputeTimeout;         // seconds (1–90 days; default 30 days)
    bool    disputeDefaultToProvider; // timeout outcome
}
```

### Milestone

```solidity
struct Milestone {
    uint256 amount;           // USDC ERC-20 units (6 decimals)
    uint256 expiry;           // unix timestamp; claimRefund after this
    MilestoneStatus status;
    bytes32 deliverableHash;  // submitted by provider
    bytes32 reasonHash;       // change-request or dispute reason
    uint8   revisionCount;    // never decrements
    uint8   maxRevisions;     // 1–5; auto-dispute at this count
    uint256 disputeDeadline;  // unix timestamp; set when Disputed
}
```

### Enum (Solidity order matters for frontend mapping)

```solidity
enum MilestoneStatus {
    Pending,    // 0
    Funded,     // 1
    Submitted,  // 2
    Released,   // 3
    Revision,   // 4
    Disputed,   // 5
    Refunded    // 6
}
```

---

## Functions

### createAgreement

```
createAgreement(
    address provider,
    address resolver,
    bytes32 termsHash,
    uint256[] amounts,
    uint256[] expiries,
    uint8[]   maxRevisions,
    uint256   disputeTimeout,
    bool      disputeDefaultToProvider
) external returns (uint256 agreementId)
```

- Caller becomes `client`
- `resolver != client`, `resolver != provider`
- `amounts.length == expiries.length == maxRevisions.length`, 1–5 items
- `amounts[i] > 0`, `expiries[i] > block.timestamp`
- `maxRevisions[i]`: 1–5; 0 defaults to 3
- `disputeTimeout`: 0 defaults to 30 days; otherwise 1–90 days in seconds
- Emits `AgreementCreated`

### fund

```
fund(uint256 agreementId, uint8 milestoneIndex) external nonReentrant
```

- Caller must be `client`
- Milestone must be `Pending`
- Calls `usdc.transferFrom(client, address(this), amount)`
- Emits `MilestoneFunded`

### submitDeliverable

```
submitDeliverable(
    uint256 agreementId,
    uint8 milestoneIndex,
    bytes32 deliverableHash
) external
```

- Caller must be `provider`
- Status must be `Funded` or `Revision`; `block.timestamp < expiry`
- `deliverableHash != bytes32(0)`
- Emits `DeliverableSubmitted`

### approveRelease

```
approveRelease(uint256 agreementId, uint8 milestoneIndex) external
```

- Caller must be `client`; status must be `Submitted`
- Credits `pendingWithdrawals[provider] += amount`
- Checks if all milestones terminal → sets `agreement.active = false`
- Emits `PaymentReleased`

### requestChanges

```
requestChanges(
    uint256 agreementId,
    uint8 milestoneIndex,
    bytes32 reasonHash
) external
```

- Caller must be `client`; status must be `Submitted`
- If `revisionCount < maxRevisions`: `revisionCount++`, status → `Revision`, emits `ChangesRequested`
- If `revisionCount == maxRevisions`: status → `Disputed`, sets `disputeDeadline`, emits `DisputeRaised` + `DisputeDeadlineSet`

### raiseDispute

```
raiseDispute(
    uint256 agreementId,
    uint8 milestoneIndex,
    bytes32 reasonHash
) external
```

- Caller must be `client` or `provider`
- Status must be `Funded`, `Submitted`, or `Revision`
- Sets `disputeDeadline = block.timestamp + disputeTimeout`
- Emits `DisputeRaised` + `DisputeDeadlineSet`

### resolveDispute

```
resolveDispute(
    uint256 agreementId,
    uint8 milestoneIndex,
    bool releaseToProvider
) external
```

- Caller must be `resolver`; status must be `Disputed`
- If `releaseToProvider`: credits provider, status → `Released`, emits `PaymentReleased`
- Else: credits client, status → `Refunded`, emits `RefundClaimed`
- Checks all-terminal → updates `active`
- Emits `DisputeResolved`

### claimRefund

```
claimRefund(uint256 agreementId, uint8 milestoneIndex) external
```

- Caller must be `client`; status must be `Funded` (not Submitted — provider's submission blocks unilateral refund)
- `block.timestamp >= expiry`
- Credits `pendingWithdrawals[client] += amount`
- Emits `RefundClaimed`

### claimDisputeRefund

```
claimDisputeRefund(uint256 agreementId, uint8 milestoneIndex) external
```

- Caller must be `client` or `provider` (either can trigger; outcome is NOT determined by caller)
- Status must be `Disputed`; `disputeDeadline > 0`; `block.timestamp >= disputeDeadline`
- Outcome determined by `agreement.disputeDefaultToProvider`:
  - `true`: credits provider, status → `Released`
  - `false`: credits client, status → `Refunded`

### withdraw

```
withdraw() external nonReentrant
```

- Caller's `pendingWithdrawals[msg.sender]` must be > 0
- Zeroes balance before transfer (CEI)
- Calls `usdc.transfer(msg.sender, amount)`
- Emits `Withdrawn`

---

## Events

```solidity
event AgreementCreated(uint256 indexed agreementId, address indexed client,
    address indexed provider, address resolver, bytes32 termsHash, uint8 milestoneCount);
event MilestoneFunded(uint256 indexed agreementId, uint8 indexed milestoneIndex, uint256 amount);
event DeliverableSubmitted(uint256 indexed agreementId, uint8 indexed milestoneIndex, bytes32 deliverableHash);
event PaymentReleased(uint256 indexed agreementId, uint8 indexed milestoneIndex,
    address indexed recipient, uint256 amount);
event ChangesRequested(uint256 indexed agreementId, uint8 indexed milestoneIndex,
    bytes32 reasonHash, uint8 revisionCount);
event DisputeRaised(uint256 indexed agreementId, uint8 indexed milestoneIndex,
    address indexed raisedBy, bytes32 reasonHash);
event DisputeDeadlineSet(uint256 indexed agreementId, uint8 indexed milestoneIndex,
    uint256 disputeDeadline);
event DisputeResolved(uint256 indexed agreementId, uint8 indexed milestoneIndex,
    bool releaseToProvider, uint256 amount);
event RefundClaimed(uint256 indexed agreementId, uint8 indexed milestoneIndex,
    address indexed client, uint256 amount);
event Withdrawn(address indexed recipient, uint256 amount);
```

---

## Security Properties

| Property | Implementation |
|---|---|
| No reentrancy | `nonReentrant` on `fund` and `withdraw`; pull-payment pattern on all payout paths |
| CEI order | State updated before external USDC call in `fund` and `withdraw` |
| Access control | Every function checks `msg.sender` against correct role |
| No admin key | No `owner`, no `onlyOwner`, no emergency withdrawal |
| No upgradeability | No `delegatecall`, no proxy, immutable constructor |
| Integer overflow | Solidity ^0.8.25 built-in checked arithmetic |
| Zero-address guard | `usdc_` checked in constructor; provider/resolver checked in createAgreement |
| Decimal isolation | Contract only handles 6-decimal ERC-20 amounts; no `msg.value` |
| Pull payments | Eliminates blocklist-based fund lock; recipient must call `withdraw()` |
| Dispute liveness | `disputeDeadline` + `claimDisputeRefund` (callable by either party) prevents perpetual lock |

---

## Test Coverage

71 Foundry tests — all passing as of 2026-10-11.

| Category | Count |
|---|---|
| Unit tests (state machine, access control, reverts) | 61 |
| Invariant tests (escrow conservation, accounting) | 5 |
| Conservation fuzz tests | 5 |

Run: `bun run contracts:test` or `forge test --fuzz-runs 512`

---

## Audit Status

**NOT INDEPENDENTLY AUDITED.**

Internal review by Arc Studio automated tooling (4 rounds, balanced severity).
7 findings identified and resolved (see `docs/security-review.md`).

A professional third-party audit is required before mainnet deployment.
This document must not be cited as evidence of audit completion.
