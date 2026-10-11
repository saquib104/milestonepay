/**
 * Central constants for MilestonePay.
 *
 * Arc Mainnet values verified from official Arc documentation (2026-10-11):
 *   Chain ID / RPC / Explorer: https://docs.arc.io/arc/references/connect-to-arc
 *   Contract addresses:         https://docs.arc.io/arc/references/contract-addresses
 *   EVM differences:            https://docs.arc.io/arc/references/evm-differences
 *
 * IMPORTANT — Arc decimal model:
 *   Native USDC (gas view): 18 decimals  — used only by the wallet/gas layer.
 *   ERC-20 USDC:             6 decimals  — used for ALL escrow math and display.
 *   The two views share one balance pool; never sum or mix them.
 *   Source: "Don't mix msg.value with USDC.balanceOf() in pool or LTV math:
 *            they use different decimals (18 vs 6) and raw values are off by 10^12."
 */

export const APP_NAME = 'MilestonePay'
export const APP_TAGLINE = 'Fixed-price milestone escrow for agencies and professionals.'

/**
 * Deployed contract address on Arc Mainnet.
 * PLACEHOLDER — replace with the address from AGENTS.md after mainnet deployment.
 * The app detects a zero address and shows a "not yet deployed" notice.
 */
export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ?? '0x0000000000000000000000000000000000000000'

export const IS_CONTRACT_DEPLOYED =
  CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'

/**
 * Arc Mainnet chain ID.
 * Source: https://docs.arc.io/arc/references/connect-to-arc (verified 2026-10-11)
 * Also available as arc.id from viem/chains — this constant exists for non-wagmi code paths.
 */
export const ARC_MAINNET_CHAIN_ID = 5042

/**
 * USDC ERC-20 contract on Arc (mainnet and testnet share the same address).
 * Source: https://docs.arc.io/arc/references/contract-addresses (verified 2026-10-11)
 * "Optional ERC-20 interface for interacting with the native USDC balance. Uses 6 decimals."
 * There is no wrapped USDC on Arc — this IS the native USDC with an ERC-20 interface.
 */
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const ARC_USDC_DECIMALS = 6  // ERC-20 view only; native view uses 18 decimals

/**
 * Arc Mainnet block explorer.
 * Source: https://docs.arc.io/arc/references/connect-to-arc (verified 2026-10-11)
 */
export const ARC_EXPLORER_BASE = 'https://explorer.arc.io'

/** Milestone status enum values (must match Solidity enum order) */
export const MILESTONE_STATUS = {
  Pending:   0,
  Funded:    1,
  Submitted: 2,
  Released:  3,
  Revision:  4,
  Disputed:  5,
  Refunded:  6,
} as const

export type MilestoneStatusValue = (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS]

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatusValue, string> = {
  [MILESTONE_STATUS.Pending]:   'Pending',
  [MILESTONE_STATUS.Funded]:    'Funded',
  [MILESTONE_STATUS.Submitted]: 'Submitted',
  [MILESTONE_STATUS.Released]:  'Released',
  [MILESTONE_STATUS.Revision]:  'Changes Requested',
  [MILESTONE_STATUS.Disputed]:  'Disputed',
  [MILESTONE_STATUS.Refunded]:  'Refunded',
}

export const MILESTONE_STATUS_COLOR: Record<MilestoneStatusValue, string> = {
  [MILESTONE_STATUS.Pending]:   'bg-gray-100 text-gray-600',
  [MILESTONE_STATUS.Funded]:    'bg-blue-50 text-blue-700',
  [MILESTONE_STATUS.Submitted]: 'bg-amber-50 text-amber-700',
  [MILESTONE_STATUS.Released]:  'bg-green-50 text-green-700',
  [MILESTONE_STATUS.Revision]:  'bg-orange-50 text-orange-700',
  [MILESTONE_STATUS.Disputed]:  'bg-red-50 text-red-700',
  [MILESTONE_STATUS.Refunded]:  'bg-gray-100 text-gray-500',
}

export const TERMINAL_STATUSES = new Set([
  MILESTONE_STATUS.Released,
  MILESTONE_STATUS.Refunded,
])

/** Max milestones per agreement (matches contract) */
export const MAX_MILESTONES = 5

/** Default dispute timeout in seconds (30 days) */
export const DEFAULT_DISPUTE_TIMEOUT = 30 * 24 * 60 * 60

/** Dispute timeout bounds in days */
export const MIN_DISPUTE_DAYS = 1
export const MAX_DISPUTE_DAYS = 90

/** Max revisions per milestone bounds (matches contract) */
export const MIN_REVISIONS = 1
export const MAX_REVISIONS = 5
export const DEFAULT_REVISIONS = 3
