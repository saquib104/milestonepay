/**
 * Simple in-memory rate limiter.
 * Keyed by IP or wallet address.
 * For production, replace with a Redis-backed sliding window.
 */

interface Bucket {
  count: number
  windowStart: number
}

const store = new Map<string, Bucket>()

// Sweep expired buckets every 60 s to prevent unbounded growth
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart > 60_000) store.delete(key)
  }
}, 60_000).unref()

/**
 * Returns true if the caller is within the allowed rate.
 * @param key    identifier (IP or wallet address)
 * @param limit  max requests per window
 * @param windowMs window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const existing = store.get(key)
  if (!existing || now - existing.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return true
  }
  existing.count++
  if (existing.count > limit) return false
  return true
}
