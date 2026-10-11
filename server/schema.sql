-- MilestonePay offchain database schema
-- Run once at startup via server/migrate.ts
-- Version: 1

-- ============================================================
-- NOTES ON WHAT IS AND IS NOT STORED
-- ============================================================
-- STORED here (offchain, private):
--   project titles, milestone descriptions, submission notes,
--   dispute evidence references (CIDs/URLs, never content),
--   agreement version text (for hash verification only),
--   user display names, notification preferences.
-- NOT STORED:
--   private keys, seed phrases, Circle entity secrets,
--   full work files, personal identity documents,
--   escrow balances (contract is source of truth).
-- Wallet addresses are stored as public identifiers only.
-- ============================================================

-- ============================================================
-- TABLE: users
-- Minimal profile: display name + notification opt-in.
-- wallet_address is the only identity claim; no verification.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  wallet_address   TEXT        PRIMARY KEY,   -- lowercase 0x hex
  display_name     TEXT,                       -- user-chosen; max 80 chars
  notify_email     TEXT,                       -- optional; not verified here
  notify_on_events BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: projects
-- One project = one onchain agreement + its offchain metadata.
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id               BIGSERIAL   PRIMARY KEY,
  agreement_id     NUMERIC(78) NOT NULL UNIQUE, -- onchain agreementId (uint256)
  chain_id         INTEGER     NOT NULL DEFAULT 5042,
  title            TEXT        NOT NULL,         -- max 120 chars; never onchain
  description      TEXT,                         -- max 2000 chars
  terms_hash       TEXT        NOT NULL,         -- hex bytes32 matching onchain termsHash
  terms_version    TEXT,                         -- semver label e.g. "v1.0"
  -- Participants (mirrors onchain roles; stored for fast lookup only)
  client_address   TEXT        NOT NULL,
  provider_address TEXT        NOT NULL,
  resolver_address TEXT,
  -- Sync state
  indexed_at       TIMESTAMPTZ,                  -- when indexer last synced this agreement
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_client   ON projects (client_address);
CREATE INDEX IF NOT EXISTS idx_projects_provider ON projects (provider_address);
CREATE INDEX IF NOT EXISTS idx_projects_resolver ON projects (resolver_address);

-- ============================================================
-- TABLE: milestones_meta
-- Offchain metadata for each milestone (descriptions, labels).
-- milestone_index matches the onchain uint8 index.
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones_meta (
  id               BIGSERIAL   PRIMARY KEY,
  project_id       BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_index  SMALLINT    NOT NULL CHECK (milestone_index >= 0 AND milestone_index < 5),
  title            TEXT        NOT NULL,          -- max 120 chars
  description      TEXT,                          -- max 1000 chars
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, milestone_index)
);

-- ============================================================
-- TABLE: submission_notes
-- Provider's submission notes per milestone submission.
-- deliverable_ref is a URL or CID pointing to external work.
-- Content of the work is NEVER stored here.
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_notes (
  id               BIGSERIAL   PRIMARY KEY,
  project_id       BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_index  SMALLINT    NOT NULL,
  submitter        TEXT        NOT NULL,          -- wallet address
  deliverable_ref  TEXT,                          -- URL/CID, not the file itself
  deliverable_hash TEXT        NOT NULL,          -- hex bytes32 matching onchain hash
  note             TEXT,                          -- max 1000 chars; private
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_notes_project ON submission_notes (project_id, milestone_index);

-- ============================================================
-- TABLE: dispute_evidence
-- References to evidence artifacts stored externally (IPFS/CID).
-- The content of evidence is NEVER stored in this database.
-- ============================================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id               BIGSERIAL   PRIMARY KEY,
  project_id       BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_index  SMALLINT    NOT NULL,
  submitted_by     TEXT        NOT NULL,          -- wallet address
  evidence_ref     TEXT        NOT NULL,          -- IPFS CID or URL; max 512 chars
  evidence_hash    TEXT,                          -- SHA-256 of referenced content
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_ev_project ON dispute_evidence (project_id, milestone_index);

-- ============================================================
-- TABLE: chain_events
-- Indexed contract events from Arc Mainnet.
-- Source of truth for event history; contract reads are the
-- source of truth for current state.
-- ============================================================
CREATE TABLE IF NOT EXISTS chain_events (
  id               BIGSERIAL   PRIMARY KEY,
  tx_hash          TEXT        NOT NULL,
  log_index        INTEGER     NOT NULL,
  block_number     BIGINT      NOT NULL,
  block_hash       TEXT        NOT NULL,
  event_name       TEXT        NOT NULL,          -- AgreementCreated, MilestoneFunded, …
  agreement_id     NUMERIC(78),                   -- NULL for Withdrawn events
  milestone_index  SMALLINT,                      -- NULL for agreement-level events
  raw_data         JSONB       NOT NULL,          -- decoded event args (no secrets)
  indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotency key: tx_hash + log_index is unique per chain
  UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_events_agreement ON chain_events (agreement_id);
CREATE INDEX IF NOT EXISTS idx_chain_events_block     ON chain_events (block_number);
CREATE INDEX IF NOT EXISTS idx_chain_events_name      ON chain_events (event_name);

-- ============================================================
-- TABLE: indexer_state
-- Tracks indexer cursor to resume after restart.
-- ============================================================
CREATE TABLE IF NOT EXISTS indexer_state (
  id               INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton
  last_indexed_block BIGINT    NOT NULL DEFAULT 0,
  last_indexed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_state (id, last_indexed_block) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TABLE: deletion_requests
-- GDPR/right-to-erasure log. Soft-delete: sets deleted_at.
-- Hard delete of rows runs via a scheduled job (see retention policy).
-- ============================================================
CREATE TABLE IF NOT EXISTS deletion_requests (
  id               BIGSERIAL   PRIMARY KEY,
  wallet_address   TEXT        NOT NULL,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  tables_affected  TEXT[]                         -- which tables had rows removed
);
