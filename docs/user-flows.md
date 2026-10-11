# MilestonePay — User Flows

**Version:** 1.0
**Date:** 2026-10-11

---

## Prerequisites

Both the client and provider need:
- A self-custody EVM wallet (MetaMask, Rabby, or similar)
- USDC on Arc Mainnet (`0x3600000000000000000000000000000000000000`)
- The app URL
- Each other's Arc Mainnet wallet address

The USDC balance also covers gas fees on Arc (USDC is the native gas token).

---

## Flow 1 — Happy Path

```
[Off-app — both parties]
  Client and provider agree on scope, deliverables per milestone, total price.
  They exchange Arc Mainnet wallet addresses.
  They agree on a resolver address (neutral third party).

[Client — browser]
  1. Open app → Connect Wallet (Arc Mainnet)
  2. Click "New agreement"
  3. Step 1 — Parties:
       • Enter provider wallet address
       • Enter resolver wallet address
       • Paste full agreement text → app computes SHA-256 hash
  4. Step 2 — Milestones:
       • Add 1–5 milestones, each with: title, USDC amount, submission deadline, max revisions
  5. Step 3 — Dispute terms:
       • Set dispute resolution window (1–90 days)
       • Choose default outcome if resolver doesn't act
       • Review summary → "Create agreement"
  6. Wallet prompts for signature → sign
  7. Transaction confirmed on Arc Mainnet
       → AgreementCreated event emitted
       → Agreement ID shown; share with provider
  8. Click "Fund Milestone 1"
  9. Step 1 — Approve:
       • UI shows exact USDC amount and contract address
       • Wallet prompts "Approve X USDC to contract" → sign
  10. Step 2 — Fund:
       • Wallet prompts "fund()" → sign
       • MilestoneFunded event emitted
       → Status: "Funded — awaiting delivery"

[Provider — browser]
  11. Open app → Connect wallet → Dashboard
  12. See agreement (by agreement ID or wallet filter)
  13. Work on deliverable offchain
  14. When ready: click "Submit deliverable"
       • Paste deliverable URL or content → app hashes it client-side
       • Optionally add a delivery note (stored in backend, not onchain)
       • Click "Submit onchain" → wallet signs submitDeliverable()
       • DeliverableSubmitted event emitted
       → Status: "Submitted — awaiting client review"

[Client — browser]
  15. See milestone status change to "Submitted"
  16. Review deliverable (offchain — click IPFS/HTTPS reference)
  17. If accepted: click "Approve payment" → wallet signs approveRelease()
       • PaymentReleased event emitted (to pendingWithdrawals)
       → Status: "Released"
  18. Provider sees pending withdrawal balance; clicks "Withdraw" → wallet signs withdraw()
       • USDC arrives in provider wallet

Repeat steps 8–18 for each milestone.
```

---

## Flow 2 — Client Requests Changes

```
After provider submits, client reviews and finds deliverable incomplete.

[Client]
  1. Click "Request changes" on the submitted milestone
  2. Enter reason (hashed client-side before submission)
  3. Wallet signs requestChanges()
  4. ChangesRequested event emitted; revision counter increments
  → Status: "Changes Requested" (Revision)

[Provider]
  5. See change request; revision count shown (e.g. "1 of 3 revisions used")
  6. Update deliverable offchain
  7. Submit new hash onchain → wallet signs submitDeliverable()
  → Status: "Submitted"

[Client]
  8. Review again → approve or request further changes

If revision count reaches the milestone's maxRevisions:
  • requestChanges() auto-escalates to Disputed
  • Dispute deadline set (disputeTimeout from now)
  → Flow 3 applies
```

---

## Flow 3 — Dispute

```
Either party raises a dispute on a funded, submitted, or revision milestone.

[Either party]
  1. Click "Raise dispute" → enter reason text (hashed client-side)
  2. Optionally submit evidence references to backend (URLs or IPFS CIDs)
  3. Wallet signs raiseDispute()
  4. DisputeRaised + DisputeDeadlineSet events emitted
  → Status: "Disputed"
  → Neither party can take further unilateral action

[Off-app — both parties]
  5. Share evidence with resolver
  6. Resolver reviews the evidence offchain

[Resolver — browser]
  7. Open app → Connect resolver wallet → find disputed agreement
  8. Click "Resolve dispute"
  9. Choose: "Release to provider" or "Refund client"
  10. Wallet signs resolveDispute(toProvider: bool)
  → DisputeResolved event emitted
  → Status: "Released" or "Refunded"

[If resolver doesn't act within disputeTimeout]
  11. After disputeDeadline passes, EITHER party sees "Claim after timeout" button
  12. Click → wallet signs claimDisputeRefund()
  → Outcome determined by disputeDefaultToProvider setting (chosen at agreement creation)
  → Status: "Released" (provider) or "Refunded" (client)
```

---

## Flow 4 — Expiry / Provider No-Show

```
Provider has not submitted by the milestone's submission deadline (expiry).
Milestone must be in Funded status (not yet submitted).

[Client]
  1. Open milestone → expiry has passed → "Claim refund" button appears
  2. Wallet signs claimRefund()
  3. RefundClaimed event emitted
  → Status: "Refunded"
  → Client's pendingWithdrawals credited with milestone amount
  4. Click "Withdraw" → USDC returned to client wallet
```

---

## Flow 5 — Withdraw Pending Balance

```
Any party (provider after approval, client after refund/dispute) with a
pending balance can withdraw at any time.

[Party]
  1. Dashboard shows "Pending withdrawal: X USDC"
  2. Click "Withdraw" → wallet signs withdraw()
  3. Withdrawn event emitted
  → USDC arrives in wallet
```

---

## Error States and Recovery

| Error | UI message | Recovery |
|---|---|---|
| Wrong chain | "Switch to Arc Mainnet" banner | User switches chain in wallet |
| Insufficient USDC (including gas) | "Insufficient USDC balance — USDC is the gas token on Arc" | User acquires USDC |
| User cancelled tx | "Transaction cancelled." | User retries |
| RPC timeout | "RPC timeout — check Arc Explorer before retrying" | User checks explorer, retries |
| Contract rejected (wrong role) | "Only the client / provider / resolver can perform this action" | User checks their role |
| Milestone expired | "Submission deadline has passed" | Provider cannot submit; client can claim refund |
| Duplicate submission blocked | Button disabled while tx pending | User waits for confirmation |
| USDC blocklist | "An address in this transaction is on the USDC blocklist" | Contact Circle support |
| Backend unavailable | "Status unavailable — chain data cannot be verified" | Manual refresh button shown |
