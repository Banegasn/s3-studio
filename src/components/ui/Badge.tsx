import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  variant?: 'count' | 'status'
  status?: 'success' | 'warning' | 'info'
}

export function Badge({ children, variant = 'count', status }: Props) {
  if (variant === 'count') {
    return <span className="badge badge-count">{children}</span>
  }
  return <span className={`badge badge-status ${status || ''}`}>{children}</span>
}
