# MilestonePay — API and Data Model

**Version:** 1.0
**Date:** 2026-10-11
**Base URL (dev):** `http://localhost:5173/api` (proxied by Vite to `http://localhost:3001`)
**Auth:** `X-Wallet-Address: 0x...` header on all authenticated endpoints

---

## Authentication

All endpoints except `/health` require the `X-Wallet-Address` header containing the
caller's wallet address (lowercase hex `0x...`).

**V1 note:** The header is trusted without cryptographic verification. See
`docs/security-and-threat-model.md` for the v2 upgrade path (EIP-4361 SIWE).

---

## Endpoints

### Health

#### `GET /health`

Returns server and database status.

**Response 200:**
```json
{ "status": "ok", "db": "connected" }
```

**Response 503:**
```json
{ "status": "degraded", "db": "unavailable" }
```

---

### Users

#### `GET /users/:wallet`

Returns the user profile for the given wallet address. Caller must match `:wallet`.

**Response 200:**
```json
{
  "wallet_address": "0x...",
  "display_name": "Alice",
  "notify_on_events": true,
  "created_at": "2026-10-11T..."
}
```

Note: `notify_email` is never returned.

**Response 401:** Unauthorized (caller != wallet)
**Response 404:** User not found

---

#### `PUT /users/:wallet`

Upserts a user profile. Caller must match `:wallet`.

**Request body:**
```json
{
  "displayName": "Alice",
  "notifyEmail": "alice@example.com",
  "notifyOnEvents": true
}
```

All fields optional. `displayName` max 80 chars. `notifyEmail` max 254 chars.

**Response 200:** `{ "ok": true }`

---

#### `DELETE /users/:wallet`

Logs a data deletion request and immediately clears PII from the user row.
Full data removal runs within 30 days.

**Response 200:**
```json
{ "ok": true, "message": "Deletion request logged. Offchain data will be removed within 30 days." }
```

---

### Projects

#### `POST /projects`

Creates project metadata after an onchain agreement has been created.
Caller must be `clientAddress` or `providerAddress`.

**Request body:**
```json
{
  "agreementId": "1",
  "title": "Website Redesign",
  "description": "Full redesign of acme.com",
  "termsHash": "0x...",
  "termsVersion": "v1.0",
  "clientAddress": "0x...",
  "providerAddress": "0x...",
  "resolverAddress": "0x...",
  "milestones": [
    { "title": "Discovery", "description": "Research and wireframes" },
    { "title": "Design", "description": "High-fidelity mockups" }
  ]
}
```

`agreementId`: string representation of uint256.
`milestones`: array of 0–5 objects; `title` required (max 120), `description` optional (max 1000).

**Response 201:** `{ "ok": true, "projectId": 42 }`

---

#### `GET /projects/:agreementId`

Returns project metadata including milestone descriptions.
Caller must be a participant.

**Response 200:**
```json
{
  "id": 42,
  "agreement_id": "1",
  "chain_id": 5042,
  "title": "Website Redesign",
  "description": "...",
  "terms_hash": "0x...",
  "terms_version": "v1.0",
  "client_address": "0x...",
  "provider_address": "0x...",
  "resolver_address": "0x...",
  "indexed_at": null,
  "created_at": "2026-10-11T...",
  "milestones": [
    { "milestoneIndex": 0, "title": "Discovery", "description": "..." }
  ]
}
```

---

#### `GET /projects/wallet/:wallet`

Lists all projects where `:wallet` is client, provider, or resolver. Caller must match `:wallet`.

**Response 200:** Array of project summary objects (without milestone detail).

---

### Submission Notes

#### `POST /projects/:agreementId/notes`

Saves a delivery note for a milestone. Caller must be a participant.

**Request body:**
```json
{
  "milestoneIndex": 0,
  "deliverableHash": "0x...",
  "deliverableRef": "https://ipfs.io/ipfs/bafybeig...",
  "note": "Wireframes and research deck attached."
}
```

`deliverableRef`: HTTPS URL or IPFS CID (max 512 chars, optional).
`note`: max 1000 chars, optional.

**Response 201:** `{ "ok": true, "id": 7 }`

---

#### `GET /projects/:agreementId/notes/:milestoneIndex`

Returns submission notes for a milestone. Caller must be a participant.

**Response 200:** Array of note objects with `id, milestone_index, submitter, deliverable_ref, deliverable_hash, note, submitted_at`.

---

### Dispute Evidence

#### `POST /projects/:agreementId/evidence`

Saves an evidence reference for a disputed milestone. Caller must be a participant.

**Request body:**
```json
{
  "milestoneIndex": 0,
  "evidenceRef": "https://drive.google.com/...",
  "evidenceHash": "abc123..."
}
```

`evidenceRef`: required, HTTPS URL or IPFS CID (max 512 chars).
`evidenceHash`: optional, 64-char hex SHA-256 of the evidence file.

**Response 201:** `{ "ok": true, "id": 3 }`

---

#### `GET /projects/:agreementId/evidence/:milestoneIndex`

Returns evidence references for a milestone. Caller must be a participant.

**Response 200:** Array of evidence objects.

---

### Chain Events

#### `GET /events/:agreementId`

Returns indexed chain events for an agreement (advisory — contract is source of truth).
Caller must be a participant.

**Response 200:**
```json
[
  {
    "tx_hash": "0x...",
    "log_index": 0,
    "block_number": "1234567",
    "event_name": "MilestoneFunded",
    "milestone_index": 0,
    "raw_data": { "agreementId": "1", "milestoneIndex": "0", "amount": "500000000" },
    "indexed_at": "2026-10-11T..."
  }
]
```

---

### Indexer

#### `GET /indexer/status`

Returns the last indexed block and poll timestamp. Public (no auth required in practice,
no sensitive data returned).

**Response 200:**
```json
{ "last_indexed_block": "1234567", "last_indexed_at": "2026-10-11T..." }
```

---

## Error Responses

All errors return JSON:
```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|---|---|
| 400 | Validation error (field name + description in message) |
| 401 | Missing or mismatched `X-Wallet-Address` header |
| 403 | Caller is not a participant in this project |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error (details not leaked to client) |
| 503 | Database unavailable |

---

## Database Schema

### `users`
```sql
id              SERIAL PRIMARY KEY
wallet_address  TEXT NOT NULL UNIQUE          -- lowercase 0x...
display_name    TEXT                          -- optional, max 80
notify_email    TEXT                          -- optional; never returned in API responses
notify_on_events BOOLEAN DEFAULT TRUE
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### `projects`
```sql
id               SERIAL PRIMARY KEY
agreement_id     TEXT NOT NULL UNIQUE          -- onchain uint256 as string
chain_id         INTEGER NOT NULL DEFAULT 5042
title            TEXT NOT NULL                 -- max 120
description      TEXT                          -- max 2000
terms_hash       TEXT NOT NULL                 -- bytes32 hex
terms_version    TEXT                          -- optional, max 20
client_address   TEXT NOT NULL
provider_address TEXT NOT NULL
resolver_address TEXT
indexed_at       TIMESTAMPTZ                   -- set when indexer sees first event
created_at       TIMESTAMPTZ DEFAULT NOW()
```

### `milestones_meta`
```sql
id              SERIAL PRIMARY KEY
project_id      INTEGER REFERENCES projects(id)
milestone_index SMALLINT NOT NULL
title           TEXT NOT NULL
description     TEXT
updated_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE (project_id, milestone_index)
```

### `submission_notes`
```sql
id              SERIAL PRIMARY KEY
project_id      INTEGER REFERENCES projects(id)
milestone_index SMALLINT NOT NULL
submitter       TEXT NOT NULL                  -- wallet address
deliverable_ref TEXT                           -- HTTPS URL or IPFS CID
deliverable_hash TEXT                          -- bytes32 hex (onchain hash)
note            TEXT                           -- max 1000
submitted_at    TIMESTAMPTZ DEFAULT NOW()
```

### `dispute_evidence`
```sql
id              SERIAL PRIMARY KEY
project_id      INTEGER REFERENCES projects(id)
milestone_index SMALLINT NOT NULL
submitted_by    TEXT NOT NULL
evidence_ref    TEXT NOT NULL                  -- HTTPS URL or IPFS CID
evidence_hash   TEXT                           -- optional SHA-256 hex
submitted_at    TIMESTAMPTZ DEFAULT NOW()
```

### `chain_events`
```sql
id              SERIAL PRIMARY KEY
tx_hash         TEXT NOT NULL
log_index       INTEGER NOT NULL
block_number    TEXT NOT NULL                  -- uint256 as string
block_hash      TEXT NOT NULL
event_name      TEXT NOT NULL
agreement_id    TEXT
milestone_index SMALLINT
raw_data        JSONB NOT NULL DEFAULT '{}'
indexed_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE (tx_hash, log_index)
```

### `indexer_state`
```sql
id                  INTEGER PRIMARY KEY DEFAULT 1
last_indexed_block  TEXT NOT NULL DEFAULT '0'
last_indexed_at     TIMESTAMPTZ
```

### `deletion_requests`
```sql
id              SERIAL PRIMARY KEY
wallet_address  TEXT NOT NULL
requested_at    TIMESTAMPTZ DEFAULT NOW()
completed_at    TIMESTAMPTZ
```
