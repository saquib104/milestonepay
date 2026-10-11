# MilestonePay — Operations Runbook

**Version:** 1.0
**Date:** 2026-10-11
**Applies to:** Post-deployment production environment

---

## Service Health Checks

### Frontend

Vite-built static site or Docker-hosted frontend. Verify:
- App loads at production URL
- Wallet connection works (connects to Arc Mainnet chain ID 5042)
- `ChainGuardBanner` does not show when on correct chain

### API Server

```bash
curl https://your-api-domain.com/health
# Expected: {"status":"ok","db":"connected"}
```

If `db` is `"unavailable"`, check Postgres connectivity (see below).

### Indexer

```bash
curl https://your-api-domain.com/indexer/status
# Expected: {"last_indexed_block":"<recent block>","last_indexed_at":"<recent timestamp>"}
```

If `last_indexed_at` is stale by more than 5 minutes, the indexer may have stopped.

### Postgres

```bash
psql "$DATABASE_URL" -c "SELECT 1;"
```

---

## Common Issues

### Indexer falls behind

**Symptom:** `last_indexed_at` is stale; activity feed in UI shows no new events.

**Cause:** RPC rate limit, network timeout, or Postgres connection error.

**Action:**
1. Check server logs: `docker logs <container_name>` or equivalent.
2. Look for `[indexer]` lines with error messages.
3. If RPC is rate-limiting: consider configuring `RPC_PROXY_BASE_URL` / `RPC_PROXY_TOKEN`.
4. If Postgres is unavailable: restore the DB (see Postgres section below).
5. The indexer will automatically catch up from the last cursor on restart — no manual
   re-indexing is required.

### Users see "Status unavailable"

**Symptom:** Frontend shows "status unavailable" banner on milestone cards.

**Cause:** The Arc Mainnet RPC is unreachable from the user's browser (the frontend
reads contract state directly via wagmi/viem).

**Action:**
- Check if Arc Mainnet is experiencing an outage: https://status.arc.io (if available)
- Users can click "Refresh" on the milestone card to retry
- No action on the server side is required — once the RPC recovers, the frontend retries

### API returns 503

**Symptom:** `/health` returns `{"status":"degraded","db":"unavailable"}`.

**Cause:** Postgres is down or connection pool is exhausted.

**Action:**
1. Check Postgres: `docker ps | grep postgres` — is the container running?
2. Restart if down: `docker start milestonepay-pg`
3. Check volume: `docker volume inspect mpgdata` — verify the volume is mounted
4. If pool exhaustion: reduce query load or increase max connections in `server/db.ts`

### Contract call fails with "wrong chain"

**Symptom:** Users see "Switch to Arc Mainnet" banner.

**Cause:** User's wallet is connected to a different network.

**Action:** This is a user-facing issue — they need to switch their wallet to Arc Mainnet
(chain ID 5042). No server-side action needed. The `ChainGuardBanner` guides them.

---

## Database Operations

### Backup

```bash
# Manual backup
pg_dump "$DATABASE_URL" -Fc -f backup_$(date +%Y%m%d).dump

# Verify
pg_restore --list backup_$(date +%Y%m%d).dump | head
```

For production: set up automated daily backups with at least 30 days retention.

### Restore

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists backup_YYYYMMDD.dump
```

### Migration

The migration is idempotent (`IF NOT EXISTS` throughout). Re-running the server after
adding new columns is safe. For destructive migrations, stop the server first.

### Deletion Requests

Run this query periodically (or automate with a cron job):

```sql
-- Find pending deletion requests older than 30 days
SELECT dr.wallet_address, dr.requested_at
FROM deletion_requests dr
WHERE dr.completed_at IS NULL
  AND dr.requested_at < NOW() - INTERVAL '30 days';

-- Delete associated offchain data for a wallet
BEGIN;
DELETE FROM submission_notes sn
  USING projects p
  WHERE sn.project_id = p.id
    AND (p.client_address = $1 OR p.provider_address = $1);
DELETE FROM dispute_evidence de
  USING projects p
  WHERE de.project_id = p.id
    AND (p.client_address = $1 OR p.provider_address = $1);
UPDATE deletion_requests SET completed_at = NOW() WHERE wallet_address = $1;
COMMIT;
```

---

## Updating the Contract Address

After a new deployment:

1. Update `VITE_CONTRACT_ADDRESS` in the server `.env`
2. Restart the API server and indexer (the indexer reads the env var at startup)
3. Reset the indexer cursor to 0 if you want to re-index from the new contract's deploy block:
   ```sql
   UPDATE indexer_state SET last_indexed_block = '<deploy_block - 1>' WHERE id = 1;
   ```
4. Rebuild and redeploy the frontend with the updated `.env`

---

## Monitoring Checklist (production)

- [ ] API `/health` endpoint polled every 60 s (alert on non-200 or `db != "connected"`)
- [ ] Indexer `/indexer/status` checked every 5 min (alert if `last_indexed_at` is > 10 min stale)
- [ ] Postgres disk usage monitored (chain_events table grows over time)
- [ ] Server error logs monitored for `[api] Unhandled error` lines
- [ ] Rate-limit 429 responses monitored for abuse patterns
- [ ] Database backups verified daily

---

## Incident Response

### Funds stuck (contract-level)

If a user reports funds are stuck in the contract:
1. Read the milestone status directly:
   ```bash
   cast call $CONTRACT_ADDRESS "milestones(uint256,uint8)(uint256,uint256,uint8,...)" \
     <agreementId> <milestoneIndex> --rpc-url https://rpc.mainnet.arc.io
   ```
2. Determine the correct function to call based on the state machine.
3. This is a user-action — the app has no admin key. Guide the user to the correct UI action
   or provide a `cast call` command for manual recovery.
4. **Arc Studio cannot submit mainnet transactions on your behalf.**

### Database data loss

1. Stop the API server immediately to prevent further writes.
2. Restore from the most recent backup.
3. Re-index events from the last known good cursor (set `last_indexed_block` appropriately).
4. Restart the server.
5. Verify with `/health` and spot-check project records.

### Frontend compromised (XSS, supply chain)

1. Take the frontend offline immediately.
2. Audit npm dependencies: `npm audit`
3. Check for injected scripts or unauthorized CDN dependencies.
4. Since the app is non-custodial, users' funds in the contract are not affected — only
   metadata and UX are impacted.
5. Rebuild from source, audit the build output, redeploy.

---

## No Admin Functions

This application has **no admin key and no emergency fund-seizure function** in the contract.
In the event of a critical contract bug, the only remedy is:

1. Notify all active users immediately via your communication channel.
2. Guide users to withdraw available funds using the pull-payment function.
3. For disputed milestones: guide the resolver to resolve pending disputes promptly.
4. Deploy a new contract (after audit) and publish migration instructions.
5. Offer users guidance for claiming any stuck funds via direct contract interaction.

There is no shortcut that bypasses the contract's access controls. This is by design.
