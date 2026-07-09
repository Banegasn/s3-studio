import type { TextareaHTMLAttributes } from 'react'
import './Textarea.css'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className = '', ...rest }: Props) {
  return <textarea className={`textarea ${className}`} {...rest} />
}
