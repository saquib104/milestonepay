import { useState, useMemo } from 'react'
import { ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from './ui/Button'
import { TxButton } from './ui/TxButton'
import { Field, Textarea } from './ui/FormField'
import { type AgreementData, type MilestoneData } from '../hooks/useAgreements'
import { useApproveRelease, useRequestChanges, useClaimRefund } from '../hooks/useMilestoneActions'
import { hashReason } from '../utils/hashing'
import { fmtUsdc, fmtDate, explorerTxUrl, parseOnchainError } from '../utils/formatting'
import { MILESTONE_STATUS } from '../utils/constants'
import { toast } from 'sonner'

interface ReviewModalProps {
  agreement: AgreementData
  milestone: MilestoneData
  milestoneIndex: number
  onClose: () => void
}

type Mode = 'choose' | 'approve' | 'changes' | 'refund'

export function ReviewModal({ agreement, milestone, milestoneIndex, onClose }: ReviewModalProps) {
  const [mode, setMode] = useState<Mode>('choose')
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [txError, setTxError] = useState<string>()

  const approve = useApproveRelease()
  const changes = useRequestChanges()
  const refund  = useClaimRefund()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [])
  const isExpired = now >= milestone.expiry
  const revisionsLeft = milestone.maxRevisions - milestone.revisionCount
  const canClaimRefund = milestone.status === MILESTONE_STATUS.Funded && isExpired

  const activeHook = mode === 'approve' ? approve : mode === 'changes' ? changes : refund
  const txHash = activeHook.hash

  async function handleApprove() {
    setTxError(undefined)
    try {
      await approve.approveRelease(agreement.id, milestoneIndex)
      toast.success('Payment released to provider.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  async function handleChanges() {
    if (!reason.trim()) { setFieldError('Describe what needs to change.'); return }
    setFieldError(undefined)
    setTxError(undefined)
    try {
      const h = await hashReason(reason)
      await changes.requestChanges(agreement.id, milestoneIndex, h)
      toast.success('Changes requested.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  async function handleRefund() {
    setTxError(undefined)
    try {
      await refund.claimRefund(agreement.id, milestoneIndex)
      toast.success('Refund claimed.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  // Success screen
  if (activeHook.isSuccess && txHash) {
    const successMessage =
      mode === 'approve'  ? 'Payment released to provider.' :
      mode === 'changes'  ? 'Changes requested. Provider will resubmit.' :
      'Refund credited to your withdrawal balance.'

    return (
      <div className="text-center py-4">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="size-12 text-[--success]" />
        </div>
        <h3 className="display text-lg font-semibold text-[--ink] mb-2">Done</h3>
        <p className="text-sm text-[--muted] mb-5">{successMessage}</p>
        <a
          href={explorerTxUrl(txHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[--accent] hover:underline mb-5"
        >
          View on Arc Explorer <ExternalLink className="size-3.5" />
        </a>
        <Button className="w-full" onClick={onClose}>Close</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Mode chooser */}
      {mode === 'choose' && (
        <>
          <p className="text-sm text-[--muted]">
            {canClaimRefund
              ? 'The submission deadline has passed. You can claim a full refund.'
              : 'The provider has submitted their work. Review and choose an action.'}
          </p>

          <div className="space-y-2">
            {!canClaimRefund && (
              <button
                onClick={() => setMode('approve')}
                className="w-full flex items-start gap-3 rounded-2xl border border-[--border] p-4 text-left hover:border-[--accent] hover:bg-[--accent-light] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-[--success-light]">
                  <CheckCircle2 className="size-4 text-[--success]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[--ink]">Approve and release payment</p>
                  <p className="text-xs text-[--muted]">{fmtUsdc(milestone.amount)} USDC is credited to the provider's withdrawal balance.</p>
                </div>
              </button>
            )}

            {!canClaimRefund && revisionsLeft > 0 && (
              <button
                onClick={() => setMode('changes')}
                className="w-full flex items-start gap-3 rounded-2xl border border-[--border] p-4 text-left hover:border-[--warning] hover:bg-[--warning-light] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-[--warning-light]">
                  <AlertCircle className="size-4 text-[--warning]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[--ink]">Request changes</p>
                  <p className="text-xs text-[--muted]">
                    Ask the provider to revise. {revisionsLeft} revision round{revisionsLeft !== 1 ? 's' : ''} remaining before dispute is forced.
                  </p>
                </div>
              </button>
            )}

            {canClaimRefund && (
              <button
                onClick={() => setMode('refund')}
                className="w-full flex items-start gap-3 rounded-2xl border border-[--border] p-4 text-left hover:border-[--danger] hover:bg-[--danger-light] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-[--danger-light]">
                  <AlertCircle className="size-4 text-[--danger]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[--ink]">Claim refund</p>
                  <p className="text-xs text-[--muted]">Submission deadline passed. Reclaim {fmtUsdc(milestone.amount)} USDC.</p>
                </div>
              </button>
            )}
          </div>
        </>
      )}

      {/* Approve mode */}
      {mode === 'approve' && (
        <>
          <button onClick={() => setMode('choose')} className="text-xs text-[--muted] hover:text-[--ink]">← Back</button>
          <div className="rounded-2xl bg-[--success-light] p-4 text-center">
            <p className="text-xs text-[--success] mb-1">Releasing to provider</p>
            <p className="display text-2xl font-bold tabular-nums text-[--ink]">
              {fmtUsdc(milestone.amount)} <span className="text-base font-medium text-[--muted]">USDC</span>
            </p>
          </div>
          <p className="text-xs text-[--muted]">
            Once confirmed onchain, this action cannot be reversed. Payment will be added to the provider's pending withdrawal balance.
          </p>
          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}
          <TxButton label="Confirm approval" onClick={() => { void handleApprove() }}
            isPending={approve.isPending} isConfirming={approve.isConfirming}
            isSuccess={approve.isSuccess} error={approve.error} className="w-full" />
        </>
      )}

      {/* Request changes mode */}
      {mode === 'changes' && (
        <>
          <button onClick={() => setMode('choose')} className="text-xs text-[--muted] hover:text-[--ink]">← Back</button>
          <Field label="Reason for changes" required error={fieldError}
            hint="Describe specifically what needs to be revised. A hash of this text is stored onchain.">
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="The deliverable is missing X. Please also revise Y…"
              rows={4} error={!!fieldError} />
          </Field>
          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}
          <TxButton label="Request changes" onClick={() => { void handleChanges() }}
            isPending={changes.isPending} isConfirming={changes.isConfirming}
            isSuccess={changes.isSuccess} error={changes.error} className="w-full" />
        </>
      )}

      {/* Claim refund mode */}
      {mode === 'refund' && (
        <>
          <button onClick={() => setMode('choose')} className="text-xs text-[--muted] hover:text-[--ink]">← Back</button>
          <div className="rounded-2xl bg-[--danger-light] p-4 text-center">
            <p className="text-xs text-[--danger] mb-1">Deadline: {fmtDate(milestone.expiry)} (passed)</p>
            <p className="display text-2xl font-bold tabular-nums text-[--ink]">
              {fmtUsdc(milestone.amount)} <span className="text-base font-medium text-[--muted]">USDC</span>
            </p>
          </div>
          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}
          <TxButton label="Claim refund" onClick={() => { void handleRefund() }}
            isPending={refund.isPending} isConfirming={refund.isConfirming}
            isSuccess={refund.isSuccess} error={refund.error} className="w-full" />
        </>
      )}
    </div>
  )
}
