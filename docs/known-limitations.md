# MilestonePay — Known Limitations

**Version:** 1.0
**Date:** 2026-10-11

This document catalogs known gaps, constraints, and design tradeoffs in the current
v1 implementation. Each item notes whether it is a planned improvement, a design
decision, or a hard constraint.

---

## Contract

### C1 — No Upgradeability

**Type:** Design decision
**Impact:** A bug in the contract requires a new deployment and user migration.
**Rationale:** Upgradeability adds proxy complexity and new attack surface (proxy admin
key, storage collision). For v1, immutability is preferable.
**Mitigation:** Professional audit required before mainnet deployment. Monitor for bugs
post-launch; maintain migration guides.

### C2 — Resolver Trust is Off-Chain

**Type:** Design constraint
**Impact:** The resolver can direct disputed funds to either party arbitrarily. The
contract cannot verify their neutrality.
**Mitigation:** UI shows a prominent warning when selecting a resolver. Future: ERC-8004
reputation registry integration.

### C3 — Maximum 5 Milestones Per Agreement

**Type:** Design decision (hardcoded cap)
**Impact:** Agreements with more than 5 payment stages require multiple agreements.
**Rationale:** Bounds gas cost for the all-milestones-terminal loop; simplifies audit scope.
**Possible fix:** Allow higher cap in v2, or introduce agreement groups.

### C4 — No Agreement Cancellation

**Type:** V1 scope gap
**Impact:** An agreement cannot be cancelled once created (before any funding). If a
dispute arises before any milestone is funded, there is no onchain record to cancel.
**Mitigation:** Funded milestones can be refunded via dispute or expiry mechanisms.
Unfunded milestones simply remain unused.

### C5 — No arc-anvil Fork Tests Yet

**Type:** Pre-deploy gate (not completed)
**Impact:** Native-USDC behavior (18-dec gas / 6-dec ERC-20 interaction) has not been
exercised on an `arc-anvil --network arc` fork. Standard Foundry tests pass.
**Required:** Must complete before mainnet deployment.

### C6 — `block.timestamp` Precision

**Type:** Known limitation of EVM
**Impact:** Expiry and dispute deadlines can be manipulated by a validator by up to ~15 s.
**Mitigation:** Deadlines are set in days; the margin is immaterial for the use case.

---

## Backend / API

### B1 — Header-Only Authentication (No Signature)

**Type:** V1 design tradeoff
**Impact:** `X-Wallet-Address` is not cryptographically verified. A request with a
forged header can read another participant's project metadata if they know the
agreement ID and addresses (all of which are public onchain data).
**Risk level:** Low — the API server cannot move funds; the contract enforces all
financial access control.
**Planned upgrade:** EIP-4361 (Sign-In With Ethereum) in v2. See `server/auth.ts`.

### B2 — In-Memory Rate Limiting

**Type:** V1 implementation constraint
**Impact:** Rate limits do not persist across server restarts and do not coordinate
across multiple server instances.
**Planned upgrade:** Replace with Redis-backed rate limiter for production at scale.

### B3 — CORS Allows Only localhost in Dev

**Type:** Configuration requirement
**Impact:** The CORS `origin` list in `server/index.ts` must be updated to the
production frontend domain before deployment.
**Action required:** See `docs/deployment-guide.md`.

### B4 — No Webhook / Push Notifications

**Type:** V1 scope gap
**Impact:** Users must manually refresh the app to see status changes.
**Planned:** Backend has `notify_on_events` preference stored; the notification
delivery mechanism is not implemented.

### B5 — Deletion Requests Require Manual Batch Job

**Type:** V1 implementation constraint
**Impact:** Full data removal (beyond immediate PII clear) runs on a batch job that
must be implemented and scheduled separately.
**Required:** Implement a cron job or scheduled task to process `deletion_requests`
within the 30-day retention window before production launch.

---

## Frontend

### F1 — No Agreement ID Navigation

**Type:** V1 scope gap
**Impact:** Users cannot deep-link to a specific agreement by URL. The view router
uses in-memory state only; refreshing the page returns to the dashboard.
**Planned:** URL-based routing in v2 (React Router or similar).

### F2 — No ENS Resolution

**Type:** V1 scope gap (explicit non-goal)
**Impact:** Wallet addresses are displayed truncated (`0xABCD…1234`) without human-readable names.
**Planned:** ENS lookup is included in the wagmi config (Ethereum Mainnet for ENS) but not
surfaced in the UI. Can be enabled in v2.

### F3 — Provider Cannot See All Agreements

**Type:** V1 limitation
**Impact:** The dashboard filters by connected wallet but reads agreement IDs from the
backend. If the backend has no record (project metadata not created), the agreement
will not appear in the list even if the wallet is the provider onchain.
**Mitigation:** The app shows a manual "look up by agreement ID" flow for providers
receiving an ID from a client.

### F4 — WalletConnect Requires Project ID

**Type:** Configuration requirement
**Impact:** Without `VITE_WALLETCONNECT_PROJECT_ID` set, only injected wallets
(MetaMask, Rabby) are available. WalletConnect (mobile wallets) will not appear.
**Action:** Get a free project ID at https://cloud.walletconnect.com and set it in `.env`.

### F5 — Contract Not Yet Deployed

**Type:** Current state
**Impact:** The `VITE_CONTRACT_ADDRESS` env var is a zero address placeholder.
All contract-dependent UI is disabled until a real contract is deployed.
The app shows an explicit "not yet deployed" notice.
**Action:** Deploy the contract (see `docs/deployment-guide.md`) and update `.env`.

---

## Security

### S1 — Not Independently Audited

**Type:** Hard pre-deploy gate
**Impact:** The contract must not be used with real funds until a professional
third-party audit is complete.
**Action:** See `docs/deployment-guide.md` Gate 1.

### S2 — No Multisig Deployer

**Type:** Operational recommendation (not enforced by code)
**Impact:** The deployer EOA is a single point of failure. If compromised after
deployment, the deployer cannot affect the contract (no admin key), but the
verified source submission and upgrade path are at risk.
**Recommendation:** Use a hardware wallet for the deployer key.

---

## ERC-8183 (Agentic Commerce)

### E1 — No ERC-8183 Integration in v1

**Type:** Deliberate v1 decision
**Reason:** No audited mainnet deployment of ERC-8183 exists as of 2026-10-11.
The reference contract at `0x0747EEf0706327138c69792bF28Cd525089e4583` is
deployed on **Arc Testnet only** and must not be treated as a mainnet contract.
The multi-milestone shape also requires a wrapper contract in any case.
**Planned:** v2 can integrate ERC-8183 once an audited mainnet deployment exists.
