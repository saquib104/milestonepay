import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary:   'bg-[--accent] text-white hover:bg-[--accent-hover] disabled:opacity-40',
  secondary: 'bg-[--surface-muted] text-[--ink] hover:bg-[--bg-alt] border border-[--border]',
  ghost:     'text-[--muted] hover:text-[--ink] hover:bg-[--surface-muted]',
  danger:    'bg-[--danger-light] text-[--danger] hover:bg-red-100 border border-red-200',
  outline:   'border border-[--border-strong] text-[--ink] hover:bg-[--surface-muted]',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3.5 text-sm rounded-2xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-all duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus] focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className,
      ].join(' ')}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  )
}
