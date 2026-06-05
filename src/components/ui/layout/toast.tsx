'use client'

import { useState, useCallback, createContext, useContext } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning'
type Toast = { id: number; type: ToastType; message: string }

type ToastContextValue = {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  let nextId = 0

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const value: ToastContextValue = {
    toast: add,
    success: (m) => add('success', m),
    error: (m) => add('error', m),
    warning: (m) => add('warning', m),
  }

  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle }
  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error:   'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  }
  const iconColors = { success: 'text-green-600', error: 'text-red-600', warning: 'text-amber-600' }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.type]
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-md text-sm pointer-events-auto',
                colors[t.type]
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', iconColors[t.type])} />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="flex-shrink-0 opacity-60 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
