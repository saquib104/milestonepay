/**
 * Input validation helpers.
 * All API inputs are validated before touching the database.
 * Uses plain TypeScript — no external validation library needed.
 */

export class ValidationError extends Error {
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** Validate a wallet address string */
export function requireAddress(val: unknown, field: string): string {
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = val.trim().toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) throw new ValidationError(`${field} is not a valid address`)
  return trimmed
}

/** Validate an optional address (undefined is allowed) */
export function optionalAddress(val: unknown, field: string): string | null {
  if (val === undefined || val === null || val === '') return null
  return requireAddress(val, field)
}

/** Validate a non-empty string with a max length */
export function requireString(val: unknown, field: string, maxLen: number): string {
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = val.trim()
  if (trimmed.length === 0) throw new ValidationError(`${field} must not be empty`)
  if (trimmed.length > maxLen) throw new ValidationError(`${field} must be at most ${maxLen} characters`)
  return trimmed
}

/** Validate an optional string with a max length */
export function optionalString(val: unknown, field: string, maxLen: number): string | null {
  if (val === undefined || val === null || val === '') return null
  return requireString(val, field, maxLen)
}

/** Validate a bytes32 hex hash */
export function requireBytes32(val: unknown, field: string): string {
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = val.trim().toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(trimmed)) throw new ValidationError(`${field} is not a valid bytes32 hex`)
  return trimmed
}

/** Validate a uint256 agreement ID (string representation of a BigInt) */
export function requireAgreementId(val: unknown, field = 'agreementId'): string {
  if (typeof val !== 'string' && typeof val !== 'number') {
    throw new ValidationError(`${field} must be a numeric string`)
  }
  const s = String(val).trim()
  if (!/^\d{1,78}$/.test(s)) throw new ValidationError(`${field} is not a valid agreement ID`)
  return s
}

/** Validate a milestone index (0–4) */
export function requireMilestoneIndex(val: unknown, field = 'milestoneIndex'): number {
  const n = Number(val)
  if (!Number.isInteger(n) || n < 0 || n > 4) {
    throw new ValidationError(`${field} must be an integer 0–4`)
  }
  return n
}

/** Validate an optional URL or IPFS CID */
export function optionalRef(val: unknown, field: string): string | null {
  if (val === undefined || val === null || val === '') return null
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = val.trim()
  if (trimmed.length > 512) throw new ValidationError(`${field} must be at most 512 characters`)
  // Accept IPFS CIDs (bafy..., Qm...) or http(s) URLs
  if (
    !/^(https?:\/\/|ipfs:\/\/|bafy[a-z0-9]{50,}|Qm[a-zA-Z0-9]{44,})/.test(trimmed)
  ) {
    throw new ValidationError(`${field} must be an https URL or IPFS CID`)
  }
  return trimmed
}

/** Validate an optional SHA-256 hash (hex, no 0x prefix) */
export function optionalSha256(val: unknown, field: string): string | null {
  if (val === undefined || val === null || val === '') return null
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = val.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(trimmed)) throw new ValidationError(`${field} must be a 64-char hex SHA-256`)
  return trimmed
}

/** Validate an optional email */
export function optionalEmail(val: unknown, field: string): string | null {
  if (val === undefined || val === null || val === '') return null
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = val.trim().toLowerCase()
  if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new ValidationError(`${field} is not a valid email address`)
  }
  return trimmed
}
