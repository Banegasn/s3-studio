import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  children: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }: Props) {
  const classes = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
