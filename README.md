# MilestonePay

USDC milestone escrow for fixed-price freelance work on Arc Mainnet.

> **STATUS: NOT INDEPENDENTLY AUDITED**
> This contract has not been reviewed by an independent third-party auditor.
> Do not deploy to mainnet holding real funds until a professional security audit
> has been completed and all Critical and High findings resolved.
> See [docs/deployment-guide.md](docs/deployment-guide.md) for full pre-deploy gates.

---

## What It Does

MilestonePay lets a client and a service provider agree on a fixed-price, milestone-structured
work engagement and enforce payment releases using USDC escrow on Arc Mainnet.

- The client funds each milestone's USDC amount into a smart contract escrow.
- The provider submits a cryptographic hash of their deliverable onchain.
- The client approves release, requests changes, or escalates to a designated resolver.
- After a configurable dispute timeout, either party can trigger the pre-agreed default outcome.
- No platform fee. No admin key. No custodian. No AI-controlled fund release.

---

## Target Network

**Arc Mainnet only** (Chain ID: 5042).

| Value | Source |
|---|---|
| Chain ID | 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` (6 decimals) |

All values verified from [Arc official documentation](https://docs.arc.io/arc/references/connect-to-arc)
on 2026-10-11. Verify at deployment time — do not rely solely on this README.

Arc Testnet is not present in any configuration file, chain selector, or runtime environment.

---

## Quick Start (local development)

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- [Docker](https://www.docker.com) (for Postgres)
- [Foundry](https://book.getfoundry.sh) (`forge`, `cast`)

### Setup

```bash
# 1. Start Postgres
docker run -d --name milestonepay-pg --restart unless-stopped \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=milestonepay \
  -v mpgdata:/var/lib/postgresql -p 5432:5432 --memory=512m postgres:18-alpine

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL, SESSION_SECRET (see .env.example for all keys)

# 3. Install dependencies
bun install

# 4. Start frontend (port 5173)
bun run dev

# 5. Start backend API + indexer (port 3001, separate terminal)
bun run server
```

The frontend proxies `/api` requests to the backend automatically via Vite.

### Contracts

```bash
bun run contracts:build    # forge build
bun run contracts:test     # forge test --fuzz-runs 512 (71 tests)
```

---

## Project Structure

```
contracts/
  MilestonePayEscrow.sol          Main escrow contract
  interfaces/IMilestonePayEscrow.sol  Solidity interface
  test/MilestonePayEscrow.t.sol   61 unit tests
  test/MilestonePayEscrowInvariant.t.sol  5 invariant tests
  script/Deploy.s.sol             Mainnet deployment script (manual only)

src/
  App.tsx                         Thin view router
  config.ts                       wagmi config (Arc Mainnet only)
  hooks/                          Contract read/write + backend hooks
  components/                     All UI screens and modals
  utils/                          Formatting, hashing, constants
  abi/MilestonePayEscrow.json     ABI for frontend

server/
  index.ts                        Hono API (port 3001)
  indexer.ts                      Arc event indexer
  schema.sql                      Postgres schema (7 tables)
  auth.ts / validate.ts           Auth + input validation

docs/
  product-requirements.md         Full PRD
  architecture.md                 System design
  contract-spec.md                Contract specification
  security-and-threat-model.md    Security model + threats
  privacy-and-data.md             Data flows + retention
  api-and-data-model.md           API docs + DB schema
  deployment-guide.md             Mainnet deployment runbook
  operations-runbook.md           Operational procedures
  known-limitations.md            Known gaps and constraints
  user-flows.md                   Step-by-step user journeys
```

---

## Audit and Deployment Status

| Gate | Status |
|---|---|
| Internal automated review (4 rounds, balanced severity) | Passed — 7 findings resolved |
| 71 Foundry tests (61 unit + 5 invariant + 5 conservation) | Passing |
| Independent professional third-party audit | **NOT COMPLETED** |
| Mainnet deployment | **NOT DEPLOYED** |

**Arc Studio cannot deploy this project to mainnet.** See
[docs/deployment-guide.md](docs/deployment-guide.md) for the full pre-deploy gate list
and step-by-step mainnet deployment runbook.

---

## Documentation

| Document | Purpose |
|---|---|
| [docs/product-requirements.md](docs/product-requirements.md) | Full PRD, personas, scope |
| [docs/architecture.md](docs/architecture.md) | System architecture |
| [docs/contract-spec.md](docs/contract-spec.md) | Contract spec and state machine |
| [docs/user-flows.md](docs/user-flows.md) | Step-by-step user journeys |
| [docs/security-and-threat-model.md](docs/security-and-threat-model.md) | Security analysis |
| [docs/privacy-and-data.md](docs/privacy-and-data.md) | Privacy model + data flows |
| [docs/api-and-data-model.md](docs/api-and-data-model.md) | API endpoints + DB schema |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Mainnet deployment runbook |
| [docs/operations-runbook.md](docs/operations-runbook.md) | Operational procedures |
| [docs/known-limitations.md](docs/known-limitations.md) | Known gaps |

---

## Security

This application is a non-custodial escrow. Funds are held in a smart contract;
the application UI never has access to private keys. All participant actions must
be signed by the participant's own wallet.

The contract has not been independently audited. It must not be used with real funds
until a professional audit is complete. See
[docs/security-and-threat-model.md](docs/security-and-threat-model.md).

To report a security issue, contact the project maintainer privately before
public disclosure.

---

## License

MIT — see LICENSE file.
