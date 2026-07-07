import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  compact?: boolean
  variant?: 'default' | 'primary'
  children: ReactNode
}

export function IconButton({ active, compact, variant = 'default', className = '', children, ...rest }: Props) {
  const classes = [
    'icon-btn',
    compact ? 'compact' : '',
    active ? 'active' : '',
    variant === 'primary' ? 'primary' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
