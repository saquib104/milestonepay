/**
 * MilestonePay API Server
 * Runtime: Bun  |  Framework: Hono  |  Port: 3001
 *
 * Runs on localhost:3001 and is proxied through Vite at /api.
 * Never exposed directly to the internet in dev.
 *
 * API surface:
 *   GET    /health
 *   GET    /users/:wallet
 *   PUT    /users/:wallet
 *   DELETE /users/:wallet           (data deletion request)
 *   POST   /projects
 *   GET    /projects/:agreementId
 *   GET    /projects/wallet/:wallet
 *   POST   /projects/:agreementId/notes
 *   GET    /projects/:agreementId/notes/:milestoneIndex
 *   POST   /projects/:agreementId/evidence
 *   GET    /projects/:agreementId/evidence/:milestoneIndex
 *   GET    /events/:agreementId
 *   GET    /indexer/status
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql, migrate } from './db'
import { getCallerAddress, isParticipantByAgreementId, normalizeAddress } from './auth'
import {
  ValidationError,
  requireAddress,
  optionalAddress,
  requireString,
  optionalString,
  requireBytes32,
  requireAgreementId,
  requireMilestoneIndex,
  optionalRef,
  optionalSha256,
  optionalEmail,
} from './validate'
import { checkRateLimit } from './rateLimit'

const app = new Hono()

// ── Middleware ─────────────────────────────────────────────────────────────

app.use('*', cors({
  origin: ['http://localhost:5173', 'https://localhost:5173'],
  allowHeaders: ['Content-Type', 'X-Wallet-Address'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// Rate limit: 120 requests / 60 s per IP
app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('host') ?? 'unknown'
  if (!checkRateLimit(ip, 120, 60_000)) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  return next()
})

// Global error handler
app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ error: err.message }, 400)
  }
  // Do not leak internal errors to the client
  console.error('[api] Unhandled error:', err.message)
  return c.json({ error: 'Internal server error' }, 500)
})

// ── Health ─────────────────────────────────────────────────────────────────

app.get('/health', async (c) => {
  try {
    await sql`SELECT 1`
    return c.json({ status: 'ok', db: 'connected' })
  } catch {
    return c.json({ status: 'degraded', db: 'unavailable' }, 503)
  }
})

// ── Users ──────────────────────────────────────────────────────────────────

/** GET /users/:wallet — get user profile */
app.get('/users/:wallet', async (c) => {
  const wallet = normalizeAddress(c.req.param('wallet'))
  if (!wallet) return c.json({ error: 'Invalid address' }, 400)

  const caller = getCallerAddress(c)
  if (!caller || caller !== wallet) return c.json({ error: 'Unauthorized' }, 401)

  const rows = await sql`
    SELECT wallet_address, display_name, notify_on_events, created_at
    FROM users WHERE wallet_address = ${wallet}
  `
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404)
  // Never return notify_email in response
  return c.json(rows[0])
})

/** PUT /users/:wallet — upsert user profile */
app.put('/users/:wallet', async (c) => {
  const wallet = normalizeAddress(c.req.param('wallet'))
  if (!wallet) return c.json({ error: 'Invalid address' }, 400)

  const caller = getCallerAddress(c)
  if (!caller || caller !== wallet) return c.json({ error: 'Unauthorized' }, 401)

  // Rate limit writes: 10/min per wallet
  if (!checkRateLimit(`write:${wallet}`, 10, 60_000)) {
    return c.json({ error: 'Too many requests' }, 429)
  }

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const displayName   = optionalString(body.displayName, 'displayName', 80)
  const notifyEmail   = optionalEmail(body.notifyEmail, 'notifyEmail')
  const notifyOnEvents = typeof body.notifyOnEvents === 'boolean' ? body.notifyOnEvents : true

  await sql`
    INSERT INTO users (wallet_address, display_name, notify_email, notify_on_events, updated_at)
    VALUES (${wallet}, ${displayName}, ${notifyEmail}, ${notifyOnEvents}, NOW())
    ON CONFLICT (wallet_address) DO UPDATE SET
      display_name     = EXCLUDED.display_name,
      notify_on_events = EXCLUDED.notify_on_events,
      updated_at       = NOW()
  `
  // Note: notify_email is only updated if explicitly provided (privacy: don't overwrite with null)
  if (notifyEmail !== null) {
    await sql`UPDATE users SET notify_email = ${notifyEmail} WHERE wallet_address = ${wallet}`
  }

  return c.json({ ok: true })
})

/** DELETE /users/:wallet — data deletion request */
app.delete('/users/:wallet', async (c) => {
  const wallet = normalizeAddress(c.req.param('wallet'))
  if (!wallet) return c.json({ error: 'Invalid address' }, 400)

  const caller = getCallerAddress(c)
  if (!caller || caller !== wallet) return c.json({ error: 'Unauthorized' }, 401)

  // Log deletion request; actual row removal runs on scheduled job (see retention policy)
  await sql`
    INSERT INTO deletion_requests (wallet_address)
    VALUES (${wallet})
  `
  // Immediate: clear PII from users table
  await sql`
    UPDATE users SET
      display_name = NULL,
      notify_email = NULL,
      updated_at   = NOW()
    WHERE wallet_address = ${wallet}
  `
  return c.json({ ok: true, message: 'Deletion request logged. Offchain data will be removed within 30 days.' })
})

// ── Projects ───────────────────────────────────────────────────────────────

/** POST /projects — create project metadata after onchain agreement creation */
app.post('/projects', async (c) => {
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  if (!checkRateLimit(`write:${caller}`, 10, 60_000)) {
    return c.json({ error: 'Too many requests' }, 429)
  }

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

  const agreementId      = requireAgreementId(body.agreementId)
  const title            = requireString(body.title, 'title', 120)
  const description      = optionalString(body.description, 'description', 2000)
  const termsHash        = requireBytes32(body.termsHash, 'termsHash')
  const termsVersion     = optionalString(body.termsVersion, 'termsVersion', 20)
  const clientAddress    = requireAddress(body.clientAddress, 'clientAddress')
  const providerAddress  = requireAddress(body.providerAddress, 'providerAddress')
  const resolverAddress  = optionalAddress(body.resolverAddress, 'resolverAddress')

  // Caller must be client or provider
  if (caller !== clientAddress && caller !== providerAddress) {
    return c.json({ error: 'Caller must be client or provider' }, 403)
  }

  // milestones array: [{title, description}] up to 5
  const milestonesRaw = Array.isArray(body.milestones) ? body.milestones : []
  if (milestonesRaw.length > 5) throw new ValidationError('milestones must have at most 5 entries')
  const milestones = milestonesRaw.map((m: unknown, i: number) => {
    if (typeof m !== 'object' || m === null) throw new ValidationError(`milestones[${i}] must be an object`)
    const mi = m as Record<string, unknown>
    return {
      index: i,
      title: requireString(mi.title, `milestones[${i}].title`, 120),
      description: optionalString(mi.description, `milestones[${i}].description`, 1000),
    }
  })

  // Insert project + milestone metadata in a transaction
  const rows = await sql.begin(async (tx) => {
    const project = await tx`
      INSERT INTO projects (
        agreement_id, chain_id, title, description, terms_hash, terms_version,
        client_address, provider_address, resolver_address
      ) VALUES (
        ${agreementId}, 5042, ${title}, ${description}, ${termsHash}, ${termsVersion},
        ${clientAddress}, ${providerAddress}, ${resolverAddress}
      )
      RETURNING id
    `
    const projectId = (project[0] as { id: number }).id
    for (const m of milestones) {
      await tx`
        INSERT INTO milestones_meta (project_id, milestone_index, title, description)
        VALUES (${projectId}, ${m.index}, ${m.title}, ${m.description})
        ON CONFLICT (project_id, milestone_index) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description, updated_at = NOW()
      `
    }
    return project
  })

  return c.json({ ok: true, projectId: (rows[0] as { id: number }).id }, 201)
})

/** GET /projects/:agreementId — get project metadata */
app.get('/projects/:agreementId', async (c) => {
  const agreementId = requireAgreementId(c.req.param('agreementId'))
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  const authorized = await isParticipantByAgreementId(agreementId, caller)
  if (!authorized) return c.json({ error: 'Forbidden' }, 403)

  const rows = await sql`
    SELECT p.id, p.agreement_id, p.chain_id, p.title, p.description,
           p.terms_hash, p.terms_version,
           p.client_address, p.provider_address, p.resolver_address,
           p.indexed_at, p.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'milestoneIndex', m.milestone_index,
                 'title', m.title,
                 'description', m.description
               ) ORDER BY m.milestone_index
             ) FILTER (WHERE m.id IS NOT NULL),
             '[]'
           ) AS milestones
    FROM projects p
    LEFT JOIN milestones_meta m ON m.project_id = p.id
    WHERE p.agreement_id = ${agreementId}
    GROUP BY p.id
  `
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json(rows[0])
})

/** GET /projects/wallet/:wallet — list projects for a wallet */
app.get('/projects/wallet/:wallet', async (c) => {
  const wallet = normalizeAddress(c.req.param('wallet'))
  if (!wallet) return c.json({ error: 'Invalid address' }, 400)
  const caller = getCallerAddress(c)
  if (!caller || caller !== wallet) return c.json({ error: 'Unauthorized' }, 401)

  const rows = await sql`
    SELECT id, agreement_id, title, description,
           client_address, provider_address, resolver_address,
           indexed_at, created_at
    FROM projects
    WHERE client_address = ${wallet}
       OR provider_address = ${wallet}
       OR resolver_address = ${wallet}
    ORDER BY created_at DESC
    LIMIT 200
  `
  return c.json(rows)
})

// ── Submission Notes ───────────────────────────────────────────────────────

/** POST /projects/:agreementId/notes */
app.post('/projects/:agreementId/notes', async (c) => {
  const agreementId = requireAgreementId(c.req.param('agreementId'))
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  if (!checkRateLimit(`write:${caller}`, 20, 60_000)) {
    return c.json({ error: 'Too many requests' }, 429)
  }

  const authorized = await isParticipantByAgreementId(agreementId, caller)
  if (!authorized) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const milestoneIndex  = requireMilestoneIndex(body.milestoneIndex)
  const deliverableHash = requireBytes32(body.deliverableHash, 'deliverableHash')
  const deliverableRef  = optionalRef(body.deliverableRef, 'deliverableRef')
  const note            = optionalString(body.note, 'note', 1000)

  // Resolve project id
  const prows = await sql`SELECT id FROM projects WHERE agreement_id = ${agreementId}`
  if (prows.length === 0) return c.json({ error: 'Project not found — create project metadata first' }, 404)
  const projectId = (prows[0] as { id: number }).id

  const result = await sql`
    INSERT INTO submission_notes (project_id, milestone_index, submitter, deliverable_ref, deliverable_hash, note)
    VALUES (${projectId}, ${milestoneIndex}, ${caller}, ${deliverableRef}, ${deliverableHash}, ${note})
    RETURNING id, submitted_at
  `
  return c.json({ ok: true, id: (result[0] as { id: number }).id }, 201)
})

/** GET /projects/:agreementId/notes/:milestoneIndex */
app.get('/projects/:agreementId/notes/:milestoneIndex', async (c) => {
  const agreementId    = requireAgreementId(c.req.param('agreementId'))
  const milestoneIndex = requireMilestoneIndex(c.req.param('milestoneIndex'))
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  const authorized = await isParticipantByAgreementId(agreementId, caller)
  if (!authorized) return c.json({ error: 'Forbidden' }, 403)

  const rows = await sql`
    SELECT sn.id, sn.milestone_index, sn.submitter, sn.deliverable_ref,
           sn.deliverable_hash, sn.note, sn.submitted_at
    FROM submission_notes sn
    JOIN projects p ON p.id = sn.project_id
    WHERE p.agreement_id = ${agreementId}
      AND sn.milestone_index = ${milestoneIndex}
    ORDER BY sn.submitted_at DESC
  `
  return c.json(rows)
})

// ── Dispute Evidence ───────────────────────────────────────────────────────

/** POST /projects/:agreementId/evidence */
app.post('/projects/:agreementId/evidence', async (c) => {
  const agreementId = requireAgreementId(c.req.param('agreementId'))
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  if (!checkRateLimit(`write:${caller}`, 20, 60_000)) {
    return c.json({ error: 'Too many requests' }, 429)
  }

  const authorized = await isParticipantByAgreementId(agreementId, caller)
  if (!authorized) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const milestoneIndex = requireMilestoneIndex(body.milestoneIndex)
  const evidenceRef    = requireString(body.evidenceRef as unknown, 'evidenceRef', 512)
  const evidenceHash   = optionalSha256(body.evidenceHash, 'evidenceHash')

  const prows = await sql`SELECT id FROM projects WHERE agreement_id = ${agreementId}`
  if (prows.length === 0) return c.json({ error: 'Project not found' }, 404)
  const projectId = (prows[0] as { id: number }).id

  const result = await sql`
    INSERT INTO dispute_evidence (project_id, milestone_index, submitted_by, evidence_ref, evidence_hash)
    VALUES (${projectId}, ${milestoneIndex}, ${caller}, ${evidenceRef}, ${evidenceHash})
    RETURNING id, submitted_at
  `
  return c.json({ ok: true, id: (result[0] as { id: number }).id }, 201)
})

/** GET /projects/:agreementId/evidence/:milestoneIndex */
app.get('/projects/:agreementId/evidence/:milestoneIndex', async (c) => {
  const agreementId    = requireAgreementId(c.req.param('agreementId'))
  const milestoneIndex = requireMilestoneIndex(c.req.param('milestoneIndex'))
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  const authorized = await isParticipantByAgreementId(agreementId, caller)
  if (!authorized) return c.json({ error: 'Forbidden' }, 403)

  const rows = await sql`
    SELECT de.id, de.milestone_index, de.submitted_by,
           de.evidence_ref, de.evidence_hash, de.submitted_at
    FROM dispute_evidence de
    JOIN projects p ON p.id = de.project_id
    WHERE p.agreement_id = ${agreementId}
      AND de.milestone_index = ${milestoneIndex}
    ORDER BY de.submitted_at DESC
  `
  return c.json(rows)
})

// ── Events ─────────────────────────────────────────────────────────────────

/** GET /events/:agreementId — indexed chain events for an agreement */
app.get('/events/:agreementId', async (c) => {
  const agreementId = requireAgreementId(c.req.param('agreementId'))
  const caller = getCallerAddress(c)
  if (!caller) return c.json({ error: 'X-Wallet-Address header required' }, 401)

  const authorized = await isParticipantByAgreementId(agreementId, caller)
  if (!authorized) return c.json({ error: 'Forbidden' }, 403)

  const rows = await sql`
    SELECT tx_hash, log_index, block_number, event_name,
           milestone_index, raw_data, indexed_at
    FROM chain_events
    WHERE agreement_id = ${agreementId}
    ORDER BY block_number ASC, log_index ASC
    LIMIT 500
  `
  return c.json(rows)
})

// ── Indexer status ─────────────────────────────────────────────────────────

/** GET /indexer/status — last indexed block */
app.get('/indexer/status', async (c) => {
  const rows = await sql`
    SELECT last_indexed_block, last_indexed_at FROM indexer_state WHERE id = 1
  `
  return c.json(rows[0] ?? { lastIndexedBlock: 0, lastIndexedAt: null })
})

// ── Startup ────────────────────────────────────────────────────────────────

const PORT = Number(process.env.API_PORT ?? 3001)

async function start() {
  await migrate()
  const { serve } = await import('@hono/node-server')
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[api] MilestonePay API server listening on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('[api] Failed to start:', err)
  process.exit(1)
})

export default app
