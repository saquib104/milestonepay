/**
 * MilestonePay Chain Event Indexer
 *
 * Design:
 *   - Polls Arc Mainnet (chain 5042) for MilestonePayEscrow contract events
 *     via eth_getLogs
 *   - Uses the RPC proxy when configured (RPC_PROXY_BASE_URL + token + chains)
 *   - Processes in batches of BATCH_SIZE blocks
 *   - Persists cursor in indexer_state (survives restarts)
 *   - Deduplicates by (tx_hash, log_index) — ON CONFLICT DO NOTHING
 *   - Reorg safety: re-processes last REORG_DEPTH blocks on each restart
 *
 * Source of truth rule:
 *   The indexer records event history for the activity feed only.
 *   The contract is always the source of truth for escrow balances
 *   and current milestone status. Milestone "paid" state is NEVER
 *   inferred from an indexed event alone.
 *
 * Privacy rule:
 *   Decoded event data stored in chain_events.raw_data contains only
 *   fields emitted onchain (addresses, amounts, hashes). No offchain
 *   user content is ever written to this table.
 */

import { sql } from './db'
import { getArcRpcUrl } from './chain-rpc'
import { decodeEventLog } from 'viem'
import type { Abi } from 'viem'
import escrowAbiRaw from '../src/abi/MilestonePayEscrow.json'

const escrowAbi = escrowAbiRaw as Abi

// ── Config ─────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = (process.env.VITE_CONTRACT_ADDRESS ?? '').toLowerCase()
const BATCH_SIZE       = 500     // blocks per eth_getLogs call
const POLL_INTERVAL_MS = 12_000  // 12 s poll — conservative to avoid unknown rate limits
const REORG_DEPTH      = 10      // re-process last N blocks on startup for reorg safety
const MAX_RETRIES      = 3
const RETRY_DELAY_MS   = 5_000

// ── RPC helpers ────────────────────────────────────────────────────────────

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = getArcRpcUrl()
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) {
    throw new Error(`RPC HTTP error ${response.status}`)
  }
  const json = await response.json() as { result?: T; error?: { message: string } }
  if (json.error) throw new Error(`RPC error: ${json.error.message}`)
  if (json.result === undefined) throw new Error('RPC returned no result')
  return json.result
}

async function getLatestBlock(): Promise<bigint> {
  const hex = await rpcCall<string>('eth_blockNumber', [])
  return BigInt(hex)
}

interface RawLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  blockHash: string
  transactionHash: string
  logIndex: string
  removed?: boolean
}

async function getLogs(fromBlock: bigint, toBlock: bigint): Promise<RawLog[]> {
  return rpcCall<RawLog[]>('eth_getLogs', [{
    address: CONTRACT_ADDRESS,
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: '0x' + toBlock.toString(16),
  }])
}

// ── Event decoding ─────────────────────────────────────────────────────────

function extractAgreementId(decoded: Record<string, unknown>): string | null {
  const id = decoded.agreementId
  if (id === undefined || id === null) return null
  return String(id)
}

function extractMilestoneIndex(decoded: Record<string, unknown>): number | null {
  const idx = decoded.milestoneIndex
  if (idx === undefined || idx === null) return null
  return Number(idx)
}

/** Convert bigints to strings for JSON storage; all fields are public onchain data */
function sanitizeDecoded(decoded: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(decoded).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])
  )
}

// ── Persistence ────────────────────────────────────────────────────────────

async function persistLogs(logs: RawLog[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped  = 0

  for (const log of logs) {
    // Skip logs from reorganized blocks
    if (log.removed === true) { skipped++; continue }

    let eventName = 'Unknown'
    let decoded: Record<string, unknown> = {}

    try {
      const result = decodeEventLog({
        abi: escrowAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })
      eventName = result.eventName as string
      decoded   = result.args as Record<string, unknown>
    } catch {
      // Unknown event signature — store raw topics + data only
      decoded = { topics: log.topics, data: log.data }
    }

    const agreementId    = extractAgreementId(decoded)
    const milestoneIndex = extractMilestoneIndex(decoded)
    const rawData        = sanitizeDecoded(decoded)

    const txHash    = log.transactionHash.toLowerCase()
    const logIndex  = parseInt(log.logIndex, 16)
    const blockNum  = BigInt(log.blockNumber)
    const blockHash = log.blockHash.toLowerCase()

    try {
      const result = await sql`
        INSERT INTO chain_events (
          tx_hash, log_index, block_number, block_hash,
          event_name, agreement_id, milestone_index, raw_data
        ) VALUES (
          ${txHash}, ${logIndex}, ${String(blockNum)}, ${blockHash},
          ${eventName}, ${agreementId}, ${milestoneIndex}, ${JSON.stringify(rawData)}
        )
        ON CONFLICT (tx_hash, log_index) DO NOTHING
        RETURNING id
      `
      if (result.length > 0) {
        inserted++
        if (agreementId !== null) {
          await sql`
            UPDATE projects SET indexed_at = NOW()
            WHERE agreement_id = ${agreementId}
          `
        }
      } else {
        skipped++
      }
    } catch (err) {
      // Log only the error message — never the decoded data (could contain user wallet addresses)
      console.error(`[indexer] Failed to persist log at ${txHash}:${logIndex}:`, (err as Error).message)
    }
  }

  return { inserted, skipped }
}

// ── Cursor management ──────────────────────────────────────────────────────

async function getLastIndexedBlock(): Promise<bigint> {
  const rows = await sql`SELECT last_indexed_block FROM indexer_state WHERE id = 1`
  return BigInt((rows[0] as { lastIndexedBlock: string }).lastIndexedBlock ?? 0)
}

async function setLastIndexedBlock(block: bigint): Promise<void> {
  await sql`
    UPDATE indexer_state
    SET last_indexed_block = ${String(block)}, last_indexed_at = NOW()
    WHERE id = 1
  `
}

// ── Retry wrapper ──────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      console.warn(`[indexer] ${label} attempt ${attempt}/${MAX_RETRIES}: ${(err as Error).message}`)
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
      }
    }
  }
  console.error(`[indexer] ${label} failed after ${MAX_RETRIES} attempts — retrying next poll cycle`)
  return null
}

// ── Main indexer loop ──────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return // Contract not yet deployed
  }

  const latestBlock = await withRetry(() => getLatestBlock(), 'getLatestBlock')
  if (latestBlock === null) return

  // Apply reorg safety: re-process from REORG_DEPTH behind last cursor
  let fromBlock = await getLastIndexedBlock()
  if (fromBlock > BigInt(REORG_DEPTH)) fromBlock -= BigInt(REORG_DEPTH)
  else fromBlock = 0n

  if (fromBlock > latestBlock) return

  let current       = fromBlock
  let totalInserted = 0
  let totalSkipped  = 0

  while (current <= latestBlock) {
    const to = current + BigInt(BATCH_SIZE) - 1n < latestBlock
      ? current + BigInt(BATCH_SIZE) - 1n
      : latestBlock

    const logs = await withRetry(() => getLogs(current, to), `getLogs(${current}-${to})`)
    if (logs === null) break // abort this cycle; retry next poll

    const { inserted, skipped } = await persistLogs(logs)
    totalInserted += inserted
    totalSkipped  += skipped

    await setLastIndexedBlock(to)
    current = to + 1n
  }

  if (totalInserted > 0) {
    console.log(
      `[indexer] Synced to block ${latestBlock}: ` +
      `+${totalInserted} new events, ${totalSkipped} duplicates`
    )
  }
}

// ── Exported entry point ───────────────────────────────────────────────────

export async function startIndexer(): Promise<void> {
  console.log('[indexer] Starting MilestonePay chain event indexer')
  console.log(`[indexer] Contract address: ${CONTRACT_ADDRESS || '(not deployed yet — skipping)'}`)

  await runOnce().catch(err =>
    console.error('[indexer] Initial run error:', (err as Error).message)
  )

  const handle = setInterval(async () => {
    try {
      await runOnce()
    } catch (err) {
      console.error('[indexer] Poll error:', (err as Error).message)
    }
  }, POLL_INTERVAL_MS)

  if (handle.unref) handle.unref()
}
