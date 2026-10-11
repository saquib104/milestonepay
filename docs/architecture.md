# MilestonePay — Architecture

**Version:** 1.0
**Date:** 2026-10-11

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (client / provider / resolver)                         │
│                                                                  │
│  React 18 + Vite + TypeScript                                    │
│  wagmi v2 + viem + ConnectKit                                    │
│  Tailwind CSS                                                    │
│                                                                  │
│  src/config.ts        — wagmi config (Arc Mainnet chain only)    │
│  src/hooks/           — contract reads/writes, backend API calls │
│  src/components/      — all screens and modals                   │
│  src/utils/           — formatting, hashing, constants           │
│  src/abi/             — contract ABI JSON                        │
└──────────┬──────────────────────────┬───────────────────────────┘
           │ wallet JSON-RPC           │ /api/* (proxied by Vite)
           │ (wagmi/viem)              │ fetch()
           ▼                           ▼
┌─────────────────────┐    ┌────────────────────────────────────┐
│  Arc Mainnet RPC     │    │  MilestonePay API Server           │
│  (chain ID 5042)     │    │  Bun + Hono, port 3001             │
│                     │    │                                    │
│  https://rpc.       │    │  server/index.ts   — 13 endpoints  │
│  mainnet.arc.io     │    │  server/auth.ts    — authorization  │
│  (or RPC proxy if   │    │  server/validate.ts — input checks │
│   configured)       │    │  server/rateLimit.ts — rate limit  │
│                     │    │  server/indexer.ts — event polling │
│                     │    │  server/db.ts      — Postgres pool │
└──────────┬──────────┘    └──────────┬─────────────────────────┘
           │                          │ SQL
           │ eth_getLogs (indexer)     ▼
           │                ┌─────────────────────────────────┐
           │                │  Postgres 18 (Docker)           │
           │                │  Named volume: mpgdata          │
           │                │  Port: 5432                     │
           │                │                                 │
           │                │  users                          │
           │                │  projects                       │
           │                │  milestones_meta                │
           │                │  submission_notes               │
           │                │  dispute_evidence               │
           │                │  chain_events                   │
           │                │  indexer_state                  │
           │                │  deletion_requests              │
           │                └─────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Arc Mainnet (Chain ID 5042)                                  │
│                                                              │
│  MilestonePayEscrow.sol (NOT YET DEPLOYED)                   │
│   ├── Agreement registry (agreementCounter, agreements[])    │
│   ├── Per-milestone escrow (milestones[][])                  │
│   ├── Pull-payment ledger (pendingWithdrawals[])             │
│   └── State machine: Pending→Funded→Submitted→Released       │
│                           ↘Revision↗   ↘Refunded             │
│                                ↓         ↑                   │
│                              Disputed→Resolved               │
│                                                              │
│  USDC predeploy: 0x3600000000000000000000000000000000000000  │
│  (6-decimal ERC-20 interface; also native gas, 18 dec)       │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Frontend (src/)

| File/Dir | Responsibility |
|---|---|
| `config.ts` | wagmi config. Only Arc Mainnet (chain 5042) is listed. Ethereum Mainnet is included solely for ConnectKit ENS resolution and is never shown to users. |
| `hooks/useAgreements.ts` | Reads agreement and milestone state from the contract via `useReadContract` / `useReadContracts`. Chain ID is hardcoded to `TARGET_CHAIN_ID`. |
| `hooks/useMilestoneActions.ts` | All write hooks (`useWriteContract` + `useWaitForTransactionReceipt`). Chain ID is hardcoded to `TARGET_CHAIN_ID`. |
| `hooks/useAllowance.ts` | Reads and sets USDC ERC-20 allowance for the escrow contract. Approves exact amounts only. |
| `hooks/useTxGuard.ts` | Pre-transaction safety checks: wallet connected, correct chain, USDC balance covers amount + gas reserve. |
| `hooks/useUsdcBalance.ts` | Reads USDC ERC-20 balance via `balanceOf`. Never reads native balance. |
| `hooks/useBackend.ts` | REST calls to the API server for offchain metadata. All calls include `X-Wallet-Address` header. |
| `utils/constants.ts` | Arc chain ID (5042), USDC address (0x3600...), explorer URL — all documented with official source + verification date. |
| `utils/formatting.ts` | USDC format/parse, date/hash display, Arc Explorer URL builders, onchain error parser. |
| `utils/hashing.ts` | SHA-256 hashing for terms, deliverables, and dispute reasons using WebCrypto API. |

### Backend (server/)

| File | Responsibility |
|---|---|
| `index.ts` | Hono HTTP server. 13 endpoints. CORS, rate limiting, global error handler. Never serves onchain data directly — always defers to contract. |
| `auth.ts` | Extracts wallet address from `X-Wallet-Address` header. Checks participant membership in the DB for authorization. V1 uses header-only auth (no signature verification — see security note in file). |
| `validate.ts` | Input validation for all types: addresses, bytes32, strings, refs, emails, indices. |
| `rateLimit.ts` | In-memory sliding-window rate limiter. 120 req/min global, 10–20 write/min per wallet. |
| `indexer.ts` | Polls Arc Mainnet `eth_getLogs` every 12 s for contract events. 500-block batches, 10-block reorg safety. Deduplicates by `(tx_hash, log_index)`. Stores only public onchain data. |
| `chain-rpc.ts` | Resolves the Arc RPC URL: uses Circle RPC proxy when `Arc_Mainnet` is in `RPC_PROXY_CHAINS`; falls back to public RPC from `onchain-facts.ts`. |
| `schema.sql` | Idempotent Postgres migration (all `IF NOT EXISTS`). |
| `db.ts` | Postgres connection pool. Runs migration on startup. |

---

## Data Flow

### Onchain (source of truth)

```
Wallet → wagmi → viem → Arc RPC → MilestonePayEscrow.sol
                                           ↓
                         milestones[agreementId][index].status
                         milestones[agreementId][index].amount
                         pendingWithdrawals[address]
```

Contract state is **never inferred** from a frontend state variable, a backend database
row, or a pending transaction. A milestone is only displayed as "Released" or "Refunded"
after a live contract read confirms the terminal status.

### Offchain (supplementary)

```
Frontend → /api/* → Hono server → Postgres
                          ↑
                    indexer (advisory)
                    eth_getLogs → chain_events table
```

The backend stores: project titles, milestone descriptions, submission notes, evidence
references, display names, notification preferences, and indexed event history.
It does not store: USDC amounts, milestone status, deliverable hashes, escrow balances,
or final payment state. These are always read from the contract.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| No ERC-8183 | No audited mainnet deployment exists; multi-milestone shape requires a wrapper anyway |
| Pull-over-push payments | Prevents a blocklisted address from permanently locking a milestone |
| No upgradeability | Eliminates proxy risks; bugs require a new deployment and migration |
| No admin key | No address can seize user funds |
| USDC ERC-20 only | Native 18-dec view used only by gas layer; escrow math uses 6-dec interface exclusively |
| Header-only auth (v1) | Sufficient for a non-custodial app where the contract enforces all fund flows; see auth.ts for v2 upgrade path (EIP-4361 SIWE) |
| Exact-amount approval | Never requests unlimited USDC approval |
| Arc built-in viem chain | `import { arc } from 'viem/chains'` — uses library-managed RPC/explorer values, not typed literals |

---

## Network Configuration

All network values are imported from `viem/chains` (arc built-in) or from
`src/utils/constants.ts`, which documents the official source and verification date
for each value. No Arc Testnet entry exists anywhere in the production config.

```typescript
// src/config.ts (simplified)
import { arc } from 'viem/chains'
export const TARGET_CHAIN_ID = arc.id  // 5042
```

If a value from the Arc docs changes, update `src/utils/constants.ts` and re-verify
against the official docs before deploying.
