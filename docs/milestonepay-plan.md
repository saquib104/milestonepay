# MilestonePay — Implementation Plan and Product Specification

> **Status:** Pre-implementation plan. No code, contract, or deployment has been produced yet.
> **Date:** 2026-10-11
> **Arc network target:** Arc Mainnet (chain ID 5042) — production only.
> Arc Studio does not submit mainnet transactions. The deployment package will be prepared for manual execution outside Studio after all security gates are met.

---

## Table of Contents

1. [Product Purpose](#1-product-purpose)
2. [User Personas](#2-user-personas)
3. [User Journeys](#3-user-journeys)
4. [MVP Scope and Non-Goals](#4-mvp-scope-and-non-goals)
5. [ERC-8183 Fitness Assessment](#5-erc-8183-fitness-assessment)
6. [Technical Architecture](#6-technical-architecture)
7. [Stablecoin Decision](#7-stablecoin-decision)
8. [Arc EVM Considerations](#8-arc-evm-considerations)
9. [Smart Contract Design](#9-smart-contract-design)
10. [File and Documentation Plan](#10-file-and-documentation-plan)
11. [Visual Design Direction (Prompt 4 Preview)](#11-visual-design-direction)
12. [Unresolved Decisions and Risks](#12-unresolved-decisions-and-risks)
13. [Mainnet Deployment Handoff Plan](#13-mainnet-deployment-handoff-plan)
14. [Explicitly Invented-Nothing Declaration](#14-explicitly-invented-nothing-declaration)

---

## 1. Product Purpose

MilestonePay lets a client and a service provider agree on a fixed-price, milestone-structured work agreement and enforce payment releases onchain with USDC escrow on Arc Mainnet.

Neither party needs to trust the other to hold funds. The smart contract holds each milestone's budget until the client approves or a mutually agreed dispute resolution path concludes. All deliverable content, agreement text, and dispute evidence remain offchain; only cryptographic commitments (hashes) are anchored onchain.

---

## 2. User Personas

### Persona A — The Client

A small business owner, startup founder, or product lead hiring a freelancer or small agency for a fixed-price project. Examples: a fintech company commissioning a UI design sprint; a startup hiring a two-person dev shop for a three-milestone MVP.

**Goals:** Know funds are locked until work is accepted. Retain the right to request changes or escalate disputes without losing deposit rights.
**Technical comfort:** Familiar with MetaMask or a similar self-custody wallet. Has previously sent USDC on at least one EVM chain.
**Pain point:** Wire transfers or PayPal offer no payment protection; existing escrow services charge 5–15% and require identity verification.

### Persona B — The Provider

A freelancer or small agency (1–5 people). Examples: an independent Solidity developer; a two-person brand design studio; a solo technical writer.

**Goals:** Know payment will be released promptly after delivering accepted work. Avoid the risk of non-payment after work is complete.
**Technical comfort:** Same as Client — has an EVM wallet, has used USDC before.
**Pain point:** Clients delay payment or dispute without basis; chargebacks on traditional platforms take weeks.

---

## 3. User Journeys

### Journey 1 — Happy Path

```
[Both parties off-app]
Client and Provider agree on scope, deliverables per milestone, and total price.
They exchange wallet addresses.

[Client — app]
1. Connect wallet (Arc Mainnet).
2. Create a new Agreement:
   - Enter Provider's wallet address.
   - Enter milestone titles, amounts, and expiry timestamps.
   - Review and confirm terms hash (SHA-256 of an offchain agreement document).
3. Approve USDC allowance for the contract (ERC-20 approve).
4. Fund Milestone 1 into escrow (contract call: fund).
   → UI shows "Milestone 1 Funded — awaiting delivery."

[Provider — app]
5. Connect wallet. View open agreements where they are the provider.
6. Work on deliverable offchain.
7. Submit completion for Milestone 1:
   - Paste or upload a deliverable document (hashed client-side).
   - Submit the hash onchain (contract call: submitDeliverable).
   → UI shows "Milestone 1 Submitted — awaiting client review."

[Client — app]
8. Review submission (offchain deliverable link/hash visible in UI).
9. Approve payment:
   → Contract releases escrowed USDC to Provider wallet.
   → Client may fund Milestone 2 in the same flow if desired.

Repeat for each milestone.
```

### Journey 2 — Client Requests Changes

```
After Provider submits, Client reviews and finds the deliverable incomplete.

[Client — app]
1. Mark deliverable as "Changes Requested" with an onchain reason hash.
   → Status returns to "In Progress."

[Provider — app]
2. Sees change request. Updates deliverable offchain.
3. Re-submits hash onchain.

[Client]
4. Reviews and approves — or escalates to dispute.
```

### Journey 3 — Dispute Path

```
Client and Provider cannot agree after a configurable number of resubmissions,
OR expiry approaches without resolution.

[Either party — app]
1. Raise a Dispute (contract call: raiseDispute).
   → Milestone status locks; neither party can unilaterally release funds.
   → Contract emits DisputeRaised event with timestamp.

[Off-app]
2. Resolution process (see UNRESOLVED DECISIONS — arbitration method).
   Placeholder: the only MVP option is a mutually agreed resolution address
   (a third wallet both parties designated as Resolver at agreement creation time).

[Resolver wallet — app or direct contract call]
3. Call resolveDispute(milestoneId, releaseToProvider | refundToClient).
   → Contract releases funds accordingly.

NOTE: The identity and authority of the Resolver are NOT enforced beyond
address-matching in the contract. Real arbitration off-chain is out of scope for v1.
```

### Journey 4 — Expiry / Abandonment

```
If Provider has not submitted by the milestone expiry timestamp:

[Client — app]
1. Call claimRefund for that milestone.
   → Contract returns escrowed USDC to Client.
   → Agreement marked as expired for that milestone.
```

---

## 4. MVP Scope and Non-Goals

### In Scope (v1)

- Create an Agreement with one Client, one Provider, and up to 5 milestones.
- Fund each milestone independently using USDC ERC-20 approve + contract deposit.
- Provider submits a `bytes32` deliverable commitment onchain.
- Client approves release or requests changes (up to a configurable revision limit — **PLACEHOLDER: needs decision, see §12**).
- Client or Provider can raise a dispute; a pre-designated Resolver address can release or refund.
- Client can claim refund after milestone expiry.
- No-custody UI: the app never holds private keys; all signers use their own wallets via wagmi/ConnectKit.
- Arc Mainnet USDC only (`0x3600000000000000000000000000000000000000`, 6 ERC-20 decimals).
- Exportable Foundry contract + deployment scripts.
- Deployable frontend (React + Vite) that works as a static site.

### Explicit Non-Goals (v1)

- No platform fee collected by MilestonePay in the contract (fees require tax/legal analysis — **PLACEHOLDER**).
- No ERC-8183 dependency in v1 (see §5 for reasoning).
- No ERC-8004 agent identity registration.
- No AI-controlled fund release.
- No EURC or other stablecoin (single stablecoin reduces surface area and audit scope).
- No token swaps, bridges, lending, yield, or cards.
- No fiat onramp.
- No ENS or human-readable names (addresses only in v1).
- No mobile wallet app; browser-only.
- No email or push notifications (offchain coordination is out of scope).
- No sub-accounts or multi-party splits.
- No upgradeable proxy pattern in v1 (adds complexity and risk without proven need).
- No off-chain indexer or subgraph (v1 reads state directly from the contract).

---

## 5. ERC-8183 Fitness Assessment

### What ERC-8183 Provides

ERC-8183 (Agentic Commerce) defines an escrowed job protocol with three roles: Client (creates + funds), Provider (submits work), and Evaluator (completes or rejects). The reference implementation is deployed at `0x0747EEf0706327138c69792bF28Cd525089e4583` on **Arc Testnet only**.

The state machine is: Open → Funded → Submitted → Completed | Rejected | Expired.

### Fit vs. Gap Analysis

| MilestonePay Requirement | ERC-8183 Coverage | Gap |
|---|---|---|
| Escrow USDC until acceptance | ✓ Covered by fund/complete/refund cycle | — |
| Multiple milestones per agreement | ✗ One budget per Job ID | Must manage multiple Job IDs per agreement or build a wrapper |
| Client-initiated change requests (not full rejection) | ✗ Only complete or reject | Needs custom state |
| Revision limit before forced dispute | ✗ Not in spec | Custom logic needed |
| Named Resolver distinct from Evaluator | Partial — Evaluator is trusted + final, but has no built-in dispute escalation | Would need overloading the Evaluator role |
| Offchain terms hash anchored to agreement | ✗ description field is a plain string, not a hash commitment | Can pack into description but not enforced |
| Agreement-level (not job-level) identity | ✗ Jobs are independent | Requires an outer Agreement contract |
| Mainnet-ready deployment | ✗ Reference deployment is testnet-only; no audited mainnet address is published | Cannot rely on external deployment |

### Decision

**ERC-8183 is NOT used as the runtime contract for v1.** Reasons:

1. **No audited mainnet deployment exists.** The tutorial explicitly targets Arc Testnet. Using an unaudited, testnet-only reference contract for real funds is unacceptable without a separate audit engagement that is out of scope for v1.
2. **Multi-milestone shape requires an outer wrapper.** The structural mismatch (one escrow per Job vs. one Agreement with N milestones) would mean building a non-trivial wrapper contract anyway — at which point a purpose-built contract is simpler and auditable on its own terms.
3. **Change-request semantics are missing.** The Open/Funded/Submitted/Completed/Rejected state machine has no "revision requested" state, which is a first-class user need.

**ERC-8183 is noted as a future integration path.** Once an audited mainnet deployment of ERC-8183 exists, v2 could replace the inner milestone lifecycle with calls to that contract, gaining ecosystem interoperability.

---

## 6. Technical Architecture

### High-Level Diagram (text)

```
┌─────────────────────────────────────────────────────┐
│                  Browser (User)                      │
│  React + Vite + TypeScript                           │
│  wagmi v2 + ConnectKit (wallet connection)           │
│  viem (contract reads / writes)                      │
│  @/onchain-facts, @/onchain-money, @/onchain-wait    │
└─────────────────────────┬───────────────────────────┘
                          │ Arc Mainnet RPC
                          │ https://rpc.mainnet.arc.io
                          ▼
┌─────────────────────────────────────────────────────┐
│              Arc Mainnet (Chain ID 5042)             │
│                                                      │
│  MilestonePayEscrow.sol                              │
│   ├── Agreement registry                             │
│   ├── Per-milestone escrow (USDC ERC-20)             │
│   ├── State machine (see §9)                         │
│   └── Resolver-based dispute resolution             │
│                                                      │
│  USDC ERC-20: 0x3600000000000000000000000000000000000000 │
│  (6 decimals, native predeploy — same address        │
│   on mainnet and testnet per official Arc docs)      │
└─────────────────────────────────────────────────────┘

No backend server. No indexer. No admin key.
```

### Component Breakdown

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 18 + Vite 5 + TypeScript | Already scaffolded |
| Styling | Tailwind CSS v3 | Already configured |
| Wallet connection | wagmi v2 + ConnectKit | Arc Mainnet chain config |
| Contract reads | wagmi `useReadContract` | Polling for milestone state |
| Contract writes | wagmi `useWriteContract` | Fund, submit, approve, dispute |
| Transaction waiting | `@/onchain-wait` | Terminal state polling |
| Amount handling | `@/onchain-money` | All USDC in 6-decimal ERC-20 view |
| Chain facts | `@/onchain-facts` | RPC URL, USDC address, explorer |
| Smart contract | Solidity ^0.8.25, Foundry | Custom `MilestonePayEscrow.sol` |
| Deployment scripts | Foundry `forge script` | Mainnet-ready, manual execution |
| Hosting | Static deploy (Netlify or HF Spaces) | No backend required |
| Key management | User's own wallet | App never holds keys |

### No Backend Required

Because all state lives onchain and deliverable content is offchain (IPFS/HTTPS links the user provides), v1 needs no server. The UI reads contract state directly via public Arc RPC. This eliminates an attack surface and reduces operational burden.

---

## 7. Stablecoin Decision

**USDC on Arc Mainnet** is the sole payment token.

- Address (mainnet): `0x3600000000000000000000000000000000000000`
- Decimals (ERC-20 interface): **6**
- This address is confirmed from the official Arc contract addresses page (fetched live for this plan).
- USDC is Arc's native gas token and also a standard ERC-20. The contract uses the ERC-20 interface (`transferFrom`, `approve`, `balanceOf`) for all escrow operations.
- The 18-decimal native view is used only for gas math and is never mixed with escrow amounts.
- No WETH-style wrapper is needed on Arc.
- EURC is excluded from v1 to minimize audit surface and operational complexity.

---

## 8. Arc EVM Considerations

The following Arc-specific behaviors affect MilestonePayEscrow.sol design:

| Behavior | Impact on Contract |
|---|---|
| USDC is native gas | No ETH-style `msg.value` transfers in this contract; all value flows through ERC-20 `transferFrom` |
| `PREVRANDAO` always returns 0 | No randomness in this contract — not needed |
| EIP-6780 `SELFDESTRUCT` | Contract does not use `SELFDESTRUCT` |
| No blob transactions (EIP-4844) | Not used |
| EIP-7708 Transfer events for native moves | Contract moves USDC via ERC-20, so standard ERC-20 Transfer events fire; no double-counting risk |
| arc-anvil for local simulation | Local tests should use `arc-anvil --network arc` to replicate Arc behavior; standard `anvil` does not reproduce native-USDC semantics |
| Sub-second finality | Single-block confirmation is expected; no multi-block finality waits needed in the frontend |

---

## 9. Smart Contract Design

### Contract: `MilestonePayEscrow.sol`

#### Roles

| Role | Description |
|---|---|
| `client` | Creates the agreement, funds milestones, approves releases, requests changes |
| `provider` | Submits deliverables |
| `resolver` | Pre-designated address (agreed at creation) that can resolve disputes; may be a multisig |

#### Agreement Struct

```solidity
struct Agreement {
    address client;
    address provider;
    address resolver;
    bytes32 termsHash;       // SHA-256 of the offchain agreement document
    uint8   milestoneCount;  // max 5
    bool    active;
}
```

#### Milestone Struct

```solidity
struct Milestone {
    uint256 amount;          // USDC, 6 decimals
    uint256 expiry;          // unix timestamp; claimRefund allowed after this
    MilestoneStatus status;
    bytes32 deliverableHash; // submitted by provider
    bytes32 reasonHash;      // reason for change request, dispute, or approval
    uint8   revisionCount;   // number of times provider has resubmitted
}
```

#### Milestone State Machine

```
Pending
  └─ fund()              → Funded
       ├─ submitDeliverable() → Submitted
       │     ├─ approveRelease()     → Released   (USDC → Provider)  [terminal]
       │     ├─ requestChanges()     → Revision   (if revisionCount < limit)
       │     │     └─ submitDeliverable() → Submitted (loop)
       │     ├─ requestChanges() at limit → Disputed
       │     └─ raiseDispute()       → Disputed
       │
       ├─ raiseDispute()  → Disputed
       │     └─ resolveDispute(toProvider | toClient) → Released | Refunded [terminal]
       │
       └─ claimRefund() after expiry → Refunded   (USDC → Client)   [terminal]
```

**PLACEHOLDER — revision limit:** The maximum number of revisions before the client is forced to either approve or dispute is not yet decided. Candidates: 2, 3, or configurable per agreement. This is a product decision that affects user trust and contract gas cost. Decision needed before implementation.

#### Key Functions

| Function | Caller | Description |
|---|---|---|
| `createAgreement(provider, resolver, termsHash, milestones[])` | Client | Creates and stores agreement + milestone specs |
| `fund(agreementId, milestoneIndex)` | Client | ERC-20 transferFrom + status → Funded |
| `submitDeliverable(agreementId, milestoneIndex, deliverableHash)` | Provider | Stores hash, status → Submitted |
| `approveRelease(agreementId, milestoneIndex)` | Client | Transfers USDC to Provider, status → Released |
| `requestChanges(agreementId, milestoneIndex, reasonHash)` | Client | Status → Revision or → Disputed if limit reached |
| `raiseDispute(agreementId, milestoneIndex, reasonHash)` | Client or Provider | Status → Disputed |
| `resolveDispute(agreementId, milestoneIndex, toProvider)` | Resolver | Transfers to Provider or refunds Client |
| `claimRefund(agreementId, milestoneIndex)` | Client | Allowed only after expiry, transfers back to Client |

#### Events (to emit)

```
AgreementCreated(agreementId, client, provider, resolver, termsHash)
MilestoneFunded(agreementId, milestoneIndex, amount)
DeliverableSubmitted(agreementId, milestoneIndex, deliverableHash)
PaymentReleased(agreementId, milestoneIndex, provider, amount)
ChangesRequested(agreementId, milestoneIndex, reasonHash, revisionCount)
DisputeRaised(agreementId, milestoneIndex, raisedBy, reasonHash)
DisputeResolved(agreementId, milestoneIndex, resolver, toProvider, amount)
RefundClaimed(agreementId, milestoneIndex, client, amount)
```

#### Security Properties (to validate in audit)

- No reentrancy: USDC transfer happens after state update (checks-effects-interactions).
- Access control: each function checks `msg.sender` against the appropriate role.
- No upgradeability: immutable logic, no `delegatecall`, no proxy.
- No admin key: no owner address with unilateral fund access beyond the three-role model.
- Integer safety: Solidity ^0.8.25 built-in overflow checks.
- No native value: `receive()` and `fallback()` not implemented; any accidental ETH/USDC native send reverts.
- Expiry precision: timestamps are block timestamps (miner-adjustable within ~15 s); milestone expiries should be set with at least one day of margin to avoid edge cases.

---

## 10. File and Documentation Plan

```
/home/user/app/
├── docs/
│   ├── milestonepay-plan.md          ← This document
│   ├── contract-design.md            ← Detailed contract spec (generated after review)
│   └── deployment-handoff.md         ← Mainnet deployment runbook (generated pre-deploy)
│
├── contracts/
│   ├── MilestonePayEscrow.sol        ← Main contract (to be written)
│   ├── interfaces/
│   │   └── IMilestonePayEscrow.sol   ← Interface (for frontend ABI + external callers)
│   ├── test/
│   │   └── MilestonePayEscrow.t.sol  ← Foundry unit tests
│   └── script/
│       ├── Deploy.s.sol              ← Foundry deployment script
│       └── Verify.s.sol             ← Post-deploy state verification script
│
├── src/
│   ├── App.tsx                       ← Thin composition root
│   ├── config.ts                     ← wagmi config (Arc Mainnet only)
│   ├── components/
│   │   ├── Dashboard.tsx             ← Agreement list view
│   │   ├── CreateAgreement.tsx       ← Agreement + milestone creation form
│   │   ├── AgreementDetail.tsx       ← Per-agreement milestone tracker
│   │   ├── MilestoneCard.tsx         ← Single milestone state + actions
│   │   ├── FundModal.tsx             ← USDC approve + fund flow
│   │   ├── SubmitModal.tsx           ← Provider deliverable submission
│   │   ├── ReviewModal.tsx           ← Client approve / changes / dispute
│   │   ├── DisputePanel.tsx          ← Resolver view
│   │   └── ConnectPrompt.tsx         ← Wallet not connected state
│   ├── hooks/
│   │   ├── useAgreements.ts          ← Read agreements from contract
│   │   ├── useMilestoneActions.ts    ← Write actions
│   │   └── useUsdcAllowance.ts       ← Read + approve USDC allowance
│   ├── utils/
│   │   ├── hashing.ts                ← Client-side SHA-256 for terms + deliverables
│   │   └── formatting.ts            ← Amount + address display helpers
│   └── abi/
│       └── MilestonePayEscrow.json  ← Generated ABI (from forge build)
│
├── AGENTS.md                         ← Deployed contract addresses (filled post-deploy)
└── .env.example                      ← Template (no secrets)
```

---

## 11. Visual Design Direction

*Full design specification to be elaborated in Prompt 4. Summary direction:*

**Aesthetic:** Professional, trust-first. No consumer-crypto playfulness. The app should feel closer to a legal/finance tool than a DeFi dapp. Contrast is high; information density is moderate.

**Color palette:** Near-white background (`#F8F9FB`), deep slate primary (`#1A2332`), Arc/USDC electric blue accent (`#0066FF`), semantic greens/reds/ambers for milestone status.

**Typography:** A humanist sans-serif (Inter or similar) for body; a monospaced face for addresses and hashes. No decorative type.

**Key UI patterns:**
- Dashboard: card-per-agreement, color-coded milestone progress rail.
- Agreement creation: stepped multi-stage form (step indicators, not a single long scroll).
- Milestone card: prominent status badge, clear primary action button, collapsible detail panel.
- Transaction states: inline progress indicators using `@/onchain-wait`; no blocking spinners.
- Wallet addresses: always truncated to `0xABCD…1234` with a copy button; never shown in full.
- Error states: actionable error messages with suggested next steps, never raw revert strings.
- Mobile: single-column stack; all actions reachable on a 375px viewport.

**Branding:** "MilestonePay" wordmark in slate on near-white. Name change is a single constant in `src/utils/constants.ts`.

---

## 12. Unresolved Decisions and Risks

### Decisions Needed Before Implementation

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Maximum revision limit per milestone | 1, 2, 3, or configurable per agreement | Suggest configurable (1–5) set at agreement creation; default 3. Needs product confirmation. |
| D2 | Resolver identity model | Single EOA address; 2-of-3 multisig; or no resolver (dispute = auto-refund after timeout) | Suggest single address in v1 with strong UX warning that Resolver is trusted and final. |
| D3 | Agreement expiry model | Per-milestone expiry; agreement-level expiry; both | Suggest per-milestone only for v1 simplicity. |
| D4 | Maximum milestone count | Hardcoded 5; configurable; no limit | Suggest hardcoded 5 to bound gas and audit scope. |
| D5 | Platform fee | 0% in v1; reserved field for future | Plan recommends 0% in v1. Needs legal/tax confirmation. |
| D6 | Terms hash algorithm | SHA-256 (offchain, browser-computed) | SHA-256 is the clear choice. Confirm both parties hash the same document format. |
| D7 | Deliverable storage | IPFS CID hash; HTTPS URL hash; arbitrary hash | Suggest IPFS CID hashed with keccak256 for onchain commitment; actual file on IPFS. |
| D8 | Post-dispute resolver process | Offchain negotiation + resolver signs; automated timeout refund | Fully offchain in v1. Resolver wallet must be available; no timeout if Resolver is unresponsive. **RISK: Resolver unresponsiveness locks funds.** |

### Risks

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R1 | Resolver is unresponsive or colluding | Medium | High | Make expiry-based auto-refund available after a dispute deadline; add to v1 design. |
| R2 | ERC-8183 mainnet contract published before launch, creating integration pressure | Low | Low | The v1 design is self-contained; integration is additive in v2. |
| R3 | Arc mainnet USDC address changes | Very Low | High | Import from `@/onchain-facts`, not hardcoded. Currently confirmed as `0x3600000000000000000000000000000000000000`. |
| R4 | arc-anvil not available in CI | Medium | Medium | Tests can fall back to standard Foundry anvil with a documented caveat; native-USDC edge cases need arc-anvil. |
| R5 | Unaudited contract on mainnet | High (pre-audit) | Critical | **Contract MUST NOT be deployed to mainnet before a professional third-party audit is complete.** This is a hard gate. |
| R6 | Frontend hardcodes chain selector showing testnet | — | Medium | `src/config.ts` will include Arc Mainnet ONLY; no testnet entry in production build. |
| R7 | Private key exposure via `.env` committed | Medium | Critical | `.gitignore` covers `.env*`; deployment uses encrypted keystore, not `--private-key` flags. |
| R8 | Client double-funds a milestone | Low | Medium | Contract checks milestone status is Pending before accepting funds. |
| R9 | Provider submits after expiry | Low | Low | Contract checks `block.timestamp < expiry` before accepting submit. |
| R10 | Reentrancy via ERC-20 callback | Low | High | USDC is a canonical contract with no nonstandard callbacks; but check-effects-interactions is still enforced. |

---

## 13. Mainnet Deployment Handoff Plan

Arc Studio's deployment infrastructure does not submit mainnet transactions. The following gates and steps must be completed **outside Studio** before any mainnet deployment.

### Required Gates (all must pass before deploy)

- [ ] Professional third-party Solidity audit completed with all Critical and High findings resolved.
- [ ] Full Foundry unit test suite passes with 100% branch coverage on state machine transitions.
- [ ] Integration test suite passes on an `arc-anvil --network arc` fork.
- [ ] A second independent review of the deployment script confirms the correct constructor args, USDC address, and chain ID.
- [ ] Legal review of terms-hash anchoring approach (jurisdictional enforceability of onchain commitments is out of scope for this plan).

### Deployment Steps (manual, outside Studio)

1. **Set up encrypted keystore:**
   ```bash
   cast wallet import deployer --interactive
   # (prompts for private key + password — never use --private-key flag)
   ```

2. **Verify Arc Mainnet USDC address** against live docs at deploy time:
   ```bash
   cast code 0x3600000000000000000000000000000000000000 --rpc-url https://rpc.mainnet.arc.io
   # Must return non-empty bytecode
   ```

3. **Dry-run simulation:**
   ```bash
   forge script contracts/script/Deploy.s.sol \
     --rpc-url https://rpc.mainnet.arc.io \
     --account deployer \
     --simulate
   ```

4. **Deploy:**
   ```bash
   forge script contracts/script/Deploy.s.sol \
     --rpc-url https://rpc.mainnet.arc.io \
     --account deployer \
     --broadcast \
     --verify \
     --etherscan-api-key $EXPLORER_API_KEY
   # Arc explorer API key needed for source verification
   ```

5. **Post-deploy verification:**
   - Record deployed address in `AGENTS.md`.
   - Run `Verify.s.sol` to confirm constructor state matches expectations.
   - Update frontend `.env` with deployed address.
   - Rebuild and re-deploy frontend.

---

## 14. Explicitly Invented-Nothing Declaration

This plan does not invent:
- Contract addresses (all addresses sourced from live Arc docs fetched during planning).
- Audit firms, partnerships, or approval processes.
- Platform fees or revenue models beyond what is stated as a placeholder.
- Legal advice or jurisdictional enforceability claims.
- User numbers, market size estimates, or adoption projections.
- Arc Mainnet ERC-8183 deployment (none exists; clearly stated as testnet-only).

Items marked **PLACEHOLDER** require a decision before the corresponding implementation step proceeds.
