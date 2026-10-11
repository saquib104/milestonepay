/**
 * MilestonePay — production app
 * Target: Arc Mainnet (chain ID 5042)
 * Contract: NOT YET DEPLOYED — set VITE_CONTRACT_ADDRESS in .env after deployment.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'

import { Navbar } from './components/Navbar'
import { Landing } from './components/Landing'
import { Dashboard } from './components/Dashboard'
import { CreateAgreement } from './components/CreateAgreement'
import { AgreementDetail } from './components/AgreementDetail'
import { Help } from './components/Help'
import { ChainGuardBanner } from './components/ChainGuardBanner'

type View =
  | { name: 'landing' }
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'detail'; agreementId: bigint }
  | { name: 'help' }

export default function App() {
  const { isConnected } = useAccount()
  const [view, setView] = useState<View>({ name: 'landing' })

  function navigate(name: string, agreementId?: bigint) {
    if (name === 'landing')    setView({ name: 'landing' })
    else if (name === 'dashboard') setView({ name: 'dashboard' })
    else if (name === 'create')    setView({ name: 'create' })
    else if (name === 'help')      setView({ name: 'help' })
    else if (name === 'detail' && agreementId !== undefined) setView({ name: 'detail', agreementId })
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Wrong chain overlay */}
      <ChainGuardBanner />

      {/* Navbar on all views except landing */}
      {view.name !== 'landing' && (
        <Navbar
          onNavigate={navigate}
          currentView={view.name}
        />
      )}

      {/* Views */}
      {view.name === 'landing' && (
        <Landing
          onGetStarted={() => {
            if (isConnected) {
              setView({ name: 'dashboard' })
            } else {
              // ConnectKit will open on next click
              setView({ name: 'dashboard' })
            }
          }}
        />
      )}

      {view.name === 'dashboard' && (
        <Dashboard
          onCreateAgreement={() => setView({ name: 'create' })}
          onOpenAgreement={id => setView({ name: 'detail', agreementId: id })}
        />
      )}

      {view.name === 'create' && (
        <CreateAgreement
          onBack={() => setView({ name: 'dashboard' })}
          onCreated={id => setView({ name: 'detail', agreementId: id })}
        />
      )}

      {view.name === 'detail' && (
        <AgreementDetail
          agreementId={view.agreementId}
          onBack={() => setView({ name: 'dashboard' })}
        />
      )}

      {view.name === 'help' && (
        <Help />
      )}

      {/* Navbar on landing shows at bottom */}
      {view.name === 'landing' && (
        <nav className="fixed top-4 right-4 z-30 flex items-center gap-2">
          <button
            onClick={() => setView({ name: 'help' })}
            className="rounded-xl bg-[--surface-strong] border border-[--border] px-3 py-1.5 text-xs font-medium text-[--muted] hover:text-[--ink] transition-colors"
            style={{ backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-sm)' }}
          >
            Help
          </button>
          <ConnectKitButton.Custom>
            {({ isConnected: ckConn, show, truncatedAddress }) => (
              <button
                onClick={show}
                className={[
                  'rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                  ckConn
                    ? 'bg-[--surface-strong] border border-[--border] text-[--muted] hover:text-[--ink]'
                    : 'bg-[--accent] text-white hover:bg-[--accent-hover]',
                ].join(' ')}
                style={{ backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-sm)' }}
              >
                {ckConn ? truncatedAddress : 'Connect Wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </nav>
      )}
    </div>
  )
}
