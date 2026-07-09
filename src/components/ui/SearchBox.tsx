import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import './SearchBox.css'

type Props = {
  icon?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchBox({ icon = <Search size={16} />, value, onChange, placeholder, className = '' }: Props) {
  return (
    <label className={`search-box ${className}`}>
      {icon}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}
