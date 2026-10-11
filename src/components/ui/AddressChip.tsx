import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { fmtAddress, explorerAddressUrl } from '../../utils/formatting'

interface AddressChipProps {
  address: string
  label?: string
  showExplorer?: boolean
  className?: string
}

export function AddressChip({ address, label, showExplorer = false, className = '' }: AddressChipProps) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(address)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      .catch(() => {/* clipboard unavailable */})
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {label && <span className="text-xs text-[--subtle]">{label}</span>}
      <code className="mono text-xs text-[--ink-2] bg-[--surface-muted] px-1.5 py-0.5 rounded-md">
        {fmtAddress(address)}
      </code>
      <button
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${address}`}
        className="rounded p-0.5 text-[--subtle] hover:text-[--ink] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
      >
        {copied ? <Check className="size-3 text-[--success]" /> : <Copy className="size-3" />}
      </button>
      {showExplorer && (
        <a
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
          aria-label="View on ArcScan"
          className="rounded p-0.5 text-[--subtle] hover:text-[--ink] transition-colors"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  )
}
