import type { TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className = '', ...rest }: Props) {
  return <textarea className={`textarea ${className}`} {...rest} />
}
