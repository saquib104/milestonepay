import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react'
import { APP_NAME, CONTRACT_ADDRESS, ARC_EXPLORER_BASE } from '../utils/constants'

interface FaqItem {
  q: string
  a: string | JSX.Element
}

const FAQS: FaqItem[] = [
  {
    q: 'Who holds the escrowed USDC?',
    a: 'The smart contract holds it. No person, company, or platform controls the funds. The contract code determines the only conditions under which funds move.',
  },
  {
    q: 'What is a deliverable hash?',
    a: 'When a provider submits work, they enter a reference — a URL, IPFS CID, or text description. The app computes a SHA-256 hash of that reference and stores it onchain. Neither party can change it after submission. Anyone can verify the original reference by re-hashing it and comparing to the onchain value.',
  },
  {
    q: 'What is a terms hash?',
    a: 'When you create an agreement, you paste your full agreement text. The app hashes it (SHA-256) and stores the hash onchain. The hash is a permanent commitment. Keep the original document — without it, the hash alone does not reconstruct the agreement terms.',
  },
  {
    q: 'Who is the resolver, and how do I choose one?',
    a: 'The resolver is any Ethereum address you and the other party agree on before creating the agreement. They can be a trusted colleague, a professional arbitration service, a multisig wallet, or any neutral party. The contract cannot verify their neutrality — you must trust this address yourself. The resolver can direct disputed funds to either party.',
  },
  {
    q: 'What happens if the resolver never acts on a dispute?',
    a: 'The agreement has a dispute timeout (1–90 days, set at creation). After that deadline passes, either party can call "Claim after timeout." The outcome is the dispute default you set: either release to provider or refund to client. This prevents funds from being permanently locked by an inactive resolver.',
  },
  {
    q: 'Can the client request a refund at any time?',
    a: 'A refund can only be claimed if the milestone is in Funded status and the submission deadline has passed. Once a provider submits a deliverable, the client cannot take a unilateral refund — they must either approve, request changes, or raise a dispute.',
  },
  {
    q: 'What is the revision limit?',
    a: 'Each milestone has a maximum number of revision rounds (1–5, set at creation). Once the client requests that many changes, the next review action automatically escalates to dispute instead of allowing another revision round.',
  },
  {
    q: 'How do I withdraw funds after a payment is released?',
    a: 'Released funds go to your pending withdrawal balance in the contract. You then call "Withdraw" once to pull all of them to your wallet in a single transaction. This pull-payment pattern prevents reentrancy attacks.',
  },
  {
    q: 'Can I create an agreement without a connected wallet?',
    a: 'No. All agreement creation and milestone actions require a connected Arc Mainnet wallet because they submit transactions to the blockchain.',
  },
  {
    q: 'Has this contract been audited?',
    a: (
      <span>
        <strong>No.</strong> {APP_NAME} has not been independently audited. Use it only with amounts you can afford to lose. A professional audit is required before using it in production. See the contract source for the full warning header.
      </span>
    ),
  },
  {
    q: 'Where can I see the contract on Arc?',
    a: (
      <a
        href={`${ARC_EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[--accent] hover:underline"
      >
        View on ArcScan <ExternalLink className="size-3.5" />
      </a>
    ),
  },
]

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[--border] last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left text-sm font-medium text-[--ink] hover:text-[--accent] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus] rounded-sm"
        aria-expanded={open}
      >
        {item.q}
        {open ? <ChevronUp className="size-4 shrink-0 text-[--subtle]" /> : <ChevronDown className="size-4 shrink-0 text-[--subtle]" />}
      </button>
      {open && (
        <div className="pb-4 pr-6">
          <p className="text-sm text-[--muted] leading-relaxed text-pretty">{item.a}</p>
        </div>
      )}
    </div>
  )
}

export function Help() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="display text-2xl font-semibold text-[--ink] mb-2">Help &amp; FAQ</h1>
      <p className="text-sm text-[--muted] mb-6">Common questions about how {APP_NAME} works.</p>

      {/* Audit warning */}
      <div className="mb-8 rounded-2xl border border-[--warning-light] bg-[--warning-light] flex items-start gap-3 px-5 py-4">
        <AlertTriangle className="size-4 text-[--warning] shrink-0 mt-0.5" />
        <p className="text-xs text-[--warning] leading-relaxed">
          <strong>{APP_NAME} is experimental software.</strong> The smart contract has not been independently audited.
          Do not use it to hold funds you cannot afford to lose.
        </p>
      </div>

      {/* FAQ list */}
      <div className="rounded-2xl border border-[--border] bg-[--surface-strong] px-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {FAQS.map(item => (
          <FaqRow key={item.q} item={item} />
        ))}
      </div>

      {/* Links */}
      <div className="mt-8 flex flex-col gap-2 text-sm">
        <a
          href="https://docs.arc.io"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[--accent] hover:underline"
        >
          Arc documentation <ExternalLink className="size-3.5" />
        </a>
        <a
          href="https://explorer.arc.io"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[--accent] hover:underline"
        >
          ArcScan block explorer <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  )
}
