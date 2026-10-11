/**
 * Formatting utilities for MilestonePay.
 *
 * Arc Explorer URL base: https://explorer.arc.io
 * Source: https://docs.arc.io/arc/references/connect-to-arc (verified 2026-10-11)
 *
 * USDC decimals: 6 (ERC-20 interface) — used for all escrow math and display.
 * Native USDC decimals: 18 (gas view) — never used here.
 * Source: https://docs.arc.io/arc/references/contract-addresses (verified 2026-10-11)
 * "The ERC-20 functions affect native balance movements. Uses 6 decimals."
 */
import { ARC_EXPLORER_BASE, ARC_USDC_DECIMALS } from './constants'

/** Truncate an Ethereum address for display: 0xABCD…1234 */
export function fmtAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Format a raw USDC amount (6-decimal bigint) to a human-readable string */
export function fmtUsdc(raw: bigint, decimals = ARC_USDC_DECIMALS): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  if (fracStr.length === 0) return `${whole.toLocaleString('en-US')}`
  return `${whole.toLocaleString('en-US')}.${fracStr.slice(0, 2)}`
}

/** Parse a human-readable USDC string to raw bigint (6 decimals) */
export function parseUsdc(value: string): bigint {
  if (!value || value.trim() === '') return 0n
  const clean = value.replace(/,/g, '').trim()
  const [whole, frac = ''] = clean.split('.')
  const fracPadded = frac.slice(0, ARC_USDC_DECIMALS).padEnd(ARC_USDC_DECIMALS, '0')
  return BigInt(whole || '0') * 10n ** BigInt(ARC_USDC_DECIMALS) + BigInt(fracPadded)
}

/** Format a unix timestamp (seconds) to a readable date */
export function fmtDate(ts: bigint | number): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(ms))
}

/** Format a unix timestamp to relative time */
export function fmtRelative(ts: bigint | number): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000
  const diff = ms - Date.now()
  const absDiff = Math.abs(diff)
  const past = diff < 0
  if (absDiff < 60_000) return past ? 'just now' : 'in a moment'
  if (absDiff < 3_600_000) {
    const m = Math.round(absDiff / 60_000)
    return past ? `${m}m ago` : `in ${m}m`
  }
  if (absDiff < 86_400_000) {
    const h = Math.round(absDiff / 3_600_000)
    return past ? `${h}h ago` : `in ${h}h`
  }
  const d = Math.round(absDiff / 86_400_000)
  return past ? `${d}d ago` : `in ${d}d`
}

/**
 * Build an Arc Explorer link for a transaction hash.
 * Explorer: https://explorer.arc.io (verified from Arc docs 2026-10-11)
 */
export function explorerTxUrl(hash: string): string {
  return `${ARC_EXPLORER_BASE}/tx/${hash}`
}

/**
 * Build an Arc Explorer link for an address.
 * Explorer: https://explorer.arc.io (verified from Arc docs 2026-10-11)
 */
export function explorerAddressUrl(addr: string): string {
  return `${ARC_EXPLORER_BASE}/address/${addr}`
}

/**
 * Parse a contract revert or wallet error into user-readable text.
 *
 * Arc-specific notes:
 * - "insufficient funds" on Arc means insufficient USDC (the gas token), not ETH.
 * - Blocklist reverts surface as generic revert messages from the RPC.
 * - Blob transactions are not supported on Arc; type-3 tx rejection included.
 */
export function parseOnchainError(err: unknown): string {
  const raw = (err as { message?: string })?.message ?? ''
  const msg = raw.toLowerCase()

  // User cancelled
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('4001')) {
    return 'Transaction cancelled.'
  }

  // Role checks (contract custom errors)
  if (msg.includes('notclient'))              return 'Only the client can perform this action.'
  if (msg.includes('notprovider'))            return 'Only the provider can perform this action.'
  if (msg.includes('notresolver'))            return 'Only the designated resolver can perform this action.'
  if (msg.includes('notparty'))               return 'You are not a party to this agreement.'

  // State machine
  if (msg.includes('invalidmilestonestatus')) return 'This action is not allowed in the current milestone state.'
  if (msg.includes('milestoneexpired'))       return 'The submission deadline for this milestone has passed.'
  if (msg.includes('milestonenotexpired'))    return 'The milestone expiry has not yet passed.'
  if (msg.includes('disputedeadlinenotreached')) return 'The dispute timeout has not yet elapsed.'
  if (msg.includes('nothingtowithdraw'))      return 'No available balance to withdraw.'

  // USDC / balance — on Arc "insufficient funds" means USDC, not ETH
  if (
    msg.includes('insufficient funds') ||
    msg.includes('exceeds balance') ||
    msg.includes('transfer amount exceeds balance')
  ) {
    return 'Insufficient USDC balance. On Arc, USDC is the gas token — ensure your balance covers both the escrow amount and a small gas fee.'
  }

  // Arc-specific: blocklisted address (surfaces as a revert)
  if (msg.includes('blocklist') || msg.includes('blocklisted')) {
    return 'Transaction blocked: an address in this transaction is on the USDC blocklist.'
  }

  // RPC / network
  if (msg.includes('timeout') || msg.includes('request timeout')) {
    return 'RPC timeout — the transaction may still be pending. Check Arc Explorer before retrying.'
  }
  if (msg.includes('network') || msg.includes('connection refused') || msg.includes('fetch failed')) {
    return 'Network error. Check your connection and try again.'
  }
  if (msg.includes('unknown transaction')) {
    return 'Transaction status unknown — check Arc Explorer for the latest state.'
  }

  // Generic revert
  if (msg.includes('reverted') || msg.includes('execution reverted')) {
    return 'Transaction failed — the contract rejected this action. Check the milestone state and try again.'
  }

  return 'Something went wrong. Please try again.'
}

/** Check if a string looks like a valid Ethereum address */
export function isAddress(val: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(val)
}

/** Truncate a bytes32 hex string for display */
export function fmtHash(hash: string): string {
  if (!hash || hash === '0x' + '0'.repeat(64)) return '—'
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}
