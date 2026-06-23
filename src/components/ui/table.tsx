import React from 'react'

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode
}

export function Table({ className, children, ...props }: TableProps) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={`w-full text-sm border-collapse ${className || ''}`} {...props}>
        {children}
      </table>
    </div>
  )
}

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode
}

export function TableHeader({ className, children, ...props }: TableHeaderProps) {
  return (
    <thead className={`bg-muted border-b border-border ${className || ''}`} {...props}>
      {children}
    </thead>
  )
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode
}

export function TableBody({ className, children, ...props }: TableBodyProps) {
  return (
    <tbody className={`${className || ''}`} {...props}>
      {children}
    </tbody>
  )
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode
}

export function TableRow({ className, children, ...props }: TableRowProps) {
  return (
    <tr className={`border-b border-border hover:bg-accent/50 ${className || ''}`} {...props}>
      {children}
    </tr>
  )
}

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode
}

export function TableHead({ className, children, ...props }: TableHeadProps) {
  return (
    <th className={`text-left px-4 py-3 font-semibold text-muted-foreground ${className || ''}`} {...props}>
      {children}
    </th>
  )
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode
}

export function TableCell({ className, children, ...props }: TableCellProps) {
  return (
    <td className={`px-4 py-3 text-foreground ${className || ''}`} {...props}>
      {children}
    </td>
  )
}