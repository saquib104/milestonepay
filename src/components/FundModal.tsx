/**
 * FundModal — two-step USDC approve + fund flow.
 *
 * Step 1: Approve the escrow contract for exactly the milestone amount (not unlimited).
 * Step 2: Call fund() to transfer USDC into escrow.
 *
 * Pre-flight checks via useTxGuard:
 *  - Wallet connected and on Arc Mainnet
 *  - USDC balance ≥ amount + gas reserve
 *
 * The pre-sig TxConfirm panel shows token, amount, contract, and exact allowance
 * before any wallet prompt is triggered.
 *
 * On Arc, USDC is the gas token. The native 18-dec view and the ERC-20 6-dec view
 * share one balance. All amounts here use the 6-decimal ERC-20 view.
 * Source: https://docs.arc.io/arc/references/evm-differences (verified 2026-10-11)
 */
import { useState, useEffect } from 'react'
import { ExternalLink, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from './ui/Button'
import { TxButton } from './ui/TxButton'
import { TxConfirm } from './ui/TxConfirm'
import { type AgreementData, type MilestoneData } from '../hooks/useAgreements'
import { useAllowance } from '../hooks/useAllowance'
import { useFundMilestone } from '../hooks/useMilestoneActions'
import { useUsdcBalance } from '../hooks/useUsdcBalance'
import { useTxGuard } from '../hooks/useTxGuard'
import { fmtUsdc, explorerTxUrl, parseOnchainError } from '../utils/formatting'
import { CONTRACT_ADDRESS } from '../utils/constants'
import { toast } from 'sonner'

interface FundModalProps {
  agreement: AgreementData
  milestone: MilestoneData
  milestoneIndex: number
  onClose: () => void
}

export function FundModal({ agreement, milestone, milestoneIndex, onClose }: FundModalProps) {
  const amount = milestone.amount
  const { raw: balance } = useUsdcBalance()
  const guard = useTxGuard(amount)

  const {
    approve, needsApproval, isApprovePending, isApproveConfirming, isApproveConfirmed,
    approveError, refetchAllowance, allowance,
  } = useAllowance(amount)

  const {
    fund, isPending: isFundPending, isConfirming: isFundConfirming,
    isSuccess: isFundSuccess, hash, error: fundError,
  } = useFundMilestone()

  const [approveErr, setApproveErr] = useState<string>()
  const [fundErr, setFundErr]       = useState<string>()

  // After approval confirmed, refresh allowance so step 2 becomes available
  useEffect(() => {
    if (isApproveConfirmed) void refetchAllowance()
  }, [isApproveConfirmed, refetchAllowance])

  function handleApprove() {
    setApproveErr(undefined)
    try {
      approve(amount) // exact amount — no unlimited approval
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setApproveErr(msg)
    }
  }

  async function handleFund() {
    setFundErr(undefined)
    try {
      const txHash = await fund(agreement.id, milestoneIndex)
      toast.success(`Milestone ${milestoneIndex + 1} funded — USDC held in escrow.`)
      return txHash
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setFundErr(msg)
      throw e
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (isFundSuccess && hash) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="size-12 text-[--success]" />
        </div>
        <div>
          <h3 className="display text-lg font-semibold text-[--ink] mb-1">Milestone funded</h3>
          <p className="text-sm text-[--muted]">
            {fmtUsdc(amount)} USDC is now held in escrow. The provider can begin work.
          </p>
        </div>
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[--accent] hover:underline"
        >
          View on Arc Explorer <ExternalLink className="size-3.5" />
        </a>
        <Button className="w-full" onClick={onClose}>Done</Button>
      </div>
    )
  }

  // ── Main flow ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Pre-sig summary panel */}
      <TxConfirm
        title={needsApproval && !isApproveConfirmed ? 'Step 1 of 2 — Approve USDC' : 'Step 2 of 2 — Fund Milestone'}
        rows={[
          { label: 'Agreement', value: `#${agreement.id.toString()}` },
          { label: 'Milestone', value: `#${milestoneIndex + 1}` },
          { label: 'Token', value: 'USDC (ERC-20, 6 decimals)' },
        ]}
        amount={amount}
        approvalAmount={needsApproval && !isApproveConfirmed ? amount : undefined}
        contractAddress={CONTRACT_ADDRESS}
        warning={
          needsApproval && !isApproveConfirmed
            ? 'Allowance is for this milestone amount only — no unlimited approval.'
            : undefined
        }
        insufficientBalance={guard.hasEnoughUsdc === false}
      />

      {/* Balance line */}
      {balance !== undefined && guard.hasEnoughUsdc !== false && (
        <p className="text-xs text-[--subtle] text-right">
          Balance: {fmtUsdc(balance)} USDC
          {allowance !== undefined && allowance > 0n && (
            <> · Allowance: {fmtUsdc(allowance)} USDC</>
          )}
        </p>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-3 text-xs">
        <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isApproveConfirmed ? 'bg-[--success] text-white' : 'bg-[--accent] text-white'}`}>
          {isApproveConfirmed ? '✓' : '1'}
        </div>
        <span className={isApproveConfirmed ? 'line-through text-[--subtle]' : 'text-[--ink] font-medium'}>
          Approve escrow to move {fmtUsdc(amount)} USDC (exact)
        </span>
        <ArrowRight className="size-3.5 text-[--border] ml-auto" />
        <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isFundSuccess ? 'bg-[--success] text-white' : isApproveConfirmed ? 'bg-[--accent] text-white' : 'bg-[--surface-muted] border border-[--border] text-[--subtle]'}`}>
          {isFundSuccess ? '✓' : '2'}
        </div>
        <span className={isFundSuccess ? 'line-through text-[--subtle]' : isApproveConfirmed ? 'text-[--ink] font-medium' : 'text-[--subtle]'}>
          Transfer to escrow
        </span>
      </div>

      {/* Errors */}
      {(approveErr ?? (approveError && !approveErr)) && (
        <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
          <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
          <p className="text-sm text-[--danger]">{approveErr ?? parseOnchainError(approveError)}</p>
        </div>
      )}
      {(fundErr ?? fundError) && (
        <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
          <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
          <p className="text-sm text-[--danger]">{fundErr ?? parseOnchainError(fundError)}</p>
        </div>
      )}

      {/* Action buttons */}
      {guard.hasEnoughUsdc === false ? null
        : needsApproval && !isApproveConfirmed ? (
          <Button
            className="w-full"
            loading={isApprovePending || isApproveConfirming}
            disabled={isApprovePending || isApproveConfirming}
            onClick={handleApprove}
          >
            {isApprovePending
              ? 'Confirm in wallet…'
              : isApproveConfirming
                ? 'Approving on Arc…'
                : `Approve ${fmtUsdc(amount)} USDC`}
            {!isApprovePending && !isApproveConfirming && <ArrowRight className="size-4" />}
          </Button>
        ) : (
          <TxButton
            label={`Fund ${fmtUsdc(amount)} USDC`}
            onClick={() => { void handleFund() }}
            isPending={isFundPending}
            isConfirming={isFundConfirming}
            isSuccess={isFundSuccess}
            error={fundError}
            className="w-full"
          />
        )
      }
    </div>
  )
}
