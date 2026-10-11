import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import { APP_NAME } from '../utils/constants'
import { useChainGuard } from '../hooks/useChainGuard'
import { AddressChip } from './ui/AddressChip'
import { usePendingWithdrawal } from '../hooks/useAgreements'
import { fmtUsdc } from '../utils/formatting'

interface NavbarProps {
  onNavigate: (view: string) => void
  currentView: string
}

export function Navbar({ onNavigate, currentView }: NavbarProps) {
  const { address, isConnected } = useAccount()
  const { isWrongChain } = useChainGuard()
  const { amount: pending } = usePendingWithdrawal(address)

  const navItems = [
    { id: 'dashboard', label: 'Agreements' },
    { id: 'help', label: 'Help' },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-[--border] bg-[--surface] backdrop-blur-xl" style={{ WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus] rounded-lg"
        >
          <div className="flex size-7 items-center justify-center rounded-lg bg-[--accent]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white" opacity="0.9"/>
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" opacity="0.6"/>
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" opacity="0.6"/>
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white" opacity="0.3"/>
            </svg>
          </div>
          <span className="display text-sm font-semibold text-[--ink]">{APP_NAME}</span>
        </button>

        {/* Nav items */}
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]',
                currentView === item.id
                  ? 'bg-[--accent-light] text-[--accent]'
                  : 'text-[--muted] hover:text-[--ink] hover:bg-[--surface-muted]',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Wrong chain warning */}
          {isConnected && isWrongChain && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-[--warning-light] px-3 py-1 text-xs font-medium text-[--warning]">
              <AlertTriangle className="size-3" />
              Wrong network
            </div>
          )}

          {/* Pending withdrawal badge */}
          {isConnected && !isWrongChain && pending !== undefined && pending > 0n && (
            <button
              onClick={() => onNavigate('dashboard')}
              className="hidden sm:flex items-center gap-1.5 rounded-full bg-[--success-light] px-3 py-1 text-xs font-medium text-[--success] hover:opacity-80 transition-opacity"
            >
              {fmtUsdc(pending)} USDC to withdraw
            </button>
          )}

          {/* Address chip */}
          {isConnected && address && (
            <div className="hidden sm:block">
              <AddressChip address={address} />
            </div>
          )}

          {/* Connect button */}
          <ConnectKitButton.Custom>
            {({ isConnected: ckConnected, show }) => (
              <button
                onClick={show}
                className={[
                  'rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]',
                  ckConnected
                    ? 'bg-[--surface-muted] text-[--muted] border border-[--border] hover:bg-[--bg-alt]'
                    : 'bg-[--accent] text-white hover:bg-[--accent-hover]',
                ].join(' ')}
              >
                {ckConnected ? 'Wallet' : 'Connect Wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>

      {/* Mobile wrong chain bar */}
      {isConnected && isWrongChain && (
        <div className="sm:hidden flex items-center gap-2 bg-[--warning-light] px-4 py-2 text-xs font-medium text-[--warning] border-t border-[--border]">
          <AlertTriangle className="size-3 shrink-0" />
          You are connected to the wrong network. Switch to Arc Mainnet to continue.
        </div>
      )}
    </header>
  )
}
