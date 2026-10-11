import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, className = '', hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={[
        'rounded-2xl border border-[--border] bg-[--surface-strong] p-5',
        'shadow-[var(--shadow-sm)]',
        hover ? 'transition-all cursor-pointer hover:shadow-[var(--shadow-md)] hover:border-[--border-strong]' : '',
        onClick ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

interface SectionProps {
  label: string
  children: ReactNode
  className?: string
}

export function Section({ label, children, className = '' }: SectionProps) {
  return (
    <div className={className}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[--subtle]">{label}</h3>
      {children}
    </div>
  )
}

interface RowProps {
  label: string
  value: ReactNode
  className?: string
}

export function DataRow({ label, value, className = '' }: RowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 border-b border-[--border] last:border-0 ${className}`}>
      <span className="text-sm text-[--muted]">{label}</span>
      <span className="text-sm font-medium text-[--ink] text-right max-w-[60%]">{value}</span>
    </div>
  )
}
