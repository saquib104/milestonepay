import { AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useChainGuard } from '../hooks/useChainGuard'
import { Button } from './ui/Button'

/** Full-page overlay when wallet is on the wrong chain */
export function ChainGuardBanner() {
  const { isConnected } = useAccount()
  const { isWrongChain, isSwitching, switchToArc, currentChainId } = useChainGuard()

  if (!isConnected || !isWrongChain) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[--bg]/80 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-md rounded-3xl border border-[--border] bg-[--surface-strong] p-8 text-center"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        role="alertdialog"
        aria-labelledby="chain-dialog-title"
        aria-describedby="chain-dialog-desc"
      >
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[--warning-light]">
            <AlertTriangle className="size-7 text-[--warning]" />
          </div>
        </div>

        <h2 id="chain-dialog-title" className="display text-xl font-semibold text-[--ink] mb-2">
          Wrong network
        </h2>

        <p id="chain-dialog-desc" className="text-sm text-[--muted] mb-2 text-pretty">
          Your wallet is connected to chain ID <span className="mono font-medium text-[--ink-2]">{currentChainId}</span>.
        </p>
        <p className="text-sm text-[--muted] mb-6 text-pretty">
          MilestonePay runs exclusively on <strong className="text-[--ink]">Arc Mainnet (chain ID 5042)</strong>.
          Switching networks will not sign or submit any transaction — it only tells your wallet which chain to use.
        </p>

        <Button
          size="lg"
          loading={isSwitching}
          onClick={switchToArc}
          className="w-full"
        >
          <ArrowRightLeft className="size-4" />
          Switch to Arc Mainnet
        </Button>

        <p className="mt-4 text-xs text-[--subtle]">
          Your wallet will ask you to confirm the network switch.
        </p>
      </div>
    </div>
  )
}
