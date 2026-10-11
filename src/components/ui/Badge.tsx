import { type ReactNode } from 'react'
import { MILESTONE_STATUS_COLOR, MILESTONE_STATUS_LABEL, type MilestoneStatusValue } from '../../utils/constants'

interface BadgeProps {
  status: MilestoneStatusValue
}

export function MilestoneBadge({ status }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${MILESTONE_STATUS_COLOR[status]}`}
    >
      {MILESTONE_STATUS_LABEL[status]}
    </span>
  )
}

interface PillProps {
  children: ReactNode
  color?: 'neutral' | 'teal' | 'amber' | 'green' | 'red'
}

const pillColors: Record<NonNullable<PillProps['color']>, string> = {
  neutral: 'bg-[--surface-muted] text-[--muted]',
  teal:    'bg-[--accent-light] text-[--accent]',
  amber:   'bg-[--warm-light] text-[--warm]',
  green:   'bg-[--success-light] text-[--success]',
  red:     'bg-[--danger-light] text-[--danger]',
}

export function Pill({ children, color = 'neutral' }: PillProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillColors[color]}`}>
      {children}
    </span>
  )
}
