import { useAccount } from 'wagmi'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, DataRow } from './ui/Card'
import { AddressChip } from './ui/AddressChip'
import { MilestoneCard } from './MilestoneCard'
import { Spinner, EmptyState } from './ui/EmptyState'
import { Briefcase } from 'lucide-react'
import { useAgreement, useMilestones } from '../hooks/useAgreements'
import { fmtHash } from '../utils/formatting'

interface AgreementDetailProps {
  agreementId: bigint
  onBack: () => void
}

export function AgreementDetail({ agreementId, onBack }: AgreementDetailProps) {
  const { address } = useAccount()
  const { agreement, isLoading: isAgreementLoading, refetch: refetchAgreement } = useAgreement(agreementId)
  const { milestones, isLoading: isMilestonesLoading, refetch: refetchMilestones } = useMilestones(
    agreement ? agreementId : undefined,
    agreement?.milestoneCount ?? 0,
  )

  function refresh() {
    void refetchAgreement()
    void refetchMilestones()
  }

  if (isAgreementLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!agreement) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Agreement not found"
        description={`Agreement #${agreementId.toString()} does not exist, or the contract is not deployed.`}
        action={<Button variant="secondary" onClick={onBack}>← Back</Button>}
      />
    )
  }

  const isClient   = address?.toLowerCase() === agreement.client.toLowerCase()
  const isProvider = address?.toLowerCase() === agreement.provider.toLowerCase()
  const isResolver = address?.toLowerCase() === agreement.resolver.toLowerCase()

  const myRole = isClient ? 'Client' : isProvider ? 'Provider' : isResolver ? 'Resolver' : 'Observer'

  const releasedCount = milestones.filter(m => m.status === 3).length

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-[--muted] hover:text-[--ink] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus] rounded-lg px-1"
          >
            <ChevronLeft className="size-4" />
            Agreements
          </button>
          <span className="text-[--border-strong]">/</span>
          <h1 className="display text-lg font-semibold text-[--ink]">Agreement #{agreementId.toString()}</h1>
          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
            myRole === 'Client'   ? 'bg-[--accent-light] text-[--accent]' :
            myRole === 'Provider' ? 'bg-[--warm-light] text-[--warm]' :
            myRole === 'Resolver' ? 'bg-[--success-light] text-[--success]' :
            'bg-[--surface-muted] text-[--muted]'
          }`}>{myRole}</span>
        </div>
        <button
          onClick={refresh}
          aria-label="Refresh"
          className="rounded-xl p-2 text-[--subtle] hover:text-[--ink] hover:bg-[--surface-muted] transition-colors"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Milestones', value: agreement.milestoneCount },
          { label: 'Released', value: `${releasedCount}/${agreement.milestoneCount}` },
          { label: 'Status', value: agreement.active ? 'Active' : 'Closed' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-[--border] bg-[--surface-strong] p-4 text-center">
            <p className="display text-xl font-bold text-[--ink]">{s.value}</p>
            <p className="text-xs text-[--muted] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Agreement metadata */}
      <Card>
        <h2 className="display text-sm font-semibold text-[--ink] mb-3">Parties</h2>
        <div className="space-y-0">
          <DataRow label="Client"   value={<AddressChip address={agreement.client}   showExplorer />} />
          <DataRow label="Provider" value={<AddressChip address={agreement.provider} showExplorer />} />
          <DataRow label="Resolver" value={<AddressChip address={agreement.resolver} showExplorer />} />
          <DataRow label="Terms hash" value={<code className="mono text-xs">{fmtHash(agreement.termsHash)}</code>} />
          <DataRow label="Dispute window" value={`${Number(agreement.disputeTimeout) / 86400} days`} />
          <DataRow label="Dispute default" value={agreement.disputeDefaultToProvider ? 'Release to provider' : 'Refund to client'} />
        </div>
      </Card>

      {/* Milestones */}
      <div>
        <h2 className="display text-sm font-semibold text-[--ink] mb-3">Milestones</h2>
        {isMilestonesLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : milestones.length === 0 ? (
          <p className="text-sm text-[--muted] text-center py-6">No milestones found.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <MilestoneCard
                key={i}
                agreement={agreement}
                milestone={m}
                index={i}
                onRefresh={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
