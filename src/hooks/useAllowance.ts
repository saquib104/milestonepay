import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { TARGET_CHAIN_ID } from '../config'
import { ARC_USDC_ADDRESS, CONTRACT_ADDRESS } from '../utils/constants'

/**
 * Reads the current USDC allowance granted to the escrow contract,
 * and provides an approve function to increase it.
 */
export function useAllowance(requiredAmount?: bigint) {
  const { address } = useAccount()

  const { data: allowance, isLoading: isReadingAllowance, refetch } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && CONTRACT_ADDRESS ? [address, CONTRACT_ADDRESS] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address && !!CONTRACT_ADDRESS },
  })

  const {
    writeContract: approveWrite,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  const needsApproval =
    requiredAmount !== undefined &&
    (allowance === undefined || (allowance) < requiredAmount)

  function approve(amount: bigint) {
    approveWrite({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, amount],
      chainId: TARGET_CHAIN_ID,
    })
  }

  return {
    allowance: allowance,
    isReadingAllowance,
    needsApproval,
    approve,
    approveTxHash,
    isApprovePending,
    isApproveConfirming,
    isApproveConfirmed,
    approveError,
    resetApprove,
    refetchAllowance: refetch,
  }
}
