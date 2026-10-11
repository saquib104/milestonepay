/**
 * Resolve the Arc Mainnet RPC URL for backend use.
 *
 * Priority:
 *   1. Circle RPC proxy (RPC_PROXY_BASE_URL + RPC_PROXY_TOKEN) when Arc_Mainnet
 *      is listed in RPC_PROXY_CHAINS
 *   2. Public Arc Mainnet RPC sourced from the onchain-facts registry file
 *      (never typed here as a literal)
 */

/** The exact Compass chain key for Arc Mainnet in the RPC proxy. */
const COMPASS_KEY = 'Arc_Mainnet'

/** Arc Mainnet chain ID — used to look up the fallback RPC in onchain-facts. */
export const ARC_MAINNET_CHAIN_ID = 5042

// Read the fallback RPC URL from onchain-facts at module load time.
// We import the raw JSON that backs the facts file to avoid pulling
// the entire Vite/browser module graph into the Bun server process.
import factsRaw from '../src/onchain-facts.ts' with { type: 'text' }

/**
 * Parse the Arc Mainnet rpcUrls from the onchain-facts source text.
 * The facts file is a generated TypeScript constant — we extract the
 * value at module init so we never hard-code the URL in server source.
 */
function extractArcRpcFromFacts(source: string): string | null {
  // Find the chainId:5042 block and extract its first rpcUrls entry
  const chainBlock = source.match(/chainId['":\s]+5042[\s\S]{0,500}?rpcUrls['":\s]+\[[\s\S]*?"([^"]+)"/)
  return chainBlock ? chainBlock[1] : null
}

const FALLBACK_RPC_URL: string | null = (() => {
  try {
    return extractArcRpcFromFacts(factsRaw)
  } catch {
    return null
  }
})()

/**
 * Returns the RPC URL to use for Arc Mainnet backend calls.
 */
export function getArcRpcUrl(): string {
  const proxyBase   = process.env.RPC_PROXY_BASE_URL
  const proxyToken  = process.env.RPC_PROXY_TOKEN
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map(s => s.trim())

  if (proxyBase && proxyToken && proxyChains.includes(COMPASS_KEY)) {
    return `${proxyBase}/api/rpc/${COMPASS_KEY}?_rpc_token=${proxyToken}`
  }

  // Fallback: URL sourced from onchain-facts registry (never typed here)
  if (FALLBACK_RPC_URL) {
    console.warn(
      '[rpc] RPC proxy not configured for Arc_Mainnet — ' +
      'falling back to public RPC from onchain-facts. Rate limits unknown.'
    )
    return FALLBACK_RPC_URL
  }

  throw new Error(
    'No RPC URL available for Arc Mainnet. ' +
    'Set RPC_PROXY_BASE_URL, RPC_PROXY_TOKEN, and add "Arc_Mainnet" to RPC_PROXY_CHAINS.'
  )
}
