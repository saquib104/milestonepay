import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { TARGET_CHAIN_ID } from '../config'
import { ARC_USDC_ADDRESS } from '../utils/constants'

/**
 * Reads the connected wallet's USDC balance on Arc Mainnet via the ERC-20
 * interface (6 decimals). Returns undefined while loading.
 * Do NOT use native balance alongside this — on Arc they are the same pool.
 */
export function useUsdcBalance() {
  const { address } = useAccount()

  const { data, isLoading, refetch } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  return {
    raw: data,
    isLoading,
    refetch,
  }
}
