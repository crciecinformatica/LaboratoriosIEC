'use client'

import { signOut } from 'next-auth/react'
import { LogOut, ChevronDown } from 'lucide-react'
import { Perfil } from '@prisma/client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const perfilLabel: Record<Perfil, string> = {
  APOIO_ACADEMICO: 'Apoio Acadêmico',
  OPERADOR_TI:     'Operador TI',
  ADMINISTRADOR:   'Administrador',
}

type Props = {
  user: { name?: string | null; email?: string | null; perfil: Perfil }
}

export function Header({ user }: Props) {
  const [open, setOpen] = useState(false)
  const initials = user.name
    ? user.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '??'

  return (
    <header className="h-14 bg-card border-b border-border px-6 flex items-center justify-end">
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted transition text-sm"
        >
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <p className="font-medium text-foreground leading-tight">{user.name}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">{perfilLabel[user.perfil]}</p>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition', open && 'rotate-180')} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-48 bg-popover rounded-xl border border-border shadow-lg z-20 py-1">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}