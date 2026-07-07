import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function Checkbox({ className = '', ...rest }: Props) {
  return <input type="checkbox" className={`check-input ${className}`} {...rest} />
}
