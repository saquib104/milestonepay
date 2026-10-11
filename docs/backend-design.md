# MilestonePay Backend Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Vite / React / wagmi)                         │
│   • Reads escrow state directly from Arc Mainnet        │
│   • Writes offchain metadata to /api/* (Vite proxy)     │
└────────────────────┬────────────────────────────────────┘
                     │ /api/* (Vite proxy strips /api)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Hono API Server  (Bun, port 3001, localhost only)      │
│   • Auth: X-Wallet-Address header (v1, no signature)    │
│   • Authorization: participant check per project        │
│   • Rate limit: 120 req/60s/IP, 10 writes/60s/wallet   │
│   • Validates all inputs; never logs user content       │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐       ┌──────────────────────────────┐
│  Postgres 18     │       │  Chain Event Indexer          │
│  (Docker, named  │◄──────│  (same Bun process)           │
│  volume, 5432)   │       │  • eth_getLogs via RPC proxy  │
│                  │       │  • Batch: 500 blocks/call     │
│  Tables:         │       │  • Poll: every 12 s           │
│  users           │       │  • Dedup: ON CONFLICT NOTHING │
│  projects        │       │  • Reorg safety: -10 blocks   │
│  milestones_meta │       │  • Retry: 3× with backoff     │
│  submission_notes│       └──────────────────────────────┘
│  dispute_evidence│
│  chain_events    │
│  indexer_state   │
│  deletion_reqs   │
└──────────────────┘
```

## Source-of-Truth Rule

```
CHAIN (MilestonePayEscrow contract)
  └─ authoritative for:
       escrow balances, funded state, milestone status,
       released/refunded amounts, all fund flows

BACKEND DATABASE
  └─ authoritative for:
       project titles, milestone descriptions, submission notes,
       dispute evidence references, user display names,
       indexed event history (activity feed)
```

Milestone "paid" status is NEVER shown based on a database record alone.
The frontend must confirm via a live contract read (`milestones()`) or
wait for the Withdrawn/PaymentReleased event to appear in `chain_events`
AND re-verify the contract state.

## Database Schema

See `server/schema.sql` for the authoritative DDL.

### Table: `users`
| Column | Type | Notes |
|---|---|---|
| wallet_address | TEXT PK | lowercase 0x hex; not a verified legal identity |
| display_name | TEXT | optional; max 80 chars; PII — cleared on deletion |
| notify_email | TEXT | optional; not returned in API responses |
| notify_on_events | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

### Table: `projects`
| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| agreement_id | NUMERIC(78) UNIQUE | onchain uint256 |
| chain_id | INTEGER | 5042 (Arc Mainnet) |
| title | TEXT | max 120 chars |
| description | TEXT | max 2000 chars |
| terms_hash | TEXT | bytes32 hex matching `agreements[id].termsHash` |
| terms_version | TEXT | semver label; optional |
| client_address | TEXT | mirrors onchain; for fast participant lookup |
| provider_address | TEXT | mirrors onchain |
| resolver_address | TEXT | nullable |
| indexed_at | TIMESTAMPTZ | last indexer sync |

### Table: `milestones_meta`
| Column | Type | Notes |
|---|---|---|
| project_id | BIGINT FK | |
| milestone_index | SMALLINT 0–4 | matches onchain uint8 index |
| title | TEXT | max 120 chars |
| description | TEXT | max 1000 chars |

### Table: `submission_notes`
Stores provider submission context per milestone deliverable.

| Column | Type | Notes |
|---|---|---|
| project_id | BIGINT FK | |
| milestone_index | SMALLINT | |
| submitter | TEXT | wallet address |
| deliverable_ref | TEXT | URL or IPFS CID; never the file content |
| deliverable_hash | TEXT | bytes32 hex matching onchain `deliverableHash` |
| note | TEXT | max 1000 chars; private |

### Table: `dispute_evidence`
References to evidence stored externally (IPFS, provider storage).
Content is NEVER stored here.

| Column | Type | Notes |
|---|---|---|
| project_id | BIGINT FK | |
| milestone_index | SMALLINT | |
| submitted_by | TEXT | wallet address |
| evidence_ref | TEXT | IPFS CID or https URL; max 512 chars |
| evidence_hash | TEXT | SHA-256 of referenced content; optional |

### Table: `chain_events`
Indexed contract events. Idempotent by `(tx_hash, log_index)`.

| Column | Type | Notes |
|---|---|---|
| tx_hash + log_index | TEXT, INT UNIQUE | dedup key |
| block_number | BIGINT | |
| block_hash | TEXT | for reorg detection |
| event_name | TEXT | AgreementCreated, MilestoneFunded, … |
| agreement_id | NUMERIC | NULL for Withdrawn |
| milestone_index | SMALLINT | NULL for agreement-level events |
| raw_data | JSONB | decoded event args (bigints → strings) |

### Table: `indexer_state`
Singleton row (id=1). Stores `last_indexed_block` for cursor resume.

### Table: `deletion_requests`
GDPR erasure log. Soft-delete: clears PII immediately; hard-delete of rows runs within 30 days.

## API Endpoint Documentation

Base path: `/api` (Vite proxy target: `http://localhost:3001`)

Auth header: `X-Wallet-Address: 0x...` (lowercase, required on all authenticated routes)

### Health
```
GET /health
→ { status: "ok" | "degraded", db: "connected" | "unavailable" }
No auth required.
```

### Users
```
GET  /users/:wallet            → UserProfile          (own wallet only)
PUT  /users/:wallet            body: { displayName?, notifyOnEvents?, notifyEmail? }
DELETE /users/:wallet          → { ok, message }      (triggers retention workflow)
```

### Projects
```
POST /projects
  body: { agreementId, title, description?, termsHash, termsVersion?,
          clientAddress, providerAddress, resolverAddress?,
          milestones: [{ title, description? }] }
  → { ok, projectId }   HTTP 201

GET /projects/:agreementId     → BackendProject + milestones array
GET /projects/wallet/:wallet   → BackendProject[]   (all projects for wallet)
```

### Submission Notes
```
POST /projects/:agreementId/notes
  body: { milestoneIndex, deliverableHash, deliverableRef?, note? }
  → { ok, id }   HTTP 201

GET /projects/:agreementId/notes/:milestoneIndex
  → SubmissionNote[]
```

### Dispute Evidence
```
POST /projects/:agreementId/evidence
  body: { milestoneIndex, evidenceRef, evidenceHash? }
  → { ok, id }   HTTP 201

GET /projects/:agreementId/evidence/:milestoneIndex
  → DisputeEvidence[]
```

### Events & Indexer
```
GET /events/:agreementId        → ChainEvent[]  (indexed events, asc block order)
GET /indexer/status             → { lastIndexedBlock, lastIndexedAt }
```

## Event Indexing Design

### Polling model
The indexer calls `eth_getLogs` for the contract address in batches of up
to 500 blocks. The batch size trades off recency vs. request cost; it can
be tuned via BATCH_SIZE in `server/indexer.ts`.

### Idempotency
Every `(tx_hash, log_index)` pair is unique per chain. The insert uses
`ON CONFLICT (tx_hash, log_index) DO NOTHING`. Duplicate delivery has no
side effects.

### Reorg safety
On each poll cycle the indexer re-processes from (cursor − 10 blocks).
Events from removed=true logs (orphaned blocks) are dropped before insert.
The `block_hash` column allows external verification but the indexer does
not currently re-verify historical block hashes.

### Restart / pause-resume recovery
The indexer cursor (`last_indexed_block`) survives in Postgres.
On restart the indexer re-applies the reorg window and then resumes from
the cursor. No events are lost as long as the chain's block history is
available from the RPC provider.

### Error handling
- RPC call failures: retried up to 3× with exponential backoff (5 s, 10 s, 15 s)
- After 3 failures: the cycle is abandoned; next poll retries from cursor
- Unknown event signatures: stored as raw `{ topics, data }` — not dropped
- DB insert errors: logged (message only); processing continues for other logs

### Status unavailability
When the indexer is behind (e.g. RPC unavailable), the frontend shows
"status unavailable" rather than stale data. The `GET /indexer/status`
endpoint provides the last indexed block so the UI can calculate lag.

## Privacy and Data Flow

```
USER BROWSER
  │
  ├─ onchain writes (wagmi/viem) ──────────────────► ARC MAINNET CONTRACT
  │    Wallet signs; no server involved.             (public, permanent)
  │    No private data in onchain fields.
  │
  ├─ offchain writes (fetch /api) ─────────────────► API SERVER
  │    X-Wallet-Address header (claimed, not signed)  │
  │    Body: title, description, notes, evidence refs │
  │    No: files, private keys, personal documents    │
  │                                                   ▼
  │                                               POSTGRES
  │                                               (titles, notes,
  │                                                evidence refs,
  │                                                display names)
  │
  └─ onchain reads (wagmi/viem) ──────────────────► ARC MAINNET RPC
       Direct; no server involved.                  (always authoritative)

INDEXER (server-side)
  ├─ reads: eth_getLogs from Arc Mainnet RPC
  ├─ writes: chain_events table (decoded onchain data only)
  └─ no user content; no private data
```

### Data that NEVER enters the backend:
- Private keys, seed phrases, wallet recovery data
- Circle entity secrets or API keys
- Full agreement text or work files
- Dispute evidence content (only CID/URL references)
- Personal identification documents

### Data minimization:
- `notify_email` is stored but never returned in API responses
- Wallet addresses are stored as identifiers, not verified identities
- The `chain_events.raw_data` column contains decoded onchain fields only

## Retention and Deletion Policy

| Data | Retention period | Deletion trigger |
|---|---|---|
| User display name, notify_email | Until deletion request | DELETE /users/:wallet |
| Project title, description | Until deletion request | DELETE /users/:wallet |
| Milestone descriptions | Until deletion request | CASCADE from project |
| Submission notes | Until deletion request | CASCADE from project |
| Dispute evidence refs | Until deletion request | CASCADE from project |
| chain_events (indexed history) | Indefinite (public data) | Not deleted (public onchain) |
| indexer_state | Indefinite | Not deleted |
| deletion_requests log | 2 years | Manual purge |

**Deletion workflow:**
1. `DELETE /users/:wallet` immediately clears `display_name` and `notify_email`
   from the `users` row and logs a `deletion_requests` record.
2. A scheduled job (to be implemented: `server/retention.ts`) runs the hard
   delete of all `projects`, `milestones_meta`, `submission_notes`, and
   `dispute_evidence` rows linked to the wallet within 30 days.
3. `chain_events` rows are NOT deleted — they record public onchain facts
   and are not personal data under most jurisdictions.

## Security Notes

- **No signature verification in v1.** The `X-Wallet-Address` header is
  claimed but not cryptographically verified. Authorization is enforced by
  checking that the claimed address appears as client, provider, or resolver
  in the referenced onchain agreement. A future v2 upgrade should require an
  EIP-4361 SIWE signed message.

- **Rate limiting** is in-memory per IP and per wallet. For production,
  move to a Redis-backed sliding window to survive restarts and scale
  across multiple API server instances.

- **CORS** allows only `localhost:5173` in dev. For production, restrict to
  the deployed frontend hostname.

- **Sessions** (`SESSION_SECRET`) are reserved for the SIWE v2 upgrade.
  HTTP-only cookies will be used; the secret must be generated with
  `openssl rand -hex 32` and kept in environment variables only.

- **No admin keys.** There is no admin route that can seize funds or access
  all users' data. The only privileged operations are self-service
  (own wallet) and participant-scoped (agreement participants).

- **No file uploads.** The API accepts only URLs and CIDs as evidence
  references. File storage is the caller's responsibility (IPFS, etc.).
