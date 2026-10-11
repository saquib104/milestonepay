# MilestonePay — Privacy and Data

**Version:** 1.0
**Date:** 2026-10-11

---

## Data Categories

### Onchain (public, permanent)

Stored in `MilestonePayEscrow.sol` on Arc Mainnet.
All onchain data is publicly readable by anyone.

| Data | Field | Notes |
|---|---|---|
| Client wallet address | `agreement.client` | Public identifier, not a legal identity |
| Provider wallet address | `agreement.provider` | Public identifier |
| Resolver wallet address | `agreement.resolver` | Public identifier |
| Terms hash | `agreement.termsHash` | SHA-256 of offchain document; not the document itself |
| Milestone amounts (USDC) | `milestone.amount` | 6-decimal ERC-20 units |
| Milestone expiry timestamps | `milestone.expiry` | Unix timestamp |
| Deliverable hash | `milestone.deliverableHash` | Hash of offchain content; not the content |
| Change-request / dispute reason hash | `milestone.reasonHash` | Hash only |
| Revision count, max revisions | `milestone.revisionCount/maxRevisions` | Numeric |
| Milestone status | `milestone.status` | Enum (0–6) |
| Dispute deadline, timeout | `milestone.disputeDeadline`, `agreement.disputeTimeout` | Timestamps/duration |
| Pending withdrawal balance | `pendingWithdrawals[address]` | Amount in escrow |

**Important:** No personal names, email addresses, IP addresses, document content,
deliverable files, or dispute evidence text is stored onchain.

---

### Offchain (private, server-controlled)

Stored in Postgres via the Hono API server. Access is restricted to participants.

| Table | Data stored | Sensitivity |
|---|---|---|
| `users` | Wallet address (public), display name (optional), notification preference, notify email (optional) | Low–Medium |
| `projects` | Title, description, terms hash (public), version, participant addresses (public) | Low |
| `milestones_meta` | Per-milestone title and description | Low |
| `submission_notes` | Deliverable reference URL/CID, deliverable hash (public), note text | Medium |
| `dispute_evidence` | Evidence reference URL/CID, optional SHA-256 hash | Medium |
| `chain_events` | Indexed event data (tx hash, block number, decoded public event fields) | Low |
| `indexer_state` | Last indexed block number, last poll timestamp | Low |
| `deletion_requests` | Wallet address, request timestamp | Low |

**Not stored:**
- Private keys, seed phrases, wallet recovery data
- Circle entity secrets
- Full agreement text (only a hash)
- Dispute evidence files (only URL/CID references)
- Any information not voluntarily provided by the user

---

## Data Flow Diagram

```
User's browser
    │
    ├─ Hash computation (WebCrypto, client-side)
    │    └─ termsText → SHA-256 → termsHash (sent to contract, never to server)
    │    └─ deliverable → SHA-256 → deliverableHash (sent to contract)
    │    └─ reason → SHA-256 → reasonHash (sent to contract)
    │
    ├─ Wallet interaction (wagmi/viem → user's wallet → Arc Mainnet RPC)
    │    └─ All signed transactions go directly to Arc Mainnet
    │    └─ Arc Studio never has custody of keys or signed transactions
    │
    └─ Backend API calls (fetch → /api/* → Hono server → Postgres)
         └─ project title, milestone descriptions
         └─ delivery note + reference URL (provider)
         └─ evidence reference URL (any party)
         └─ display name + notification preference (user)

Arc Mainnet (public)
    └─ All onchain data is publicly readable via any Arc RPC

Postgres (private)
    └─ Accessible only to API server process
    └─ Connection string stored in server-side .env (never in frontend)
    └─ Never exposed directly to the browser
```

---

## Authorization

API authorization is enforced server-side:

| Operation | Who can access |
|---|---|
| Read own user profile | Own wallet only |
| Update own user profile | Own wallet only |
| Create/read project metadata | Client or provider of that project |
| Read/write submission notes | Any project participant (client, provider, resolver) |
| Read/write dispute evidence | Any project participant |
| Read indexed events | Any project participant |
| Request account deletion | Own wallet only |
| Any admin access | None — no admin routes exist |

v1 uses `X-Wallet-Address` header for identity (see security note in `docs/security-and-threat-model.md`).

---

## Retention and Deletion Policy

| Data | Retention | Deletion |
|---|---|---|
| User display name + email | Until user requests deletion | Cleared immediately on DELETE /users/:wallet; row retained for audit trail |
| Project metadata | For duration of agreement lifecycle | Eligible for deletion 1 year after all milestones terminal |
| Submission notes | 2 years after milestone terminal | Batch deletion job |
| Dispute evidence references | 3 years after dispute resolved | Batch deletion job (legal hold may apply) |
| Chain events (indexed) | Permanent (public onchain data) | Not deleted — these are public blockchain records |
| Deletion request log | 7 years | Regulatory requirement |

**User deletion request flow:**
1. User calls `DELETE /users/:wallet`
2. Server immediately clears `display_name` and `notify_email` from `users` row
3. Inserts a record in `deletion_requests`
4. Full data removal (associated notes, evidence) runs on a scheduled batch job within 30 days
5. Wallet address itself is retained as a project participant identifier (it is a public blockchain address)

---

## What Is Explicitly NOT Stored

- Private keys or seed phrases (never)
- Full agreement text (only SHA-256 hash)
- Dispute evidence files (only IPFS/HTTPS reference URLs)
- Deliverable file content (only hash and optional reference URL)
- Payment amounts or escrow balances (read from contract, not stored)
- Milestone status (read from contract, not stored)
- IP addresses in application logs (not collected by default)

---

## Data Minimization Principles

1. Hashing: sensitive agreement content is reduced to a fixed-size hash before any network transit.
2. References over content: files stay on IPFS or the user's own storage; only URLs are stored.
3. Optional fields: display names and email addresses are optional. The app works fully without them.
4. Server-side secrets only: `DATABASE_URL`, `SESSION_SECRET`, and `RPC_PROXY_TOKEN` never leave the server.
5. No analytics: the application does not include any third-party analytics or tracking scripts.
6. No VITE_ secrets: all `VITE_`-prefixed env vars are public values (contract address, WalletConnect project ID). No secret takes a `VITE_` prefix.
