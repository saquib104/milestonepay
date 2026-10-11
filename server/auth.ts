/**
 * Authorization helpers for MilestonePay API server.
 *
 * Authentication model (v1):
 *   Wallet-based: the client passes its wallet address in the
 *   X-Wallet-Address header. The server treats this as a claimed
 *   identity — no signature verification in v1.
 *
 * SECURITY NOTE:
 *   Header-only auth is appropriate for read-heavy, non-custodial
 *   apps where the contract enforces all fund flows. For write
 *   operations (project creation, note submission), the caller must
 *   also be a participant in the referenced onchain agreement.
 *   A future v2 upgrade should require a signed message (EIP-4361 SIWE).
 *
 * Authorization rules:
 *   - Read project / milestones / events: caller must be client,
 *     provider, or resolver of the project.
 *   - Write submission notes / dispute evidence: caller must be
 *     client, provider, or resolver.
 *   - Update own user profile: caller must match wallet_address.
 *   - Admin routes: none (no admin key by design).
 */

import type { Context } from 'hono'
import { sql } from './db'

/** Normalize an address to lowercase hex */
export function normalizeAddress(addr: string | undefined): `0x${string}` | null {
  if (!addr) return null
  const trimmed = addr.trim().toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) return null
  return trimmed as `0x${string}`
}

/** Extract caller wallet from X-Wallet-Address header */
export function getCallerAddress(c: Context): `0x${string}` | null {
  return normalizeAddress(c.req.header('x-wallet-address') ?? undefined)
}

/** Check caller is a participant (client | provider | resolver) of a project */
export async function isParticipant(
  projectId: bigint | number,
  callerAddress: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM projects
    WHERE id = ${String(projectId)}
      AND (
        client_address   = ${callerAddress.toLowerCase()}
        OR provider_address = ${callerAddress.toLowerCase()}
        OR resolver_address = ${callerAddress.toLowerCase()}
      )
    LIMIT 1
  `
  return rows.length > 0
}

/** Check caller is a participant of a project identified by agreement_id */
export async function isParticipantByAgreementId(
  agreementId: string,
  callerAddress: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM projects
    WHERE agreement_id = ${agreementId}
      AND (
        client_address   = ${callerAddress.toLowerCase()}
        OR provider_address = ${callerAddress.toLowerCase()}
        OR resolver_address = ${callerAddress.toLowerCase()}
      )
    LIMIT 1
  `
  return rows.length > 0
}
