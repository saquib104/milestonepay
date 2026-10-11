import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[--surface-muted] border border-[--border]">
        <Icon className="size-6 text-[--subtle]" />
      </div>
      <h3 className="display text-base font-semibold text-[--ink] mb-1">{title}</h3>
      <p className="text-sm text-[--muted] max-w-xs text-pretty">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-3 rounded-full bg-[--surface-muted] ${i === 0 ? 'w-3/4' : 'w-1/2'}`} />
      ))}
    </div>
  )
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-5'
  return (
    <svg className={`${s} animate-spin text-[--accent]`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
