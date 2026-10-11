import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Plus, Trash2, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from './ui/Button'
import { TxButton } from './ui/TxButton'
import { Field, Input, Textarea, Select } from './ui/FormField'
import { Card } from './ui/Card'
import { useCreateAgreement } from '../hooks/useMilestoneActions'
import { useChainGuard } from '../hooks/useChainGuard'
import { hashTerms } from '../utils/hashing'
import { parseUsdc, fmtUsdc, explorerTxUrl, parseOnchainError } from '../utils/formatting'
import { isAddress } from '../utils/formatting'
import {
  MAX_MILESTONES, DEFAULT_REVISIONS,
  MIN_REVISIONS, MAX_REVISIONS, MIN_DISPUTE_DAYS, MAX_DISPUTE_DAYS
} from '../utils/constants'

interface MilestoneForm {
  title: string
  amountStr: string
  expiryStr: string
  maxRevisions: number
}

interface CreateAgreementProps {
  onBack: () => void
  onCreated: (id: bigint) => void
}

const emptyMilestone = (): MilestoneForm => ({
  title: '',
  amountStr: '',
  expiryStr: '',
  maxRevisions: DEFAULT_REVISIONS,
})

function parseDateToTimestamp(dateStr: string): bigint | null {
  const ms = new Date(dateStr).getTime()
  if (isNaN(ms)) return null
  return BigInt(Math.floor(ms / 1000))
}

const minDateStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function CreateAgreement({ onBack, onCreated: _onCreated }: CreateAgreementProps) {
  const { address } = useAccount()
  useChainGuard() // ensures the chain guard banner shows
  const { createAgreement, isPending, isConfirming, isSuccess, hash, error } = useCreateAgreement()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1: Parties
  const [provider, setProvider] = useState('')
  const [resolver, setResolver] = useState('')
  const [termsText, setTermsText] = useState('')
  const [termsHash, setTermsHash] = useState<`0x${string}` | null>(null)

  // Step 2: Milestones
  const [milestones, setMilestones] = useState<MilestoneForm[]>([emptyMilestone()])

  // Step 3: Dispute terms
  const [disputeDays, setDisputeDays] = useState(30)
  const [disputeDefaultToProvider, setDisputeDefaultToProvider] = useState(false)

  // Errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [txError, setTxError] = useState<string>()

  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    if (!isAddress(provider)) errs.provider = 'Enter a valid Ethereum address (0x…)'
    if (address && provider.toLowerCase() === address.toLowerCase()) errs.provider = 'Provider cannot be the same as your wallet.'
    if (!isAddress(resolver)) errs.resolver = 'Enter a valid Ethereum address (0x…)'
    if (address && resolver.toLowerCase() === address.toLowerCase()) errs.resolver = 'Resolver cannot be the same as the client.'
    if (provider && resolver && provider.toLowerCase() === resolver.toLowerCase()) errs.resolver = 'Resolver cannot be the same as the provider.'
    if (!termsText.trim()) errs.termsText = 'Enter the agreement terms to hash.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleStep1Next() {
    if (!validateStep1()) return
    const h = await hashTerms(termsText)
    setTermsHash(h)
    setStep(2)
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {}
    milestones.forEach((m, i) => {
      if (!m.title.trim()) errs[`m${i}_title`] = 'Milestone title required.'
      const amount = parseUsdc(m.amountStr)
      if (amount === 0n) errs[`m${i}_amount`] = 'Enter a positive USDC amount.'
      const ts = parseDateToTimestamp(m.expiryStr)
      if (!ts) errs[`m${i}_expiry`] = 'Enter a valid future date.'
      else if (ts <= BigInt(Math.floor(Date.now() / 1000))) errs[`m${i}_expiry`] = 'Expiry must be in the future.'
    })
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function addMilestone() {
    if (milestones.length >= MAX_MILESTONES) return
    setMilestones(prev => [...prev, emptyMilestone()])
  }

  function removeMilestone(i: number) {
    setMilestones(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateMilestone(i: number, key: keyof MilestoneForm, value: string | number) {
    setMilestones(prev => prev.map((m, idx) => idx === i ? { ...m, [key]: value } : m))
  }

  const totalAmount = milestones.reduce((sum, m) => sum + parseUsdc(m.amountStr), 0n)

  async function handleSubmit() {
    if (!address || !termsHash) return
    setTxError(undefined)
    try {
      const amounts = milestones.map(m => parseUsdc(m.amountStr))
      const expiries = milestones.map(m => parseDateToTimestamp(m.expiryStr)!)
      const revisions = milestones.map(m => m.maxRevisions)
      const timeout = BigInt(disputeDays * 24 * 60 * 60)

      await createAgreement(
        provider as `0x${string}`,
        resolver as `0x${string}`,
        termsHash,
        amounts,
        expiries,
        revisions,
        timeout,
        disputeDefaultToProvider,
      )
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  // After success, parse the agreement ID from the hash — for now just go to dashboard
  // (a proper implementation would parse the AgreementCreated event)
  if (isSuccess && hash) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 text-center">
        <div className="rounded-3xl border border-[--border] bg-[--surface-strong] p-8" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="mb-4 flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[--success-light]">
              <svg className="size-7 text-[--success]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="display text-xl font-semibold text-[--ink] mb-2">Agreement created</h2>
          <p className="text-sm text-[--muted] mb-6 text-pretty">
            The agreement and {milestones.length} milestone{milestones.length > 1 ? 's' : ''} have been recorded onchain on Arc Mainnet.
            Share the agreement ID with the provider so they can view their tasks.
          </p>
          <a
            href={explorerTxUrl(hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[--accent] hover:underline mb-6"
          >
            View transaction on Arc Explorer
            <ExternalLink className="size-3.5" />
          </a>
          <div className="flex flex-col gap-3 mt-2">
            <Button onClick={onBack} className="w-full">Go to dashboard</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <h1 className="display text-xl font-semibold text-[--ink]">New agreement</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['Parties', 'Milestones', 'Dispute terms'] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
              step === i + 1 ? 'bg-[--accent] text-white' :
              step > i + 1 ? 'bg-[--success] text-white' :
              'bg-[--surface-muted] text-[--muted]'
            }`}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${step === i + 1 ? 'font-medium text-[--ink]' : 'text-[--subtle]'}`}>{label}</span>
            {i < 2 && <span className="text-[--border-strong]">—</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Parties */}
      {step === 1 && (
        <div className="space-y-5">
          <Field label="Provider wallet address" required error={fieldErrors.provider}
            hint="The address that will deliver work and receive payment.">
            <Input
              value={provider} onChange={e => setProvider(e.target.value)}
              placeholder="0x…" error={!!fieldErrors.provider}
            />
          </Field>

          <Field label="Resolver wallet address" required error={fieldErrors.resolver}
            hint="A neutral address agreed by both parties. This person resolves disputes — they are NOT a neutral automated service.">
            <Input
              value={resolver} onChange={e => setResolver(e.target.value)}
              placeholder="0x…" error={!!fieldErrors.resolver}
            />
          </Field>

          <div className="rounded-xl border border-[--warning-light] bg-[--warning-light] px-4 py-3">
            <p className="text-xs text-[--warning] leading-relaxed">
              <strong>Resolver trust:</strong> The resolver can direct any disputed milestone payment to either party. Choose someone genuinely neutral — a trusted colleague, a professional escrow service, or a multisig wallet both parties control. The contract cannot verify their neutrality.
            </p>
          </div>

          <Field label="Agreement terms" required error={fieldErrors.termsText}
            hint="Paste or type the full agreement text. It will be hashed (SHA-256) and the hash stored onchain. Keep the original document — the hash alone is not the contract.">
            <Textarea
              value={termsText} onChange={e => setTermsText(e.target.value)}
              placeholder="Paste your agreement terms here…"
              rows={6} error={!!fieldErrors.termsText}
            />
          </Field>

          <Button className="w-full" onClick={() => { void handleStep1Next() }}>
            Continue to milestones →
          </Button>
        </div>
      )}

      {/* Step 2: Milestones */}
      {step === 2 && (
        <div className="space-y-5">
          {milestones.map((m, i) => (
            <Card key={i} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="display text-sm font-semibold text-[--ink]">Milestone {i + 1}</span>
                {milestones.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeMilestone(i)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>

              <Field label="Title" required error={fieldErrors[`m${i}_title`]}>
                <Input
                  value={m.title}
                  onChange={e => updateMilestone(i, 'title', e.target.value)}
                  placeholder="e.g. Design mockups delivered"
                  error={!!fieldErrors[`m${i}_title`]}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount (USDC)" required error={fieldErrors[`m${i}_amount`]}>
                  <Input
                    value={m.amountStr}
                    onChange={e => updateMilestone(i, 'amountStr', e.target.value)}
                    placeholder="0.00" inputMode="decimal"
                    error={!!fieldErrors[`m${i}_amount`]}
                  />
                </Field>

                <Field label="Submission deadline" required error={fieldErrors[`m${i}_expiry`]}>
                  <Input
                    type="date" value={m.expiryStr}
                    min={minDateStr()}
                    onChange={e => updateMilestone(i, 'expiryStr', e.target.value)}
                    error={!!fieldErrors[`m${i}_expiry`]}
                  />
                </Field>
              </div>

              <Field label="Max revision rounds" hint="After this many change requests, the milestone auto-escalates to dispute.">
                <Select value={m.maxRevisions} onChange={e => updateMilestone(i, 'maxRevisions', Number(e.target.value))}>
                  {Array.from({ length: MAX_REVISIONS - MIN_REVISIONS + 1 }, (_, j) => j + MIN_REVISIONS).map(n => (
                    <option key={n} value={n}>{n} {n === DEFAULT_REVISIONS ? '(default)' : ''}</option>
                  ))}
                </Select>
              </Field>
            </Card>
          ))}

          {milestones.length < MAX_MILESTONES && (
            <button
              onClick={addMilestone}
              className="w-full rounded-2xl border-2 border-dashed border-[--border] py-4 text-sm font-medium text-[--muted] hover:border-[--accent] hover:text-[--accent] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
            >
              <Plus className="size-4 inline mr-1" />
              Add milestone ({milestones.length}/{MAX_MILESTONES})
            </button>
          )}

          <div className="rounded-xl bg-[--surface-muted] px-4 py-3 flex justify-between text-sm">
            <span className="text-[--muted]">Total escrow required</span>
            <span className="display font-semibold text-[--ink] tabular-nums">{fmtUsdc(totalAmount)} USDC</span>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">← Back</Button>
            <Button className="flex-1" onClick={() => { if (validateStep2()) setStep(3) }}>Continue →</Button>
          </div>
        </div>
      )}

      {/* Step 3: Dispute terms + confirmation */}
      {step === 3 && (
        <div className="space-y-5">
          <Field label="Dispute resolution window"
            hint={`How long the resolver has to act after a dispute is raised. After this deadline, either party can trigger the default outcome. (${MIN_DISPUTE_DAYS}–${MAX_DISPUTE_DAYS} days)`}>
            <div className="flex items-center gap-3">
              <Input
                type="number" value={disputeDays} min={MIN_DISPUTE_DAYS} max={MAX_DISPUTE_DAYS}
                onChange={e => setDisputeDays(Math.max(MIN_DISPUTE_DAYS, Math.min(MAX_DISPUTE_DAYS, Number(e.target.value))))}
                className="w-24"
              />
              <span className="text-sm text-[--muted]">days</span>
            </div>
          </Field>

          <Field label="Default outcome if resolver doesn't act"
            hint="If the resolver doesn't resolve within the window, who receives the escrowed funds?">
            <div className="space-y-2">
              {[false, true].map(val => (
                <label key={String(val)} className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  disputeDefaultToProvider === val ? 'border-[--accent] bg-[--accent-light]' : 'border-[--border] hover:bg-[--surface-muted]'
                }`}>
                  <input
                    type="radio" name="defaultTo" value={String(val)}
                    checked={disputeDefaultToProvider === val}
                    onChange={() => setDisputeDefaultToProvider(val)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-[--ink]">
                      {val ? 'Release to provider' : 'Refund to client'}
                    </p>
                    <p className="text-xs text-[--muted]">
                      {val
                        ? 'Provider is presumed to have delivered. Use when client is more likely to dispute in bad faith.'
                        : 'Client is refunded. Use for new provider relationships or high-risk engagements.'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {/* Summary */}
          <Card className="bg-[--surface-muted]">
            <h3 className="display text-sm font-semibold text-[--ink] mb-3">Agreement summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[--muted]">Milestones</span><span className="font-medium">{milestones.length}</span></div>
              <div className="flex justify-between"><span className="text-[--muted]">Total escrow</span><span className="font-medium tabular-nums">{fmtUsdc(totalAmount)} USDC</span></div>
              <div className="flex justify-between"><span className="text-[--muted]">Dispute window</span><span className="font-medium">{disputeDays} days</span></div>
              <div className="flex justify-between"><span className="text-[--muted]">Default outcome</span><span className="font-medium">{disputeDefaultToProvider ? 'Release to provider' : 'Refund to client'}</span></div>
            </div>
          </Card>

          <div className="rounded-xl border border-[--border] bg-[--surface-muted] px-4 py-3">
            <p className="text-xs text-[--muted] leading-relaxed">
              <strong className="text-[--ink]">What happens next:</strong> Your wallet will ask you to sign one transaction to create this agreement onchain. The escrow contract will record your wallet as the client, the provider, and the resolver addresses, the terms hash, and all milestone parameters. No USDC is transferred at this step — each milestone is funded separately.
            </p>
          </div>

          {txError && (
            <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
              <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
              <p className="text-sm text-[--danger]">{txError}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">← Back</Button>
            <TxButton
              label="Create agreement"
              onClick={() => { void handleSubmit() }}
              isPending={isPending}
              isConfirming={isConfirming}
              isSuccess={isSuccess}
              error={error}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  )
}
