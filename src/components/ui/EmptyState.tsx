import type { ReactNode } from 'react'
import './EmptyState.css'

type Props = {
  icon?: ReactNode
  message: string
  compact?: boolean
}

export function EmptyState({ icon, message, compact }: Props) {
  return (
    <div className={compact ? 'empty-state compact' : 'empty-state'}>
      {icon}
      <span>{message}</span>
    </div>
  )
}
