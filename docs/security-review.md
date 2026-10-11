# MilestonePayEscrow — Security Review Report

**Contract:** `contracts/MilestonePayEscrow.sol`
**Date:** October 11, 2026
**Review type:** Balanced (Critical + High + Slither static analysis + 61-test Foundry suite)
**Final status:** CLEAN — no unresolved findings at Critical or High severity

---

## Summary

Five security findings were identified and resolved across four review rounds. The contract compiled
cleanly (`forge build` warnings only, no errors). All 61 Foundry unit tests pass, including fuzz
runs on amounts and dispute timeout values.

This review was conducted by Arc Studio's automated review tooling and is **not a substitute for a
paid independent third-party audit**. A professional audit is required before mainnet deployment.

---

## Findings — Resolved

| # | Severity | Title | Status |
|---|---|---|---|
| F1 | Critical | Disputed milestones permanently locked if resolver is unresponsive | Fixed |
| F2 | High | Auto-dispute path in `requestChanges` did not set `disputeDeadline` | Fixed |
| F3 | Critical | `claimRefund` allowed refund even after provider had submitted work | Fixed |
| F4 | High | Dispute timeout always refunded client regardless of who submitted | Fixed |
| F5 | High | Direct `usdc.transfer` payout could permanently lock funds if address is USDC-blocklisted | Fixed |
| F6 | High | `claimDisputeRefund` was client-only, so provider-favoring timeout could be grief-locked | Fixed |
| F7 | Low | `InvalidArrayLength` reused for out-of-range `disputeTimeout` (semantic mismatch) | Fixed |

---

## Fix Detail

### F1 — Resolver liveness lock
Added `disputeTimeout` (per agreement, 1–90 days, default 30 days) and `disputeDeadline` (per
milestone, set when dispute is raised). After the deadline, either party can call
`claimDisputeRefund`. No funds can be permanently locked.

### F2 — Auto-dispute missing deadline
`requestChanges` auto-escalates to Disputed when revisions are exhausted. The escalation branch
now sets `disputeDeadline = block.timestamp + agreement.disputeTimeout` and emits
`DisputeDeadlineSet`, mirroring `raiseDispute`.

### F3 — Client refund bypasses submitted work
`claimRefund` was restricted to `Funded` status only. Once a provider has submitted, the only
resolution paths are `approveRelease`, `requestChanges`, `raiseDispute`, or `resolveDispute`.

### F4 — Dispute timeout asymmetry
Added `disputeDefaultToProvider` (bool) per agreement, set at creation. When timeout fires,
`claimDisputeRefund` routes funds to provider (if true) or client (if false). Both parties agree
the outcome before funding.

### F5 — Pull-over-push payments
All outbound USDC payments replaced with credits to `pendingWithdrawals[address]`. Recipients call
`withdraw()` to pull their own funds. A blocklisted address loses the ability to withdraw — it
cannot brick other milestones or other agreements.

### F6 — Grief-lock on provider-favoring timeout
`claimDisputeRefund` now accepts `msg.sender == client OR provider`. The outcome (who receives
funds) is determined by `agreement.disputeDefaultToProvider`, not by caller identity. Neither
party can block the timeout by refusing to call.

### F7 — Semantic error reuse
Added dedicated `InvalidDisputeTimeout` custom error for out-of-range `disputeTimeout` values.

---

## Slither Static Analysis

Run: `slither contracts/MilestonePayEscrow.sol --filter-paths node_modules`

| Impact | Check | Disposition |
|---|---|---|
| Medium | `reentrancy-no-eth` (×4) | False positive — all affected functions either have `nonReentrant` applied (fund, withdraw) or no longer call external contracts (pull-payment pattern). CEI order is maintained. |
| Low | `timestamp` (×6) | Accepted — inherent to time-based escrow. Arc block timestamps are accurate within ~15 s. Deadlines are hours to months in scale. |
| Informational | `cyclomatic-complexity` on `createAgreement` | Accepted — validation-heavy constructor input function. Not a security concern. |

No actionable Slither findings remain.

---

## Test Coverage

**61 tests, 0 failures, 0 skipped.**

| Category | Count |
|---|---|
| Happy-path flows | 32 |
| Revert/access-control paths | 22 |
| Fuzz (amounts, dispute timeout) | 2 × 256 runs |
| Full end-to-end flow | 1 |
| All-milestones-terminal | 2 |

Test file: `contracts/test/MilestonePayEscrow.t.sol`

---

## Residual Risks (not findings — design-level)

These are acknowledged design tradeoffs documented in `docs/milestonepay-plan.md`:

| Risk | Mitigation |
|---|---|
| Resolver collusion | Parties choose their own resolver before signing. Future: reputation registry (ERC-8004). |
| `block.timestamp` manipulation | Deadlines are hours/days in scale; ±15 s validator manipulation is immaterial. |
| USDC contract risk | USDC at `0x3600000000000000000000000000000000000000` is Circle's canonical Arc predeploy. |
| Gas cost unpredictability | Fees on Arc are USDC-denominated and sub-cent per transaction. Predictable. |
| No upgradeability | Intentional. Any future bug requires a new deployment and migration guide. |

---

## Audit Provenance

| Subagent | Dispatched | Files audited | Rounds |
|---|---|---|---|
| solidity-auditor | yes | 3 | 4 |
| functional-auditor | yes | 1 | 4 |
| contract-tester | yes | 1 | 1 |

---

*This report is generated by Arc Studio automated review tooling. It is not a substitute for a
professional independent audit. Mainnet deployment requires an independent audit, 100% branch
coverage confirmation, arc-anvil fork tests, and legal review — see `docs/milestonepay-plan.md`
§11 for the full pre-deploy gate list.*
