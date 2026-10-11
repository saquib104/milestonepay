import { useState } from 'react'
import { ExternalLink, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { Button } from './ui/Button'
import { TxButton } from './ui/TxButton'
import { TxConfirm } from './ui/TxConfirm'
import { Field, Input } from './ui/FormField'
import { type AgreementData, type MilestoneData } from '../hooks/useAgreements'
import { useSubmitDeliverable } from '../hooks/useMilestoneActions'
import { hashDeliverable } from '../utils/hashing'
import { explorerTxUrl, parseOnchainError } from '../utils/formatting'
import { CONTRACT_ADDRESS } from '../utils/constants'
import { toast } from 'sonner'

interface SubmitModalProps {
  agreement: AgreementData
  milestone: MilestoneData
  milestoneIndex: number
  onClose: () => void
}

export function SubmitModal({ agreement, milestone: _milestone, milestoneIndex, onClose }: SubmitModalProps) {
  const [deliverable, setDeliverable] = useState('')
  const [hashed, setHashed] = useState<`0x${string}` | null>(null)
  const [isHashing, setIsHashing] = useState(false)
  const [txError, setTxError] = useState<string>()
  const [fieldError, setFieldError] = useState<string>()

  const {
    submitDeliverable, isPending, isConfirming, isSuccess, hash, error,
  } = useSubmitDeliverable()

  async function handleHash() {
    if (!deliverable.trim()) { setFieldError('Enter a URL, CID, or reference text for your deliverable.'); return }
    setFieldError(undefined)
    setIsHashing(true)
    const h = await hashDeliverable(deliverable)
    setHashed(h)
    setIsHashing(false)
  }

  async function handleSubmit() {
    if (!hashed) return
    setTxError(undefined)
    try {
      await submitDeliverable(agreement.id, milestoneIndex, hashed)
      toast.success('Deliverable submitted. Awaiting client review.')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Transaction cancelled.') setTxError(msg)
    }
  }

  if (isSuccess && hash) {
    return (
      <div className="text-center py-4">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="size-12 text-[--success]" />
        </div>
        <h3 className="display text-lg font-semibold text-[--ink] mb-2">Deliverable submitted</h3>
        <p className="text-sm text-[--muted] mb-5 text-pretty">
          The deliverable hash has been recorded onchain. The client can now review and approve payment or request changes.
        </p>
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[--accent] hover:underline mb-5"
        >
          View on Arc Explorer <ExternalLink className="size-3.5" />
        </a>
        <Button className="w-full" onClick={onClose}>Done</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-[--accent-light] px-4 py-3">
        <Info className="size-4 text-[--accent] shrink-0 mt-0.5" />
        <p className="text-xs text-[--ink] leading-relaxed">
          You are submitting a cryptographic commitment to your deliverable. Enter a URL, IPFS CID, Arweave TxID, or a descriptive text reference. The hash of this text is stored onchain — keep the original so the client can verify it.
        </p>
      </div>

      <Field label="Deliverable reference" required error={fieldError}
        hint="Enter a URL, content-addressed ID (IPFS/Arweave), or any text that uniquely identifies your deliverable.">
        <div className="flex gap-2">
          <Input
            value={deliverable}
            onChange={e => { setDeliverable(e.target.value); setHashed(null) }}
            placeholder="https://… or ipfs://… or any unique reference"
            error={!!fieldError}
            className="flex-1"
          />
          <Button
            variant="secondary"
            size="md"
            loading={isHashing}
            onClick={() => { void handleHash() }}
          >
            Hash
          </Button>
        </div>
      </Field>

      {hashed && (
        <div className="rounded-xl border border-[--success-light] bg-[--success-light] px-4 py-3">
          <p className="text-xs text-[--success] font-medium mb-1">Deliverable hash (stored onchain)</p>
          <code className="mono text-xs text-[--ink] break-all">{hashed}</code>
          <p className="text-xs text-[--success] mt-1.5">
            Save this hash alongside your deliverable for future verification.
          </p>
        </div>
      )}

      {(txError || error) && (
        <div className="flex items-start gap-2 rounded-xl bg-[--danger-light] px-4 py-3">
          <AlertCircle className="size-4 text-[--danger] shrink-0 mt-0.5" />
          <p className="text-sm text-[--danger]">{txError ?? parseOnchainError(error)}</p>
        </div>
      )}

      {hashed && (
        <TxConfirm
          title="Submit Deliverable"
          rows={[
            { label: 'Agreement', value: `#${agreement.id.toString()}` },
            { label: 'Milestone', value: `#${milestoneIndex + 1}` },
            { label: 'Action', value: 'Record deliverable hash onchain' },
          ]}
          contractAddress={CONTRACT_ADDRESS}
        />
      )}

      {!hashed ? (
        <Button className="w-full" variant="secondary" disabled>
          Hash deliverable first
        </Button>
      ) : (
        <TxButton
          label="Submit deliverable onchain"
          onClick={() => { void handleSubmit() }}
          isPending={isPending}
          isConfirming={isConfirming}
          isSuccess={isSuccess}
          error={error}
          className="w-full"
        />
      )}
    </div>
  )
}
