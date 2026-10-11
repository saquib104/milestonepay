import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

const springs = {
  sheet: { type: 'spring' as const, damping: 30, stiffness: 400 },
}

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export function Sheet({ open, onClose, title, children, maxWidth = 'max-w-lg' }: SheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          {/* Panel */}
          <motion.section
            className={`relative w-full ${maxWidth} max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl`}
            style={{
              background: 'rgba(252,251,248,0.97)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid rgba(28,43,42,0.10)',
            }}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[--border]">
              <h2 className="display text-base font-semibold text-[--ink]">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-xl p-1.5 text-[--subtle] hover:text-[--ink] hover:bg-[--surface-muted] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--focus]"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* Content */}
            <div className="px-6 py-5">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
