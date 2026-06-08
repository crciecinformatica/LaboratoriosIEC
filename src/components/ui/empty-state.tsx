type EmptyStateProps = {
  message: string
  colSpan: number
}

export function EmptyState({ message, colSpan }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-10 text-slate-400">
        {message}
      </td>
    </tr>
  )
}
