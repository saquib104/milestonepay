/**
 * TxConfirm — pre-signature transaction summary panel.
 *
 * Displayed inside every modal before the user signs a transaction.
 * Shows: token, amount, recipient/contract, allowance requested, Arc gas note.
 * Never shows a "confirm" button itself — the parent TxButton does that.
 *
 * Design rule: every field with a value visible onchain is shown here.
 * Never show ETH as the gas token — Arc uses USDC for gas.
 */
import { ShieldCheck, Info, AlertTriangle } from 'lucide-react'
import { AddressChip } from './AddressChip'
import { fmtUsdc } from '../../utils/formatting'

interface TxConfirmRow {
  label: string
  value: string | React.ReactNode
}

interface TxConfirmProps {
  /** Title for this transaction, e.g. "Fund Milestone" */
  title: string
  /** Rows describing what will happen onchain */
  rows: TxConfirmRow[]
  /** USDC amount being moved (raw 6-dec bigint). Shown in the amount line. */
  amount?: bigint
  /** If this step needs a USDC approval, show what allowance will be granted. */
  approvalAmount?: bigint
  /** The contract address receiving the call */
  contractAddress?: string
  /** Warning string shown in amber — e.g. "Approval limited to this milestone only." */
  warning?: string
  /** If true, show a red "insufficient balance" error instead of the summary. */
  insufficientBalance?: boolean
}

import React from 'react'

export function TxConfirm({
  title,
  rows,
  amount,
  approvalAmount,
  contractAddress,
  warning,
  insufficientBalance,
}: TxConfirmProps) {
  if (insufficientBalance) {
    return (
      <div className="rounded-2xl bg-[--danger-light] border border-[--danger]/20 p-4 flex items-start gap-3">
        <AlertTriangle className="size-4 text-[--danger] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[--danger]">Insufficient USDC balance</p>
          <p className="text-xs text-[--danger]/80 mt-0.5">
            Your USDC balance must cover the milestone amount plus a small gas reserve.
            On Arc, USDC is the gas token — the same balance pays for gas and escrow.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[--border] bg-[--surface-muted] divide-y divide-[--border] overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <ShieldCheck className="size-4 text-[--accent] shrink-0" />
        <span className="font-semibold text-[--ink] text-xs uppercase tracking-wide">{title}</span>
      </div>

      {/* Dynamic rows */}
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
          <span className="text-[--subtle] text-xs shrink-0 pt-0.5">{label}</span>
          <span className="text-[--ink] text-xs text-right font-medium">{value}</span>
        </div>
      ))}

      {/* Amount row */}
      {amount !== undefined && (
        <div className="flex items-start justify-between gap-4 px-4 py-2.5">
          <span className="text-[--subtle] text-xs shrink-0 pt-0.5">Amount</span>
          <span className="font-bold text-[--ink] tabular-nums">{fmtUsdc(amount)} USDC</span>
        </div>
      )}

      {/* Approval row */}
      {approvalAmount !== undefined && (
        <div className="flex items-start justify-between gap-4 px-4 py-2.5">
          <span className="text-[--subtle] text-xs shrink-0 pt-0.5">Allowance granted</span>
          <span className="font-bold text-[--ink] tabular-nums">
            {fmtUsdc(approvalAmount)} USDC <span className="font-normal text-[--subtle]">(exact)</span>
          </span>
        </div>
      )}

      {/* Contract row */}
      {contractAddress && (
        <div className="flex items-start justify-between gap-4 px-4 py-2.5">
          <span className="text-[--subtle] text-xs shrink-0 pt-0.5">Contract</span>
          <AddressChip address={contractAddress} showExplorer />
        </div>
      )}

      {/* Arc gas note */}
      <div className="flex items-start gap-2 px-4 py-2.5 bg-blue-50/50">
        <Info className="size-3.5 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Gas is paid in USDC on Arc — no ETH required. A small USDC amount will be
          deducted from your balance for network fees.
        </p>
      </div>

      {/* Optional warning */}
      {warning && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50/50">
          <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{warning}</p>
        </div>
      )}
    </div>
  )
}
