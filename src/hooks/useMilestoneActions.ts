import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { TARGET_CHAIN_ID } from '../config'
import { CONTRACT_ADDRESS } from '../utils/constants'
import escrowAbi from '../abi/MilestonePayEscrow.json'

function useEscrowWrite() {
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  async function call(functionName: string, args: unknown[]) {
    return writeContractAsync({
      address: CONTRACT_ADDRESS,
      abi: escrowAbi,
      functionName,
      args,
      chainId: TARGET_CHAIN_ID,
    })
  }

  return { call, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useCreateAgreement() {
  const w = useEscrowWrite()
  return {
    ...w,
    createAgreement: (
      provider: `0x${string}`,
      resolver: `0x${string}`,
      termsHash: `0x${string}`,
      amounts: bigint[],
      expiries: bigint[],
      maxRevisions: number[],
      disputeTimeout: bigint,
      disputeDefaultToProvider: boolean,
    ) =>
      w.call('createAgreement', [
        provider, resolver, termsHash, amounts, expiries, maxRevisions,
        disputeTimeout, disputeDefaultToProvider,
      ]),
  }
}

export function useFundMilestone() {
  const w = useEscrowWrite()
  return {
    ...w,
    fund: (agreementId: bigint, milestoneIndex: number) =>
      w.call('fund', [agreementId, milestoneIndex]),
  }
}

export function useSubmitDeliverable() {
  const w = useEscrowWrite()
  return {
    ...w,
    submitDeliverable: (agreementId: bigint, milestoneIndex: number, deliverableHash: `0x${string}`) =>
      w.call('submitDeliverable', [agreementId, milestoneIndex, deliverableHash]),
  }
}

export function useApproveRelease() {
  const w = useEscrowWrite()
  return {
    ...w,
    approveRelease: (agreementId: bigint, milestoneIndex: number) =>
      w.call('approveRelease', [agreementId, milestoneIndex]),
  }
}

export function useRequestChanges() {
  const w = useEscrowWrite()
  return {
    ...w,
    requestChanges: (agreementId: bigint, milestoneIndex: number, reasonHash: `0x${string}`) =>
      w.call('requestChanges', [agreementId, milestoneIndex, reasonHash]),
  }
}

export function useRaiseDispute() {
  const w = useEscrowWrite()
  return {
    ...w,
    raiseDispute: (agreementId: bigint, milestoneIndex: number, reasonHash: `0x${string}`) =>
      w.call('raiseDispute', [agreementId, milestoneIndex, reasonHash]),
  }
}

export function useResolveDispute() {
  const w = useEscrowWrite()
  return {
    ...w,
    resolveDispute: (agreementId: bigint, milestoneIndex: number, releaseToProvider: boolean) =>
      w.call('resolveDispute', [agreementId, milestoneIndex, releaseToProvider]),
  }
}

export function useClaimRefund() {
  const w = useEscrowWrite()
  return {
    ...w,
    claimRefund: (agreementId: bigint, milestoneIndex: number) =>
      w.call('claimRefund', [agreementId, milestoneIndex]),
  }
}

export function useClaimDisputeRefund() {
  const w = useEscrowWrite()
  return {
    ...w,
    claimDisputeRefund: (agreementId: bigint, milestoneIndex: number) =>
      w.call('claimDisputeRefund', [agreementId, milestoneIndex]),
  }
}

export function useWithdraw() {
  const w = useEscrowWrite()
  return {
    ...w,
    withdraw: () => w.call('withdraw', []),
  }
}
