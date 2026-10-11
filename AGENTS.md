# MilestonePay

> Built with Arc Studio — money-powered apps in minutes

This is the **project memory** — what Arc Studio remembers about building this app.

---

## What This App Does

MilestonePay is a two-party, fixed-price milestone escrow application for cross-border
freelance and small-agency work. A client and service provider agree on milestones;
the client funds each milestone in USDC escrow on Arc Mainnet; the provider submits a
deliverable hash; the client approves payment, requests changes, or escalates a dispute.
A pre-agreed Resolver address can settle disputes. After a configurable dispute timeout,
either party can trigger resolution via a pre-agreed default outcome.

**App is NOT deployed.** All security gates must pass before mainnet deployment.
See `docs/mainnet-deployment-handoff.md` for the full runbook.

---

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Backend: Bun + Hono API server (port 3001); Postgres 18 (Docker, named volume `mpgdata`)
- Event indexer: Bun process co-started with API server; polls Arc Mainnet via RPC proxy or public RPC
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.25 + Foundry (compiled with solc 0.8.28, evm_version = paris)
  - Source:      `contracts/MilestonePayEscrow.sol`
  - Interface:   `contracts/interfaces/IMilestonePayEscrow.sol`
  - Unit tests:  `contracts/test/MilestonePayEscrow.t.sol`
  - Invariants:  `contracts/test/MilestonePayEscrowInvariant.t.sol`
  - Deploy script: `contracts/script/Deploy.s.sol` (mainnet only, manual execution)
  - Build:  `bun run contracts:build` (runs `forge build`)
  - Test:   `bun run contracts:test` (runs `forge test`)
- Wallet: injected (MetaMask, Rabby, etc.) via ConnectKit
- Chain: **Arc Mainnet** (Chain ID: 5042) — PRODUCTION ONLY, no testnet in this app
- Token: USDC (ERC-20, 6 decimals) at `0x3600000000000000000000000000000000000000`

---

## Contract Status

| Item | Status |
|---|---|
| `MilestonePayEscrow.sol` | Written, audited (internal), 71 tests pass |
| Independent third-party audit | **NOT COMPLETED — required before mainnet deploy** |
| Mainnet deployment | **NOT DEPLOYED** |
| Testnet deployment | Not applicable — this app targets mainnet only |
| Frontend wiring | Not started (Prompt 4+) |

---

## Deployed Contract Addresses

| Network | Contract | Address | Tx Hash |
|---|---|---|---|
| Arc Mainnet | MilestonePayEscrow | NOT DEPLOYED | — |

*(Fill in after professional audit + manual deployment per `docs/mainnet-deployment-handoff.md`)*

---

## Key Files

| File | Purpose |
|---|---|
| `contracts/MilestonePayEscrow.sol` | Main escrow contract |
| `contracts/interfaces/IMilestonePayEscrow.sol` | Interface (ABI source for frontend) |
| `contracts/test/MilestonePayEscrow.t.sol` | 61 unit tests |
| `contracts/test/MilestonePayEscrowInvariant.t.sol` | 5 invariants + 5 conservation fuzz tests |
| `contracts/script/Deploy.s.sol` | Mainnet deployment script (manual, Arc Mainnet only) |
| `docs/milestonepay-plan.md` | PRD and product specification |
| `docs/contract-design.md` | ERC-8183 decision + full contract design document |
| `docs/security-review.md` | Internal security review report |
| `docs/mainnet-deployment-handoff.md` | Manual deployment runbook + pre-deploy gates |
| `src/App.tsx` | Frontend entry point — view router |
| `src/config.ts` | wagmi config (Arc Mainnet only — no testnet) |
| `src/abi/MilestonePayEscrow.json` | Contract ABI for frontend calls |
| `src/utils/constants.ts` | App-wide constants, enum values, labels |
| `src/utils/formatting.ts` | Address/USDC/date formatting + error parsing |
| `src/utils/hashing.ts` | SHA-256 hashing for deliverables/terms/reasons |
| `src/hooks/useChainGuard.ts` | Arc Mainnet chain enforcement hook |
| `src/hooks/useUsdcBalance.ts` | ERC-20 USDC balance hook |
| `src/hooks/useAllowance.ts` | USDC allowance + approve hook |
| `src/hooks/useAgreements.ts` | Agreement + milestone read hooks |
| `src/hooks/useMilestoneActions.ts` | All write action hooks |
| `src/components/` | All UI screens and modals |
| `src/hooks/useBackend.ts` | Frontend API client hooks (projects, notes, evidence, events) |
| `server/index.ts` | Hono API server (migrate + serve) |
| `server/indexer.ts` | Chain event indexer (eth_getLogs polling) |
| `server/start.ts` | Backend entrypoint (API + indexer in one process) |
| `server/schema.sql` | Postgres schema (7 tables; idempotent migration) |
| `server/db.ts` | Postgres connection pool + migrate() |
| `server/auth.ts` | Participant authorization helpers |
| `server/validate.ts` | Input validation functions |
| `server/rateLimit.ts` | In-memory rate limiter |
| `server/chain-rpc.ts` | Arc Mainnet RPC URL resolver (proxy-first, facts fallback) |
| `docs/backend-design.md` | Schema docs, API docs, privacy diagram, retention policy |
| `.env.example` | Environment variable template |

---

## Pre-Deploy Gates (ALL must pass before mainnet deployment)

- [ ] Independent professional third-party Solidity audit — all Critical/High findings resolved
- [ ] `forge test --coverage` — 100% branch coverage on state machine transitions
- [ ] Integration tests on `arc-anvil --network arc` fork
- [ ] Second reviewer confirms USDC address and chain ID in `Deploy.s.sol`
- [ ] Legal review of terms-hash anchoring approach

---

## Important Addresses (Arc Mainnet, verified from official docs 2026-10-11)

| Token | Address | Decimals |
|---|---|---|
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` | 6 |

---

## To Run Locally

```bash
# Start Postgres (first time only; Docker must be running)
docker run -d --name milestonepay-pg --restart unless-stopped \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=milestonepay \
  -v mpgdata:/var/lib/postgresql -p 5432:5432 --memory=512m postgres:18-alpine

# Copy .env.example to .env and fill in values (if not done already)
cp .env.example .env

# Start frontend
bun run dev               # Vite on port 5173

# Start backend (separate terminal)
bun run server            # API server + indexer on port 3001

# Contracts
forge build               # compile
forge test                # 71 unit + invariant tests
forge test --fuzz-runs 512
```

---

## Arc Studio Notes

Arc Studio does NOT submit mainnet transactions. Any mainnet deployment must be
executed manually outside Studio using the runbook in `docs/mainnet-deployment-handoff.md`.
