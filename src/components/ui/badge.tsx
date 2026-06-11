import React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
  
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    secondary: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-cyan-100 text-cyan-800',
  }

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className || ''}`} {...props}>
      {children}
    </div>
  )
}
