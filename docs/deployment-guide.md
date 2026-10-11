# MilestonePay — Deployment Guide

**Version:** 1.0
**Date:** 2026-10-11

---

## STOP — Read This First

**Arc Studio cannot deploy this project to mainnet.**

Arc Studio is a development and auditing environment. It does not submit transactions to
mainnet, does not hold mainnet deployer keys, and has no access to mainnet funds. All
mainnet deployment steps in this document must be performed by you, manually, outside
of Arc Studio, using your own tools and infrastructure.

The contract currently carries this notice at the top of `contracts/MilestonePayEscrow.sol`:

```
// STATUS: NOT INDEPENDENTLY AUDITED
// This contract has not been reviewed by an independent third-party auditor.
// It MUST NOT be deployed to mainnet holding real funds until a professional
// security audit has been completed and all Critical and High findings resolved.
```

This is not a formality. Do not remove it or deploy without completing the gates below.

---

## Pre-Deploy Gates

All of the following must be satisfied before any mainnet deployment. These are hard gates,
not suggestions.

- [ ] **Gate 1:** Professional third-party Solidity security audit completed.
  All Critical and High severity findings resolved. Re-audit of changes completed if the
  auditor requires it. A copy of the final audit report must be obtained and stored securely.

- [ ] **Gate 2:** `forge test --coverage` shows 100% branch coverage on all state machine
  transitions. Run on the exact commit to be deployed, not a prior version.

- [ ] **Gate 3:** Integration tests pass on an `arc-anvil --network arc` fork of Arc Mainnet.
  This is required to verify native-USDC behavior, which standard `anvil` does not replicate.

- [ ] **Gate 4:** A second reviewer (not the original author) has independently verified
  the constructor arguments, the USDC address, and the chain ID guard in `contracts/script/Deploy.s.sol`.

- [ ] **Gate 5:** The Arc Mainnet USDC address is re-verified against the official Arc docs
  at the time of deployment (not at the time this document was written):
  https://docs.arc.io/arc/references/contract-addresses

- [ ] **Gate 6:** Legal review of the terms-hash anchoring approach (the enforceability
  of a SHA-256 hash as a contract commitment is jurisdiction-dependent and out of scope
  for this document).

---

## Network Configuration Verification

Before deployment, verify the following against official Arc documentation:

| Value | Expected | Source |
|---|---|---|
| Chain ID | 5042 | https://docs.arc.io/arc/references/connect-to-arc |
| RPC URL | `https://rpc.mainnet.arc.io` | Same source |
| Explorer | `https://explorer.arc.io` | Same source |
| USDC address | `0x3600000000000000000000000000000000000000` | https://docs.arc.io/arc/references/contract-addresses |
| USDC decimals (ERC-20) | 6 | Same source |

To verify USDC has code at that address at deploy time:

```bash
cast code 0x3600000000000000000000000000000000000000 \
  --rpc-url https://rpc.mainnet.arc.io
# Must return non-empty bytecode
```

---

## Exporting the Code

To export the full project from Arc Studio:
1. Open the **Code** panel in Arc Studio.
2. Click **Download Code** to download a ZIP of the project.
3. Extract to a local machine with Foundry and Bun installed.
4. Verify the extracted files match what is in this repository.

---

## Deployer Key Setup

Use an encrypted keystore — never pass a private key as a command-line flag
or store it in a plaintext file.

```bash
# Create an encrypted keystore for the deployer account
cast wallet import deployer --interactive
# (prompts for the private key, then a password — key is encrypted on disk)

# Verify the address
cast wallet address --account deployer
```

The deployer wallet should be:
- A dedicated address used only for this deployment
- Funded with USDC on Arc Mainnet (USDC is the gas token)
- Secured with a strong password stored in a password manager
- Never reused for other contract deployments
- Never the client, provider, or resolver in any agreement

---

## Dry-Run Simulation

Before broadcasting, always simulate the deployment:

```bash
forge script contracts/script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --account deployer \
  --simulate
```

Review the simulation output:
- Confirm the USDC address constructor argument matches `0x3600000000000000000000000000000000000000`
- Confirm the chain ID guard allows chain 5042
- Confirm gas estimate looks reasonable

---

## Deployment

Only proceed after all pre-deploy gates are satisfied and the dry-run passes.

```bash
forge script contracts/script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --account deployer \
  --broadcast \
  --verify \
  --etherscan-api-key $ARC_EXPLORER_API_KEY
```

**Important:**
- Stop before signing if anything looks unexpected.
- Once broadcast, transactions on Arc Mainnet are irreversible.
- Record the deployed contract address immediately (it appears in the forge output).
- Arc Studio does not submit this transaction and has no role in this step.

---

## Post-Deploy Steps

### 1. Record the contract address

Update `AGENTS.md`:
```
| Arc Mainnet | MilestonePayEscrow | 0x<your_address> | 0x<tx_hash> |
```

### 2. Verify constructor state

```bash
# Verify the USDC address is correct
cast call 0x<deployed_address> "usdc()(address)" \
  --rpc-url https://rpc.mainnet.arc.io
# Expected: 0x3600000000000000000000000000000000000000

# Verify agreementCounter starts at 1
cast call 0x<deployed_address> "agreementCounter()(uint256)" \
  --rpc-url https://rpc.mainnet.arc.io
# Expected: 1
```

### 3. Update frontend configuration

```bash
# In your local project directory
echo "VITE_CONTRACT_ADDRESS=0x<deployed_address>" >> .env
```

### 4. Rebuild the frontend

```bash
bun run build
```

### 5. Update server CORS

In `server/index.ts`, update the CORS origin to match your production frontend domain:
```typescript
app.use('*', cors({
  origin: ['https://your-domain.com'],
  ...
}))
```

### 6. Run a small controlled test transaction

Before opening to users, create one test agreement with minimal amounts using the
production frontend. Verify:
- Agreement creates and emits `AgreementCreated`
- Fund flow (approve + fund) works correctly
- Indexer picks up the event within one poll cycle (12 s)
- Explorer shows the transaction correctly

---

## Backend Deployment

The backend (Hono API + Postgres) requires a server environment (not a static host).
Deployment options:

- **Docker Compose** on a VPS (recommended for initial deployment)
- **Railway, Render, Fly.io** — platforms that support Docker and managed Postgres
- **Kubernetes** for larger-scale production

**Required environment variables (production):**
```
DATABASE_URL         — Postgres connection string
SESSION_SECRET       — Random 32+ byte secret for session signing
API_PORT             — Port for the Hono server (default: 3001)
VITE_CONTRACT_ADDRESS — Deployed contract address
RPC_PROXY_BASE_URL   — Optional Circle RPC proxy base URL
RPC_PROXY_TOKEN      — Optional RPC proxy auth token
RPC_PROXY_CHAINS     — Comma-separated chain keys (e.g. Arc_Mainnet)
```

Update `server/index.ts` CORS origin to your production frontend domain before deploying.

---

## Contract Source Verification

After deployment, submit the contract source for public verification on the Arc Explorer:

```bash
forge verify-contract 0x<deployed_address> contracts/MilestonePayEscrow.sol:MilestonePayEscrow \
  --rpc-url https://rpc.mainnet.arc.io \
  --etherscan-api-key $ARC_EXPLORER_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000)
```

Verified source lets users and auditors independently inspect the contract code.

---

## Mainnet Warning

Transactions on Arc Mainnet involve real funds and are irreversible once submitted.
Arc Studio does not and cannot deploy to mainnet, submit mainnet transactions, sign on
your behalf, fund deployer wallets, or take any responsibility for mainnet outcomes.

Any code used for mainnet must be independently reviewed, tested, validated, deployed,
and operated by you. You are solely responsible for any losses, errors, or consequences
resulting from mainnet use of this code.
