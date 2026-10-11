import { useState, useMemo } from 'react'
import { ExternalLink, AlertCircle, CheckCircle2, Scale } from 'lucide-react'
import { Button } from './ui/Button'
import { TxButton } from './ui/TxButton'
import { Field, Textarea } from './ui/FormField'
import { type AgreementData, type MilestoneData } from '../hooks/useAgreements'
import { useRaiseDispute, useResolveDispute, useClaimDisputeRefund } from '../hooks/useMilestoneActions'
import { hashReason } from '../utils/hashing'
import { fmtUsdc, fmtDate, explorerTxUrl, parseOnchainError } from '../utils/formatting'
import { MILESTONE_STATUS } from '../utils/constants'
import { AddressChip } from './ui/AddressChip'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'

interface DisputePanelProps {
  agreement: AgreementData
  milestone: MilestoneData
  milestoneIndex: number
  onClose: () => void
}

export function DisputePanel({ agreement, milestone, milestoneIndex, onClose }: DisputePanelProps) {
  const { address } = useAccount()
  const [mode, setMode] = useState<'info' | 'raise' | 'resolve' | 'claim'>('info')
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [txError, setTxError] = useState<string>()

  const raise   = useRaiseDispute()
  const resolve = useResolveDispute()
  const claim   = useClaimDisputeRefund()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [])
  const isClient   = address?.toLowerCase() === agreement.client.toLowerCase()
  const isProvider = address?.toLowerCase() === agreement.provider.toLowerCase()
  const isResolver = address?.toLowerCase() === agreement.resolver.toLowerCase()

  const isAlreadyDisputed = milestone.status === MILESTONE_STATUS.Disputed
  const canClaim = isAlreadyDisputed && milestone.disputeDeadline > 0n && now >= milestone.disputeDeadline

  const activeHook = mode === 'raise' ? raise : mode === 'resolve' ? resolve : claim
  const txHash = activeHook.hash

  async function handleRaise() {
    if (!reason.trim()) { setFieldError('Describe the reason for the dispute.'); return }
    setFieldError(undefined)
    setTxError(undefined)
    try {
      const h = await hashReason(reason)
      await raise.raiseDispute(agreement.id, milestoneIndex, h)
      toast.success('Dispute raised.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  async function handleResolve(releaseToProvider: boolean) {
    setTxError(undefined)
    try {
      await resolve.resolveDispute(agreement.id, milestoneIndex, releaseToProvider)
      toast.success(`Dispute resolved — ${releaseToProvider ? 'payment released to provider' : 'refunded to client'}.`)
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  async function handleClaim() {
    setTxError(undefined)
    try {
      await claim.claimDisputeRefund(agreement.id, milestoneIndex)
      toast.success('Dispute timeout claimed.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  // Success
  if (activeHook.isSuccess && txHash) {
    return (
      <div className="text-center py-4">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="size-12 text-[--success]" />
        </div>
        <h3 className="display text-lg font-semibold text-[--ink] mb-2">Done</h3>
        <a
          href={explorerTxUrl(txHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[--accent] hover:underline mb-5"
        >
          View on Arc Explorer <ExternalLink className="size-3.5" />
        </a>
        <div className="mt-4"><Button className="w-full" onClick={onClose}>Close</Button></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Resolver info */}
      <div className="rounded-xl bg-[--surface-muted] p-3 text-xs text-[--muted]">
        Designated resolver: <AddressChip address={agreement.resolver} showExplorer />
      </div>

      {/* Already disputed — resolver or claim */}
      {isAlreadyDisputed && !resolve.isSuccess && !claim.isSuccess && (
        <>
          {isResolver && mode !== 'resolve' && (
            <button
              onClick={() => setMode('resolve')}
              className="w-full flex items-center gap-3 rounded-2xl border border-[--border] p-4 hover:border-[--accent] hover:bg-[--accent-light] transition-colors"
            >
              <Scale className="size-5 text-[--accent]" />
              <div className="text-left">
                <p className="text-sm font-semibold text-[--ink]">Resolve this dispute</p>
                <p className="text-xs text-[--muted]">As the resolver, you decide where the funds go.</p>
              </div>
            </button>
          )}

          {canClaim && mode !== 'claim' && (
            <button
              onClick={() => setMode('claim')}
              className="w-full flex items-center gap-3 rounded-2xl border border-[--warning-light] p-4 hover:bg-[--warning-light] transition-colors"
            >
              <AlertCircle className="size-5 text-[--warning]" />
              <div className="text-left">
                <p className="text-sm font-semibold text-[--ink]">Claim after resolver timeout</p>
                <p className="text-xs text-[--muted]">
                  The deadline has passed. Outcome: {agreement.disputeDefaultToProvider ? 'funds to provider' : 'refund to client'}.
                </p>
              </div>
            </button>
          )}

          {!canClaim && !isResolver && (
            <div className="rounded-xl bg-[--warning-light] px-4 py-3 text-xs text-[--warning]">
              Dispute deadline: {fmtDate(milestone.disputeDeadline)} — waiting for resolver to act.
              {agreement.disputeDefaultToProvider
                ? ' If the resolver does not act, funds will be released to the provider.'
                : ' If the resolver does not act, funds will be refunded to the client.'}
            </div>
          )}
        </>
      )}

      {/* Not yet disputed — raise */}
      {!isAlreadyDisputed && mode === 'info' && (isClient || isProvider) && (
        <>
          <div className="rounded-xl bg-[--danger-light] px-4 py-3">
            <p className="text-sm font-semibold text-[--danger] mb-1">Raise a formal dispute</p>
            <p className="text-xs text-[--muted] text-pretty">
              Escalating locks the milestone in dispute state. Neither party can take unilateral action. The resolver (<AddressChip address={agreement.resolver} />) must decide within {Number(agreement.disputeTimeout) / 86400} days.
            </p>
          </div>
          <Button variant="danger" className="w-full" onClick={() => setMode('raise')}>
            Raise dispute
          </Button>
        </>
      )}

      {/* Raise form */}
      {mode === 'raise' && (
        <>
          <button onClick={() => setMode('info')} className="text-xs text-[--muted] hover:text-[--ink]">← Back</button>
          <Field label="Reason for dispute" required error={fieldError}
            hint="A hash of this text is stored onchain. Keep the original for the resolver's review.">
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Explain the issue and why you are escalating…"
              rows={4} error={!!fieldError} />
          </Field>
          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}
          <TxButton label="Submit dispute" onClick={() => { void handleRaise() }}
            isPending={raise.isPending} isConfirming={raise.isConfirming}
            isSuccess={raise.isSuccess} error={raise.error} className="w-full" />
        </>
      )}

      {/* Resolve form (resolver only) */}
      {mode === 'resolve' && isResolver && (
        <>
          <button onClick={() => setMode('info')} className="text-xs text-[--muted] hover:text-[--ink]">← Back</button>
          <div className="rounded-xl bg-[--surface-muted] p-4 text-center mb-4">
            <p className="text-xs text-[--muted] mb-1">Disputed amount</p>
            <p className="display text-2xl font-bold tabular-nums text-[--ink]">
              {fmtUsdc(milestone.amount)} <span className="text-base font-medium text-[--muted]">USDC</span>
            </p>
          </div>
          <p className="text-sm text-[--muted]">Choose how to resolve this dispute:</p>
          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <TxButton label="Release to provider" onClick={() => { void handleResolve(true) }}
              isPending={resolve.isPending} isConfirming={resolve.isConfirming}
              isSuccess={resolve.isSuccess} error={resolve.error} size="md" />
            <Button variant="secondary" size="md" onClick={() => { void handleResolve(false) }}
              disabled={resolve.isPending || resolve.isConfirming}>
              Refund client
            </Button>
          </div>
        </>
      )}

      {/* Claim timeout */}
      {mode === 'claim' && (
        <>
          <button onClick={() => setMode('info')} className="text-xs text-[--muted] hover:text-[--ink]">← Back</button>
          <p className="text-sm text-[--muted] text-pretty">
            The dispute window has expired without the resolver acting. Outcome is predetermined: <strong className="text-[--ink]">{agreement.disputeDefaultToProvider ? 'funds to provider' : 'refund to client'}</strong>.
          </p>
          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}
          <TxButton label="Claim funds" onClick={() => { void handleClaim() }}
            isPending={claim.isPending} isConfirming={claim.isConfirming}
            isSuccess={claim.isSuccess} error={claim.error} className="w-full" />
        </>
      )}
    </div>
  )
}
