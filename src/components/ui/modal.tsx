'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

export function Modal({ open, onClose, title, children, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Dialog */}
      <div
        className={cn(
          'relative w-full bg-card rounded-2xl shadow-xl border border-border flex flex-col max-h-[90vh]',
          sizeMap[size]
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 id="modal-title" className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="btn-ghost btn-sm p-1.5 rounded-lg"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}