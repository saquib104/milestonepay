import { useState, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { ChevronDown, ChevronUp, Clock, AlertTriangle } from 'lucide-react'
import { Card, DataRow } from './ui/Card'
import { MilestoneBadge } from './ui/Badge'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
import { FundModal } from './FundModal'
import { SubmitModal } from './SubmitModal'
import { ReviewModal } from './ReviewModal'
import { DisputePanel } from './DisputePanel'
import { type AgreementData, type MilestoneData } from '../hooks/useAgreements'
import { fmtUsdc, fmtDate, fmtRelative, fmtHash } from '../utils/formatting'
import { MILESTONE_STATUS } from '../utils/constants'

interface MilestoneCardProps {
  agreement: AgreementData
  milestone: MilestoneData
  index: number
  onRefresh: () => void
}

export function MilestoneCard({ agreement, milestone, index, onRefresh }: MilestoneCardProps) {
  const { address } = useAccount()
  const [expanded, setExpanded] = useState(false)
  const [sheet, setSheet] = useState<'fund' | 'submit' | 'review' | 'dispute' | null>(null)

  const isClient   = address?.toLowerCase() === agreement.client.toLowerCase()
  const isProvider = address?.toLowerCase() === agreement.provider.toLowerCase()
  const isResolver = address?.toLowerCase() === agreement.resolver.toLowerCase()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [])
  const isExpired     = now >= milestone.expiry
  const canClaimRefund = isClient && milestone.status === MILESTONE_STATUS.Funded && isExpired
  const canFund       = isClient && milestone.status === MILESTONE_STATUS.Pending
  const canSubmit     = isProvider && (milestone.status === MILESTONE_STATUS.Funded || milestone.status === MILESTONE_STATUS.Revision) && !isExpired
  const canReview     = isClient && milestone.status === MILESTONE_STATUS.Submitted
  const canDispute    = (isClient || isProvider) &&
    (milestone.status === MILESTONE_STATUS.Funded ||
     milestone.status === MILESTONE_STATUS.Submitted ||
     milestone.status === MILESTONE_STATUS.Revision)
  const canResolve    = isResolver && milestone.status === MILESTONE_STATUS.Disputed
  const canClaimDisputeRefund = (isClient || isProvider) &&
    milestone.status === MILESTONE_STATUS.Disputed &&
    milestone.disputeDeadline > 0n &&
    now >= milestone.disputeDeadline

  const statusIsTerminal = milestone.status === MILESTONE_STATUS.Released || milestone.status === MILESTONE_STATUS.Refunded

  function primaryAction() {
    if (canFund)              return { label: 'Fund escrow', action: () => setSheet('fund') }
    if (canSubmit)            return { label: 'Submit deliverable', action: () => setSheet('submit') }
    if (canReview)            return { label: 'Review submission', action: () => setSheet('review') }
    if (canClaimRefund)       return { label: 'Claim refund', action: () => setSheet('review') }
    if (canResolve)           return { label: 'Resolve dispute', action: () => setSheet('dispute') }
    if (canClaimDisputeRefund) return { label: 'Claim after timeout', action: () => setSheet('dispute') }
    return null
  }

  const action = primaryAction()

  return (
    <>
      <Card className="p-0 overflow-hidden">
        {/* Header row */}
        <button
          className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-[--surface-muted] transition-colors text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-7 items-center justify-center rounded-full bg-[--surface-muted] text-xs font-semibold text-[--muted] shrink-0">
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="display text-sm font-semibold text-[--ink] truncate">
                  Milestone {index + 1}
                </span>
                <MilestoneBadge status={milestone.status as 0|1|2|3|4|5|6} />
              </div>
              <div className="flex gap-3 mt-0.5 text-xs text-[--subtle]">
                <span className="tabular-nums">{fmtUsdc(milestone.amount)} USDC</span>
                {!statusIsTerminal && <span>Due {fmtDate(milestone.expiry)}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {action && (
              <Button
                size="sm"
                onClick={e => { e.stopPropagation(); action.action() }}
              >
                {action.label}
              </Button>
            )}
            {canDispute && !canReview && (
              <Button
                size="sm"
                variant="ghost"
                onClick={e => { e.stopPropagation(); setSheet('dispute') }}
              >
                Dispute
              </Button>
            )}
            {expanded ? <ChevronUp className="size-4 text-[--subtle]" /> : <ChevronDown className="size-4 text-[--subtle]" />}
          </div>
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-[--border] px-5 py-4 space-y-1">
            <DataRow label="Amount" value={<span className="tabular-nums">{fmtUsdc(milestone.amount)} USDC</span>} />
            <DataRow label="Submission deadline" value={
              <span className={isExpired && !statusIsTerminal ? 'text-[--danger]' : ''}>
                {fmtDate(milestone.expiry)}
                {isExpired && !statusIsTerminal && <span className="ml-2 text-xs">(expired)</span>}
              </span>
            } />
            <DataRow label="Revision rounds" value={`${milestone.revisionCount} of ${milestone.maxRevisions}`} />
            {milestone.deliverableHash && milestone.deliverableHash !== '0x' + '0'.repeat(64) && (
              <DataRow label="Deliverable hash" value={
                <code className="mono text-xs">{fmtHash(milestone.deliverableHash)}</code>
              } />
            )}
            {milestone.status === MILESTONE_STATUS.Disputed && milestone.disputeDeadline > 0n && (
              <DataRow label="Dispute deadline" value={
                <span className={now >= milestone.disputeDeadline ? 'text-[--danger]' : ''}>
                  {fmtDate(milestone.disputeDeadline)} ({fmtRelative(milestone.disputeDeadline)})
                </span>
              } />
            )}

            {/* Context-specific notice */}
            {milestone.status === MILESTONE_STATUS.Disputed && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-[--danger-light] px-3 py-2.5">
                <AlertTriangle className="size-4 text-[--danger] shrink-0 mt-0.5" />
                <p className="text-xs text-[--danger]">
                  {isResolver
                    ? 'You are the designated resolver. You can release funds to the provider or refund the client.'
                    : `This milestone is in dispute. The resolver must act before ${fmtDate(milestone.disputeDeadline)}.`
                  }
                </p>
              </div>
            )}
            {milestone.status === MILESTONE_STATUS.Revision && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-[--warning-light] px-3 py-2.5">
                <Clock className="size-4 text-[--warning] shrink-0 mt-0.5" />
                <p className="text-xs text-[--warning]">
                  Changes have been requested. {isProvider ? 'Please resubmit your deliverable.' : 'Awaiting provider resubmission.'}
                  <span className="ml-1">({milestone.revisionCount}/{milestone.maxRevisions} revisions used)</span>
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Action sheets */}
      <Sheet open={sheet === 'fund'} onClose={() => setSheet(null)} title="Fund milestone">
        <FundModal agreement={agreement} milestone={milestone} milestoneIndex={index}
          onClose={() => { setSheet(null); onRefresh() }} />
      </Sheet>

      <Sheet open={sheet === 'submit'} onClose={() => setSheet(null)} title="Submit deliverable">
        <SubmitModal agreement={agreement} milestone={milestone} milestoneIndex={index}
          onClose={() => { setSheet(null); onRefresh() }} />
      </Sheet>

      <Sheet open={sheet === 'review'} onClose={() => setSheet(null)} title="Review submission">
        <ReviewModal agreement={agreement} milestone={milestone} milestoneIndex={index}
          onClose={() => { setSheet(null); onRefresh() }} />
      </Sheet>

      <Sheet open={sheet === 'dispute'} onClose={() => setSheet(null)} title="Dispute">
        <DisputePanel agreement={agreement} milestone={milestone} milestoneIndex={index}
          onClose={() => { setSheet(null); onRefresh() }} />
      </Sheet>
    </>
  )
}
