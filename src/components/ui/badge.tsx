import React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'

  const variants = {
    default:   'bg-muted text-muted-foreground',
    secondary: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
    success:   'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warning:   'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    error:     'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    info:      'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  }

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className || ''}`} {...props}>
      {children}
    </div>
  )
}