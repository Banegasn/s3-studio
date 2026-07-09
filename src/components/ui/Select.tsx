import type { SelectHTMLAttributes } from 'react'
import './Select.css'

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`select ${className}`} {...rest} />
}
