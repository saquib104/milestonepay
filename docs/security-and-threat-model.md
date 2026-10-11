# MilestonePay — Security and Threat Model

**Version:** 1.0
**Date:** 2026-10-11
**Contract status:** NOT INDEPENDENTLY AUDITED

---

## Scope

This document covers security properties and threats for:
1. `MilestonePayEscrow.sol` — the smart contract
2. The Hono API server (`server/`) — offchain metadata
3. The React frontend (`src/`) — browser application

It does not cover: operational security of the deployer's private key,
the Arc Mainnet chain itself, the Circle USDC contract, or third-party
wallet software.

---

## Contract Security

### Properties

| Property | Status | Evidence |
|---|---|---|
| No reentrancy | Verified | `nonReentrant` on `fund` + `withdraw`; pull-payment pattern throughout |
| CEI order maintained | Verified | State updated before external call in `fund` and `withdraw` |
| Role-based access control | Verified | Every function checks exact role |
| No admin key | Verified | No `owner`, no emergency withdrawal function |
| No upgradeability | Verified | No proxy, no `delegatecall` |
| Integer overflow protection | Verified | Solidity ^0.8.25 built-in checked arithmetic |
| No ETH accepted | Verified | No `receive()` or `fallback()` |
| Dispute liveness | Verified | `disputeDeadline` + either-party `claimDisputeRefund` |
| Pull-over-push payments | Verified | All credits go to `pendingWithdrawals`; recipients pull |
| Decimal isolation | Verified | Only 6-decimal ERC-20 amounts; no `msg.value` |

### Resolved Findings (4 audit rounds)

| # | Severity | Title | Fix |
|---|---|---|---|
| F1 | Critical | Resolver unresponsiveness permanently locks funds | Added `disputeTimeout` + `claimDisputeRefund` |
| F2 | High | Auto-dispute missing `disputeDeadline` | Set deadline in `requestChanges` escalation path |
| F3 | Critical | `claimRefund` allowed after provider submitted | Restricted to `Funded` status only |
| F4 | High | Dispute timeout always refunded client | Added `disputeDefaultToProvider` per agreement |
| F5 | High | Push payment to blocklisted address locks milestone | Replaced all push payments with pull pattern |
| F6 | High | `claimDisputeRefund` client-only grief-lock | Made callable by either party; outcome from flag |
| F7 | Low | `InvalidArrayLength` reused for timeout range | Added `InvalidDisputeTimeout` custom error |

Full details in `docs/security-review.md`.

### Residual Design-Level Risks

| Risk | Mitigation |
|---|---|
| Resolver collusion | Both parties pre-agree the resolver address. Future: ERC-8004 reputation registry. |
| Resolver unresponsiveness after timeout | `claimDisputeRefund` callable by either party after `disputeDeadline` |
| `block.timestamp` manipulation (±15 s) | Deadlines are days/weeks in scale — immaterial |
| USDC contract risk | USDC is Circle's canonical Arc predeploy at `0x3600000000000000000000000000000000000000` |
| No upgradeability | Intentional. Future bug fix requires a new contract + user migration |
| Unbounded `agreementCounter` | uint256 — no realistic overflow concern |

### NOT Verified (requires independent audit)

- Full branch coverage analysis by a human auditor
- Economic attack vectors specific to Arc Mainnet gas model
- Chain-specific edge cases (PREVRANDAO=0, EIP-7708 Transfer events)
- Interaction with future Arc protocol upgrades
- Gas exhaustion attacks against the milestones loop

---

## API Server Security

### Authentication (v1)

The v1 auth model uses a `X-Wallet-Address` header to claim identity.
**This is not cryptographically verified** — the server trusts the header value.

This is documented as acceptable for v1 because:
- The contract enforces all fund flows (the API server cannot move funds)
- Write operations additionally check that the caller is a project participant
- A forged header can only access metadata the real participant could also see

**Required upgrade for v2:** EIP-4361 (Sign-In With Ethereum) before storing
any sensitive user data. See `server/auth.ts`.

### Authorization

- Profile read/write: caller must be the wallet owner
- Project read: caller must be client, provider, or resolver of that project
- Notes/evidence write: caller must be a project participant
- Deletion requests: caller must be the wallet owner
- No admin routes exist

### Input Validation

All inputs validated in `server/validate.ts` before touching the database:
- Addresses: must be `0x[0-9a-f]{40}` (lowercase)
- bytes32: must be `0x[0-9a-f]{64}`
- Strings: trimmed, non-empty where required, max-length enforced
- Agreement IDs: `\d{1,78}` (uint256 range)
- Milestone indices: integer 0–4
- Refs: must be HTTPS URL or IPFS CID
- Email: RFC-5321 pattern, max 254 chars

### Rate Limiting

In-memory sliding-window limiter (`server/rateLimit.ts`):
- Global: 120 req / 60 s per IP
- Write operations: 10–20 req / 60 s per wallet

**Note:** The in-memory limiter does not persist across server restarts and does not
coordinate across multiple server instances. For production, replace with Redis or a
distributed rate-limiting solution.

### Data Exposure Controls

- `notify_email` is never returned in any API response
- Error messages from `onError` handler are sanitized — internal errors are not leaked
- Indexer errors log only the error message, never decoded event data (which may contain wallet addresses)
- No secrets are logged anywhere

### CORS

Configured to allow only `localhost:5173` in development.
**Production deployment must update the CORS origin list** to the actual frontend domain.
See `server/index.ts`.

---

## Frontend Security

### No Private Keys

The frontend never stores, requests, or transmits private keys, seed phrases, or
wallet credentials. All signing is delegated to the user's wallet via wagmi/viem.

### Chain Enforcement

- `useTxGuard` checks chain ID = 5042 before every write
- `ChainGuardBanner` shows a prominent warning if the wrong chain is detected
- `TARGET_CHAIN_ID` is the single source of truth in `src/config.ts`

### Allowance Safety

- USDC is only approved for the exact milestone amount — no unlimited approvals
- The approve amount is displayed in the `TxConfirm` panel before the wallet prompt
- A second wallet signature is required for the `fund()` call (two-step flow)

### Transaction Safety

- Buttons are disabled while a transaction is pending (duplicate submission prevention)
- Receipt confirmation required before showing completion
- `parseOnchainError` in `utils/formatting.ts` converts all known revert conditions to user-readable messages
- Arc-specific: "insufficient funds" message explains that USDC is the gas token

### No Secrets in Frontend Code

- `VITE_CONTRACT_ADDRESS` is public (a deployed contract address is always public)
- `VITE_WALLETCONNECT_PROJECT_ID` is public (WalletConnect project IDs are public)
- No API keys, database credentials, or private keys exist in the frontend codebase

### Hashing

- Terms, deliverables, and reason hashes use WebCrypto `SubtleCrypto.digest('SHA-256')`
- No custom hash implementations
- Hashing is done client-side before submission; raw text never leaves the browser

---

## Threat Model Summary

| Threat | Target | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Contract reentrancy | Smart contract | Low | Critical | `nonReentrant` + CEI + pull payments |
| Admin key fund seizure | Smart contract | N/A | Critical | No admin key exists |
| Resolver collusion | Smart contract | Medium | High | Pre-agreed resolver; dispute timeout fallback |
| Forged `X-Wallet-Address` header | API server | High | Low | Funds controlled by contract; DB contains only metadata |
| USDC unlimited approval | Frontend | N/A | High | Exact-amount approval enforced |
| Wrong chain tx (testnet) | Frontend | Low | Medium | `useTxGuard` + `ChainGuardBanner` |
| Private key in codebase | Server | N/A | Critical | No private keys in codebase; `.env` in `.gitignore` |
| SQL injection | API server | Low | High | Parameterized queries via `postgres` tagged template |
| Rate limit bypass | API server | Medium | Low | IP-based; limited impact on non-custodial app |
| Stale ABI mismatch | Frontend | Low | Medium | ABI generated from `forge build` artifact |
| `block.timestamp` manipulation | Smart contract | Very Low | Low | Deadlines are days in scale |
| Indexer double-counting | Indexer | Low | Low | `ON CONFLICT DO NOTHING` deduplication |

---

## Independent Audit Requirement

**The contract has not been independently audited.**

Before any mainnet deployment:

1. Engage a professional Solidity audit firm.
2. Provide them with: `contracts/MilestonePayEscrow.sol`,
   `contracts/interfaces/IMilestonePayEscrow.sol`,
   `contracts/test/MilestonePayEscrow.t.sol`,
   `contracts/test/MilestonePayEscrowInvariant.t.sol`,
   `docs/contract-spec.md`,
   and `docs/security-review.md` (as prior review record).
3. All Critical and High findings must be resolved before deployment.
4. A re-audit of any changes made as a result of audit findings is strongly recommended.
5. The "NOT INDEPENDENTLY AUDITED" notice in the contract header must be updated after audit.

Arc Studio automated review is not a substitute for professional audit.
