import { useReadContract, useReadContracts } from 'wagmi'
import type { Abi } from 'viem'
import { TARGET_CHAIN_ID } from '../config'
import { CONTRACT_ADDRESS, IS_CONTRACT_DEPLOYED, MAX_MILESTONES } from '../utils/constants'
import escrowAbiRaw from '../abi/MilestonePayEscrow.json'

const escrowAbi = escrowAbiRaw as Abi

export interface AgreementData {
  id: bigint
  client: `0x${string}`
  provider: `0x${string}`
  resolver: `0x${string}`
  termsHash: `0x${string}`
  milestoneCount: number
  active: boolean
  disputeTimeout: bigint
  disputeDefaultToProvider: boolean
}

export interface MilestoneData {
  amount: bigint
  expiry: bigint
  status: number
  deliverableHash: `0x${string}`
  reasonHash: `0x${string}`
  revisionCount: number
  maxRevisions: number
  disputeDeadline: bigint
}

/** Read a single agreement by ID */
export function useAgreement(agreementId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: 'agreements',
    args: agreementId !== undefined ? [agreementId] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: IS_CONTRACT_DEPLOYED && agreementId !== undefined },
  })

  const raw = data as readonly [string, string, string, `0x${string}`, number, boolean, bigint, boolean] | undefined

  const agreement: AgreementData | undefined = raw
    ? {
        id: agreementId!,
        client: raw[0] as `0x${string}`,
        provider: raw[1] as `0x${string}`,
        resolver: raw[2] as `0x${string}`,
        termsHash: raw[3],
        milestoneCount: raw[4],
        active: raw[5],
        disputeTimeout: raw[6],
        disputeDefaultToProvider: raw[7],
      }
    : undefined

  return { agreement, isLoading, refetch }
}

/** Read all milestones for an agreement */
export function useMilestones(agreementId: bigint | undefined, milestoneCount: number) {
  const count = Math.min(milestoneCount, MAX_MILESTONES)
  const enabled = IS_CONTRACT_DEPLOYED && agreementId !== undefined && count > 0

  const contracts = enabled
    ? Array.from({ length: count }, (_, i) => ({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: 'milestones' as const,
        args: [agreementId, i] as [bigint, number],
        chainId: TARGET_CHAIN_ID,
      }))
    : []

  const { data, isLoading, refetch } = useReadContracts({ contracts, query: { enabled } })

  const milestones: MilestoneData[] = (data ?? [])
    .filter(r => r.status === 'success')
    .map(r => {
      const raw = r.result as readonly [bigint, bigint, number, `0x${string}`, `0x${string}`, number, number, bigint]
      return {
        amount: raw[0],
        expiry: raw[1],
        status: raw[2],
        deliverableHash: raw[3],
        reasonHash: raw[4],
        revisionCount: raw[5],
        maxRevisions: raw[6],
        disputeDeadline: raw[7],
      }
    })

  return { milestones, isLoading, refetch }
}

/** Read the agreement counter (total agreements created) */
export function useAgreementCounter() {
  const { data, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: 'agreementCounter',
    chainId: TARGET_CHAIN_ID,
    query: { enabled: IS_CONTRACT_DEPLOYED },
  })
  return { counter: data as bigint | undefined, isLoading }
}

/** Read pending withdrawal balance for an address */
export function usePendingWithdrawal(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: IS_CONTRACT_DEPLOYED && !!address },
  })
  return { amount: data as bigint | undefined, isLoading, refetch }
}
