/**
 * Client-side hashing utilities for MilestonePay.
 * All hashing is done in the browser using the Web Crypto API.
 * The contract stores bytes32 hashes; we produce keccak256-compatible
 * commitments from text/file content using SHA-256 (stored as-is).
 */

/** Hash a UTF-8 string to a hex bytes32 using SHA-256 */
export async function hashText(text: string): Promise<`0x${string}`> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `0x${hashHex}`
}

/** Hash a File object to a hex bytes32 using SHA-256 */
export async function hashFile(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `0x${hashHex}`
}

/**
 * Hash a deliverable reference — accepts a URL, CID, or any text string.
 * The returned hash is stored onchain as the deliverable commitment.
 */
export async function hashDeliverable(input: string): Promise<`0x${string}`> {
  return hashText(input.trim())
}

/** Hash an agreement terms document text for the termsHash field */
export async function hashTerms(termsText: string): Promise<`0x${string}`> {
  return hashText(termsText.trim())
}

/** Hash a reason string for requestChanges / raiseDispute */
export async function hashReason(reason: string): Promise<`0x${string}`> {
  return hashText(reason.trim())
}

/** Return true if a hex string is the zero bytes32 */
export function isZeroHash(hash: string): boolean {
  return /^0x0{64}$/.test(hash)
}
