/**
 * useTxGuard — pre-transaction safety checks for all write actions.
 *
 * Returns a summary object the UI shows before requesting a wallet signature.
 * Checks:
 *  1. Wallet connected
 *  2. Correct chain (Arc Mainnet 5042)
 *  3. USDC ERC-20 balance sufficient for the operation amount
 *  4. Gas headroom: USDC balance minus operation amount must cover estimated gas.
 *     On Arc, USDC IS the gas token. The same ERC-20 balance pays for gas.
 *     We conservatively reserve 1 USDC (1_000_000 raw 6-dec units) as gas headroom
 *     for a single complex transaction. This is intentionally conservative; actual
 *     Arc gas costs in USDC are far lower, but the exact market rate is not
 *     inspectable without a live fee estimate, which requires an extra RPC call.
 *     The constant is visible to users and can be adjusted.
 *
 * Source for Arc gas model:
 *   https://docs.arc.io/arc/references/evm-differences
 *   https://docs.arc.io/arc/references/connect-to-arc
 *   Verified 2026-10-11: Arc native token is USDC (18-dec gas view, 6-dec ERC-20 view).
 *   "Don't mix msg.value with USDC.balanceOf() in pool or LTV math."
 */

import { useAccount } from 'wagmi'
import { useChainGuard } from './useChainGuard'
import { useUsdcBalance } from './useUsdcBalance'
import { TARGET_CHAIN_ID } from '../config'

/**
 * Conservative USDC gas reserve per transaction (6-decimal ERC-20 units).
 * 1 USDC = 1_000_000 raw units.
 * On Arc, gas is paid in USDC; this reserve is subtracted from available
 * balance before checking whether the user has enough for the operation.
 */
export const GAS_RESERVE_USDC = 1_000_000n  // 1.00 USDC

export interface TxGuardResult {
  /** True when all checks pass and the tx should be allowed to proceed. */
  canProceed: boolean
  /** Wallet is connected. */
  isConnected: boolean
  /** Connected to Arc Mainnet. */
  isCorrectChain: boolean
  /** USDC balance covers operationAmount + gas reserve (undefined = loading). */
  hasEnoughUsdc: boolean | undefined
  /** Raw USDC ERC-20 balance (6 dec). undefined while loading. */
  usdcBalance: bigint | undefined
  /** The operation amount this check was run against. */
  operationAmount: bigint
  /** Amount after reserving gas. */
  availableAfterGas: bigint | undefined
  /** True when wallet is on the wrong chain. */
  isWrongChain: boolean
  /** Human-readable error message if canProceed is false. */
  errorMessage: string | undefined
}

/**
 * Run pre-transaction safety checks.
 * Pass operationAmount = 0n for actions that do not transfer USDC (e.g. submitDeliverable).
 */
export function useTxGuard(operationAmount: bigint = 0n): TxGuardResult {
  const { isConnected } = useAccount()
  const { isWrongChain } = useChainGuard()
  const { raw: usdcBalance } = useUsdcBalance()

  const isCorrectChain = isConnected && !isWrongChain

  const availableAfterGas =
    usdcBalance !== undefined
      ? usdcBalance > GAS_RESERVE_USDC
        ? usdcBalance - GAS_RESERVE_USDC
        : 0n
      : undefined

  const hasEnoughUsdc =
    availableAfterGas !== undefined
      ? availableAfterGas >= operationAmount
      : undefined

  const canProceed =
    isConnected &&
    isCorrectChain &&
    hasEnoughUsdc !== false

  let errorMessage: string | undefined
  if (!isConnected) {
    errorMessage = 'Connect your wallet to continue.'
  } else if (isWrongChain) {
    errorMessage = `Switch to Arc Mainnet (chain ${TARGET_CHAIN_ID}) to continue.`
  } else if (hasEnoughUsdc === false) {
    errorMessage = 'Insufficient USDC balance (including gas reserve).'
  }

  return {
    canProceed,
    isConnected,
    isCorrectChain,
    hasEnoughUsdc,
    usdcBalance,
    operationAmount,
    availableAfterGas,
    isWrongChain,
    errorMessage,
  }
}
