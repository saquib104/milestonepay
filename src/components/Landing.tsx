import { ArrowRight, Shield, Clock, FileCheck, Users } from 'lucide-react'
import { Button } from './ui/Button'
import { APP_NAME } from '../utils/constants'

interface LandingProps {
  onGetStarted: () => void
}

const steps = [
  {
    n: '01',
    title: 'Agree on milestones',
    body: 'Client and provider settle scope, deliverables, and payment amounts offchain. Both parties keep the agreement document — only a cryptographic hash is anchored onchain.',
  },
  {
    n: '02',
    title: 'Fund each milestone',
    body: 'The client deposits USDC into a smart contract on Arc Mainnet. Funds are held in escrow — neither party can access them unilaterally.',
  },
  {
    n: '03',
    title: 'Deliver and review',
    body: 'The provider submits a completion hash when the work is done. The client approves, requests changes, or escalates to a dispute — up to a configurable number of revision rounds.',
  },
  {
    n: '04',
    title: 'Payment released',
    body: 'On approval, USDC is credited to the provider\'s withdrawal balance. All parties withdraw directly to their own wallets — the app never holds funds.',
  },
]

const features = [
  {
    icon: Shield,
    title: 'Non-custodial escrow',
    body: 'Funds live in an auditable smart contract. No third party can seize or redirect them. You keep your own wallet keys throughout.',
  },
  {
    icon: Clock,
    title: 'Expiry and dispute safeguards',
    body: 'If a provider misses a deadline, the client can reclaim. If a dispute arises, a pre-agreed neutral resolver decides — within a bounded time window.',
  },
  {
    icon: FileCheck,
    title: 'Onchain commitments',
    body: 'Deliverable references and agreement terms are hashed and recorded permanently on Arc. Either party can verify the original commitment at any time.',
  },
  {
    icon: Users,
    title: 'Two-party, no middleman',
    body: 'Every agreement is between one client and one provider. No platform accounts, no KYC, no commission taken from payments in the smart contract.',
  },
]

export function Landing({ onGetStarted }: LandingProps) {
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 sm:px-6 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[--border] bg-[--surface-strong] px-4 py-1.5 text-xs font-medium text-[--muted]">
          <span className="size-1.5 rounded-full bg-[--accent] inline-block" />
          Arc Mainnet · USDC escrow · Not yet audited
        </div>

        <h1 className="display text-4xl font-bold leading-tight tracking-tight text-[--ink] sm:text-5xl text-balance mb-5">
          Fixed-price milestone escrow<br className="hidden sm:block" /> for professional work.
        </h1>

        <p className="text-lg text-[--muted] max-w-2xl mx-auto text-pretty mb-8">
          {APP_NAME} holds client payments in USDC on Arc until each milestone is accepted.
          No intermediary holds your money. No wire transfer delays. No disputes without recourse.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" onClick={onGetStarted} className="w-full sm:w-auto">
            Get started
            <ArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="w-full sm:w-auto">
            How it works
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <h2 className="display text-2xl font-semibold text-[--ink] mb-8 text-center">How it works</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {steps.map(s => (
            <div key={s.n} className="rounded-2xl border border-[--border] bg-[--surface-strong] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="mono text-xs font-semibold text-[--accent] mb-3">{s.n}</div>
              <h3 className="display text-base font-semibold text-[--ink] mb-2">{s.title}</h3>
              <p className="text-sm text-[--muted] text-pretty leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[--border] bg-[--surface-muted]">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="display text-2xl font-semibold text-[--ink] mb-8 text-center">Built for trust</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {features.map(f => (
              <div key={f.title} className="flex gap-4">
                <div className="shrink-0 flex size-10 items-center justify-center rounded-xl bg-[--accent-light]">
                  <f.icon className="size-5 text-[--accent]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[--ink] mb-1">{f.title}</h3>
                  <p className="text-sm text-[--muted] text-pretty leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-[--border]">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="rounded-xl border border-[--warning-light] bg-[--warning-light] px-5 py-4">
            <p className="text-xs text-[--warning] leading-relaxed font-medium">
              <strong>Important:</strong> {APP_NAME} is experimental software. The smart contract has not been independently audited.
              Do not use it to hold funds you cannot afford to lose. This product is not a regulated financial service, does not provide legal advice, and does not guarantee any particular dispute outcome.
              The resolver is a human or multisig agreed upon by both parties — not an automated or neutral arbitrator.
            </p>
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="border-t border-[--border]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 text-center">
          <h2 className="display text-2xl font-semibold text-[--ink] mb-3">Ready to create your first agreement?</h2>
          <p className="text-sm text-[--muted] mb-6">Connect an Arc Mainnet wallet to get started. Agreements are created onchain.</p>
          <Button size="lg" onClick={onGetStarted}>
            Connect wallet and start
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  )
}
