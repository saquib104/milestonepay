import { type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[--ink]">
        {label}
        {required && <span className="ml-1 text-[--danger]" aria-hidden="true">*</span>}
      </label>
      {hint && <p className="text-xs text-[--subtle]">{hint}</p>}
      {children}
      {error && <p className="text-xs text-[--danger] font-medium" role="alert">{error}</p>}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { error?: boolean }

export function Input({ error, className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border px-3.5 py-2.5 text-sm bg-[--surface-strong] text-[--ink]',
        'placeholder:text-[--subtle]',
        'transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-[--focus] focus:border-transparent',
        error
          ? 'border-[--danger] focus:ring-[--danger]'
          : 'border-[--border] hover:border-[--border-strong]',
        className,
      ].join(' ')}
    />
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }

export function Textarea({ error, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={[
        'w-full rounded-xl border px-3.5 py-2.5 text-sm bg-[--surface-strong] text-[--ink]',
        'placeholder:text-[--subtle] resize-none',
        'transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-[--focus] focus:border-transparent',
        error
          ? 'border-[--danger] focus:ring-[--danger]'
          : 'border-[--border] hover:border-[--border-strong]',
        className,
      ].join(' ')}
    />
  )
}

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  children: ReactNode
}

export function Select({ error, className = '', children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={[
        'w-full rounded-xl border px-3.5 py-2.5 text-sm bg-[--surface-strong] text-[--ink]',
        'transition-colors appearance-none',
        'focus:outline-none focus:ring-2 focus:ring-[--focus] focus:border-transparent',
        error
          ? 'border-[--danger]'
          : 'border-[--border] hover:border-[--border-strong]',
        className,
      ].join(' ')}
    >
      {children}
    </select>
  )
}
