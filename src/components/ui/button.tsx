import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all'

  const variants = {
    primary:   'bg-primary text-primary-foreground hover:brightness-90 disabled:opacity-50',
    secondary: 'bg-card text-foreground border border-border hover:bg-muted disabled:opacity-50',
    danger:    'bg-destructive text-white hover:brightness-90 disabled:opacity-50',
    ghost:     'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50',
    outline:   'bg-transparent border border-border text-foreground hover:bg-muted disabled:opacity-50',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
    icon: 'p-2 w-8 h-8',
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className || ''} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}