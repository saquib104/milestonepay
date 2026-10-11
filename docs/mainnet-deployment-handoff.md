# MilestonePayEscrow — Mainnet Deployment Handoff

**Target chain:** Arc Mainnet (chain ID 5042)
**USDC constructor arg:** `0x3600000000000000000000000000000000000000`
**Status:** READY FOR PRE-DEPLOY GATES — not yet deployed

> Arc Studio does not submit mainnet transactions. This document describes every step
> required to deploy from your own machine after all gates are satisfied.

---

## Pre-Deploy Gates (all must be satisfied before broadcasting)

- [ ] **G1 — Independent professional audit** of `contracts/MilestonePayEscrow.sol` by a
  third-party firm. Do not skip. The Arc Studio review is not a substitute.
- [ ] **G2 — 100% branch coverage** confirmed by running `forge coverage` and reviewing the
  report. The 61-test suite covers all named paths; verify no hidden branches remain.
- [ ] **G3 — arc-anvil fork test** against a fork of Arc Mainnet:
  `arc-anvil --network arc` then run your integration suite against the fork.
- [ ] **G4 — Legal review**: confirm the terms-hash model, dispute resolution, and cross-border
  flow are compliant in your target jurisdictions.
- [ ] **G5 — Security-review sign-off**: a qualified reviewer has read `docs/security-review.md`
  and the resolved findings, and accepts the residual risks.

---

## Exportable Build

From the project root, produce the deployable artifact:

```bash
# 1. Export the project from Arc Studio (Download Code button in the Code panel)
# 2. On your own machine:

cd MilestonePay
bun install           # or: npm install
forge build           # confirm: Compiler run successful
```

Artifact produced: `contracts/out/MilestonePayEscrow.sol/MilestonePayEscrow.json`

---

## Deployment (Foundry — from your own machine)

### One-time: import your deployer key into Foundry's encrypted keystore

```bash
cast wallet import deployer --interactive
# Paste your private key when prompted; set a strong password.
# The key is stored encrypted at ~/.foundry/keystores/deployer
# NEVER pass the raw private key as a CLI flag in any non-local environment.
```

### Deploy

```bash
forge create contracts/MilestonePayEscrow.sol:MilestonePayEscrow \
  --rpc-url https://rpc.mainnet.arc.io \
  --account deployer \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api
```

This command will:
1. Prompt for your keystore password.
2. Compile and deploy the contract.
3. Attempt source verification on the Arc Mainnet explorer.

Record the deployed address printed in the output.

---

## Post-Deploy Checklist

- [ ] **Verify on explorer**: confirm source is verified at https://explorer.arc.io/address/<deployed-address>
- [ ] **Smoke test on mainnet** (tiny amounts only):
  1. Call `createAgreement` with 1 USDC milestone and a short expiry.
  2. Call `fund` (approve USDC first).
  3. Call `submitDeliverable` from provider wallet.
  4. Call `approveRelease` from client wallet.
  5. Call `withdraw` from provider wallet — confirm receipt.
- [ ] **Record the address** in `AGENTS.md` under `[mainnet-deployments]`.
- [ ] **Lock the deployer key** — remove from keystore or revoke access if it served only as deployer.

---

## Constructor Arguments Reference

| Parameter | Value | Notes |
|---|---|---|
| `usdc_` | `0x3600000000000000000000000000000000000000` | Arc Mainnet USDC predeploy. Do not substitute. Verify against https://docs.arc.io/arc/references/contract-addresses before deploying. |

---

## Key Contract Facts for Frontend Integration

| Item | Value |
|---|---|
| Chain ID | `5042` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` |
| USDC decimals (ERC-20 view) | `6` |
| `createAgreement` signature | `createAgreement(address provider, address resolver, bytes32 termsHash, uint256[] amounts, uint256[] expiries, uint8[] maxRevisions, uint256 disputeTimeout, bool disputeDefaultToProvider)` |
| Amounts unit | USDC atomic units (6 decimals) — e.g. 100 USDC = `100_000_000` |
| Max milestones | 5 |
| Dispute timeout range | 1 day – 90 days (pass `0` for 30-day default) |
| Payment model | Pull — recipients call `withdraw()` to claim credits |
| Explorer | https://explorer.arc.io |
| RPC | https://rpc.mainnet.arc.io |

---

## ABI Excerpt (key functions)

Full ABI is in `contracts/out/MilestonePayEscrow.sol/MilestonePayEscrow.json` after `forge build`.

```
createAgreement(address,address,bytes32,uint256[],uint256[],uint8[],uint256,bool) → uint256
fund(uint256,uint8)
submitDeliverable(uint256,uint8,bytes32)
approveRelease(uint256,uint8)
requestChanges(uint256,uint8,bytes32)
raiseDispute(uint256,uint8,bytes32)
resolveDispute(uint256,uint8,bool)
claimRefund(uint256,uint8)
claimDisputeRefund(uint256,uint8)
withdraw()
pendingWithdrawals(address) → uint256
agreements(uint256) → (address,address,address,bytes32,uint8,bool,uint256,bool)
milestones(uint256,uint8) → (uint256,uint256,uint8,bytes32,bytes32,uint8,uint8,uint256)
```

---

*Warning: Transactions on mainnet involve real funds and are irreversible. Arc Studio does not
deploy to, transact on, or sign for mainnet. All mainnet steps must be executed by you, outside
Arc Studio, after independently reviewing the code. You are solely responsible for any losses.*
