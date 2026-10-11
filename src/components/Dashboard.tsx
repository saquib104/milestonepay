import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Plus, ArrowDownToLine, Briefcase } from 'lucide-react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { EmptyState, Spinner, SkeletonRow } from './ui/EmptyState'
import { AddressChip } from './ui/AddressChip'
import { useAgreementCounter, useAgreement, usePendingWithdrawal } from '../hooks/useAgreements'
import { useWithdraw } from '../hooks/useMilestoneActions'
import { fmtUsdc, parseOnchainError } from '../utils/formatting'
import { IS_CONTRACT_DEPLOYED } from '../utils/constants'
import { toast } from 'sonner'

// We load agreement IDs by scanning events client-side is ideal, but without an
// indexer we use the counter to show agreements 1..N and filter by current wallet.
// For v1 (no backend), we show the last 20 agreements and let the user search.

const MAX_SCAN = 20

interface DashboardProps {
  onCreateAgreement: () => void
  onOpenAgreement: (id: bigint) => void
}

function AgreementRow({ id, onOpen, walletAddress }: { id: bigint; onOpen: () => void; walletAddress: string }) {
  const { agreement, isLoading } = useAgreement(id)

  if (isLoading) return (
    <Card className="py-4">
      <SkeletonRow lines={2} />
    </Card>
  )
  if (!agreement) return null

  const isParty =
    agreement.client.toLowerCase() === walletAddress.toLowerCase() ||
    agreement.provider.toLowerCase() === walletAddress.toLowerCase() ||
    agreement.resolver.toLowerCase() === walletAddress.toLowerCase()

  if (!isParty) return null

  const isClient = agreement.client.toLowerCase() === walletAddress.toLowerCase()
  const role = isClient ? 'Client' : agreement.provider.toLowerCase() === walletAddress.toLowerCase() ? 'Provider' : 'Resolver'

  return (
    <Card hover onClick={onOpen}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="display text-sm font-semibold text-[--ink]">Agreement #{id.toString()}</span>
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              role === 'Client' ? 'bg-[--accent-light] text-[--accent]' :
              role === 'Provider' ? 'bg-[--warm-light] text-[--warm]' :
              'bg-[--surface-muted] text-[--muted]'
            }`}>
              {role}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[--muted]">
            <span>{agreement.milestoneCount} milestone{agreement.milestoneCount !== 1 ? 's' : ''}</span>
            {isClient && <span>Provider: <AddressChip address={agreement.provider} /></span>}
            {!isClient && <span>Client: <AddressChip address={agreement.client} /></span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${agreement.active ? 'bg-[--success-light] text-[--success]' : 'bg-[--surface-muted] text-[--muted]'}`}>
            {agreement.active ? 'Active' : 'Closed'}
          </span>
        </div>
      </div>
    </Card>
  )
}

export function Dashboard({ onCreateAgreement, onOpenAgreement }: DashboardProps) {
  const { address, isConnected } = useAccount()
  const { counter, isLoading: isCounterLoading } = useAgreementCounter()
  const { amount: pendingAmount, refetch: refetchPending } = usePendingWithdrawal(address)
  const { withdraw, isPending: isWithdrawPending, isConfirming } = useWithdraw()

  const [withdrawError, setWithdrawError] = useState<string>()

  async function handleWithdraw() {
    setWithdrawError(undefined)
    try {
      await withdraw()
      void refetchPending()
      toast.success('USDC withdrawn to your wallet.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setWithdrawError(msg)
    }
  }

  if (!isConnected) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Connect your wallet"
        description="Connect an Arc Mainnet wallet to view and manage your agreements."
      />
    )
  }

  if (!IS_CONTRACT_DEPLOYED) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-[--warning-light] bg-[--warning-light] p-8">
          <p className="text-sm text-[--warning] font-medium">
            The MilestonePay contract has not yet been deployed to Arc Mainnet.
            Update <span className="mono">VITE_CONTRACT_ADDRESS</span> in <span className="mono">.env</span> after deployment.
          </p>
        </div>
      </div>
    )
  }

  const totalIds = counter ? Number(counter) - 1 : 0
  const scanIds: bigint[] = []
  for (let i = Math.max(1, totalIds - MAX_SCAN + 1); i <= totalIds; i++) {
    scanIds.push(BigInt(i))
  }
  scanIds.reverse()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="display text-2xl font-semibold text-[--ink]">Your agreements</h1>
        <Button size="md" onClick={onCreateAgreement}>
          <Plus className="size-4" />
          New agreement
        </Button>
      </div>

      {/* Pending withdrawal card */}
      {pendingAmount !== undefined && pendingAmount > 0n && (
        <Card className="mb-6 bg-[--success-light] border-green-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[--success] mb-0.5">USDC available to withdraw</p>
              <p className="display text-2xl font-bold tabular-nums text-[--ink]">
                {fmtUsdc(pendingAmount)} <span className="text-base font-medium text-[--muted]">USDC</span>
              </p>
              {withdrawError && <p className="text-xs text-[--danger] mt-1">{withdrawError}</p>}
            </div>
            <Button
              variant="primary"
              size="md"
              loading={isWithdrawPending || isConfirming}
              onClick={() => { void handleWithdraw() }}
            >
              <ArrowDownToLine className="size-4" />
              Withdraw
            </Button>
          </div>
        </Card>
      )}

      {/* Agreement list */}
      {isCounterLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : totalIds === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No agreements yet"
          description="Create your first agreement to get started. The other party will see it when you share the agreement ID."
          action={
            <Button onClick={onCreateAgreement}>
              <Plus className="size-4" />
              Create agreement
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {scanIds.map(id => (
            <AgreementRow
              key={id.toString()}
              id={id}
              walletAddress={address!}
              onOpen={() => onOpenAgreement(id)}
            />
          ))}
          {totalIds > MAX_SCAN && (
            <p className="text-xs text-center text-[--subtle] pt-2">
              Showing the last {MAX_SCAN} agreements. Earlier agreements are accessible by entering their ID directly.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
