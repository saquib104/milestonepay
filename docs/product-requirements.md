# MilestonePay — Product Requirements Document

**Version:** 1.0
**Date:** 2026-10-11
**Status:** Implementation complete (pre-audit)
**Target network:** Arc Mainnet (Chain ID 5042) — production only

---

## 1. Purpose

MilestonePay lets a client and a service provider agree on a fixed-price,
milestone-structured work engagement and enforce payment releases using USDC
escrow on Arc Mainnet.

Neither party needs to trust the other to hold funds. The smart contract holds each
milestone's budget until the client approves, a dispute is resolved, or a timeout
elapses. All deliverable content, agreement text, and dispute evidence remain offchain;
only cryptographic commitments (SHA-256 hashes) are anchored onchain.

---

## 2. User Personas

### Client

A small business owner, startup founder, or product lead hiring a freelancer or small
agency for a fixed-price project.

- **Goal:** Lock funds until work is accepted. Retain the right to request changes or
  escalate disputes.
- **Technical comfort:** Familiar with MetaMask or a similar self-custody wallet.
  Has previously sent USDC on at least one EVM chain.
- **Pain point:** Wire transfers offer no payment protection; traditional escrow services
  charge 5–15% and require identity verification.

### Provider

A freelancer or small agency (1–5 people).

- **Goal:** Know payment will be released after delivering accepted work.
  Avoid non-payment risk after work is complete.
- **Technical comfort:** Same as Client — has an EVM wallet, has used USDC.
- **Pain point:** Clients delay payment or dispute without basis; chargebacks take weeks.

### Resolver

A neutral third party agreed by both client and provider before the agreement is created.
May be an individual, a professional escrow service, or a multisig wallet.

- **Goal:** Review dispute evidence and decide the outcome.
- **Role in contract:** Can call `resolveDispute` on a disputed milestone; no other power.
- **Trust warning:** The resolver can direct any disputed milestone payment to either party.
  The contract cannot verify their neutrality.

---

## 3. MVP Scope

### In Scope (v1)

- Create an agreement with one client, one provider, and up to 5 milestones.
- Fund each milestone independently using USDC ERC-20 approve + contract deposit.
- Provider submits a `bytes32` deliverable hash onchain.
- Client approves release or requests changes (configurable revision limit, 1–5, default 3).
- Client or provider can raise a dispute; a pre-designated resolver address resolves it.
- After the dispute timeout, either party can trigger the pre-agreed default outcome.
- Client can claim refund after milestone expiry (funded but not yet submitted).
- No-custody UI: app never holds private keys; all signers use their own wallets.
- Arc Mainnet USDC only (`0x3600000000000000000000000000000000000000`, 6 ERC-20 decimals).
- Offchain metadata (project titles, milestone descriptions, submission notes, evidence
  references) stored in a Postgres database via a Hono API server.
- Chain event indexer for activity history (advisory only — contract is source of truth).
- Exportable Foundry contract + deployment scripts.

### Explicit Non-Goals (v1)

- No platform fee in v1 (reserved for future, requires tax/legal analysis).
- No ERC-8183 dependency (no audited mainnet address exists; see `docs/contract-design.md`).
- No AI-controlled fund release.
- No EURC or other stablecoin.
- No token swaps, bridges, lending, yield, or cards.
- No fiat onramp.
- No ENS or human-readable names (addresses only in v1).
- No mobile wallet app (browser-only).
- No email or push notifications (offchain coordination is out of scope).
- No sub-accounts or multi-party splits.
- No upgradeable proxy pattern in v1.
- No Arc Testnet in any production UI, config file, or runtime environment.

---

## 4. Functional Requirements

### F1 — Agreement Creation

| Requirement | Detail |
|---|---|
| F1.1 | Client creates agreement onchain with: provider address, resolver address, terms hash, per-milestone amounts (USDC, 6 dec), expiry timestamps, max revisions per milestone (1–5), dispute timeout (1–90 days, default 30), and `disputeDefaultToProvider` flag |
| F1.2 | Provider and resolver addresses must be distinct from client and from each other |
| F1.3 | Maximum 5 milestones per agreement (hardcoded contract cap) |
| F1.4 | Terms text is hashed client-side (SHA-256); hash stored onchain; original document stays offchain |
| F1.5 | Offchain metadata (project title, milestone descriptions) saved to backend after onchain confirmation |

### F2 — Milestone Funding

| Requirement | Detail |
|---|---|
| F2.1 | Client approves the escrow contract for exactly the milestone amount before funding — no unlimited approvals |
| F2.2 | Client calls `fund()` which uses `transferFrom` to move USDC into escrow |
| F2.3 | Duplicate funding is blocked by contract (status must be `Pending`) |
| F2.4 | UI shows the current allowance and requires a two-step approve→fund flow |

### F3 — Deliverable Submission

| Requirement | Detail |
|---|---|
| F3.1 | Provider hashes deliverable content or reference URL client-side (SHA-256), then submits the hash onchain |
| F3.2 | Submission is only possible in `Funded` or `Revision` status and before expiry |
| F3.3 | Provider may attach a deliverable reference (IPFS URL, HTTPS URL) and note to the backend — not stored onchain |

### F4 — Client Review

| Requirement | Detail |
|---|---|
| F4.1 | Client approves release: credits USDC to provider's pending withdrawal balance (pull pattern) |
| F4.2 | Client requests changes: milestone returns to `Revision`; revision counter increments |
| F4.3 | At max revisions, `requestChanges` auto-escalates to `Disputed` and sets the dispute deadline |
| F4.4 | UI clearly shows remaining revision rounds |

### F5 — Dispute Resolution

| Requirement | Detail |
|---|---|
| F5.1 | Either party can raise a dispute on a funded, submitted, or revision milestone |
| F5.2 | Raising a dispute locks the milestone; neither party can take unilateral action |
| F5.3 | Resolver calls `resolveDispute(toProvider: bool)` to direct funds |
| F5.4 | After `disputeDeadline` passes, either party can call `claimDisputeRefund`; outcome is determined by `disputeDefaultToProvider` |
| F5.5 | Dispute evidence references (not file content) can be submitted to the backend |

### F6 — Withdrawal

| Requirement | Detail |
|---|---|
| F6.1 | Approved and resolved payments accumulate in `pendingWithdrawals[address]` |
| F6.2 | Recipients call `withdraw()` to pull their USDC |
| F6.3 | UI shows pending withdrawal balance and provides a withdraw button |

### F7 — Non-Functional

| Requirement | Detail |
|---|---|
| F7.1 | All amounts use USDC ERC-20 6-decimal interface — native 18-decimal view never used in escrow math |
| F7.2 | Chain ID checked before every write transaction |
| F7.3 | Transaction hash and Arc Explorer link shown after every submission |
| F7.4 | Contract state verified before showing completion (receipt + live read) |
| F7.5 | Duplicate submission prevented while a transaction is pending |
| F7.6 | All failure states have a user-readable recovery message |
| F7.7 | App is accessible and responsive down to 375 px viewport width |

---

## 5. Non-Requirements (explicitly ruled out)

- Arc Studio does not deploy this project to mainnet. See `docs/deployment-guide.md`.
- The contract is not labelled as audited until an independent third-party audit is complete.
- Wallet addresses are public identifiers only; they are not treated as verified legal identities.
- Private keys, seed phrases, and recovery data are never stored by the application.
- Personal details, work files, full agreement text, and dispute evidence files are never stored onchain.
