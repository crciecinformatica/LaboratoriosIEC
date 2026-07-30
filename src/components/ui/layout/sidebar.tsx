'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Perfil } from '@prisma/client'
import {
  LayoutDashboard, CalendarDays, FlaskConical,
  Users, GraduationCap, BookOpen, Settings, ChevronRight,
  Columns3, CalendarRange, Webhook, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModeToggle } from './../../dashboard/mode-toggle'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  perfis: Perfil[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard',     href: '/dashboard',    icon: LayoutDashboard, perfis: ['APOIO_ACADEMICO','OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Reservas',      href: '/reservas',     icon: CalendarDays,    perfis: ['APOIO_ACADEMICO','OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Kanban',        href: '/kanban',       icon: Columns3,        perfis: ['OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Calendário',    href: '/calendario',   icon: CalendarRange,   perfis: ['APOIO_ACADEMICO','OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Laboratórios',  href: '/laboratorios', icon: FlaskConical,    perfis: ['APOIO_ACADEMICO','OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Professores',   href: '/professores',  icon: GraduationCap,   perfis: ['OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Turmas',        href: '/turmas',       icon: BookOpen,        perfis: ['OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Usuários',      href: '/usuarios',     icon: Users,           perfis: ['ADMINISTRADOR'] },
  { label: 'Relatórios',    href: '/relatorios',   icon: BarChart3,       perfis: ['OPERADOR_TI','ADMINISTRADOR'] },
  { label: 'Integrações',   href: '/integracoes',  icon: Webhook,         perfis: ['OPERADOR_TI','ADMINISTRADOR'] },
]

export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname()
  const visibleItems = navItems.filter((item) => item.perfis.includes(perfil))

  return (
    <aside className="w-[240px] flex-shrink-0 bg-background border-r border-border flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <FlaskConical className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground leading-none">IEC</p>
          <p className="text-sm font-semibold text-foreground leading-snug truncate">
            Agendamento de Labs
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition group',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground')} />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 text-primary/60" />}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-3 border-t border-border flex items-center justify-evenly gap-4">
        {['ADMINISTRADOR', 'OPERADOR_TI'].includes(perfil) && (
          <Link
            href="/configuracoes"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition"
          >
            <Settings className="w-4 h-4" />
            Configurações
          </Link>
        )}
        <ModeToggle />
      </div>
    </aside>
  )
}