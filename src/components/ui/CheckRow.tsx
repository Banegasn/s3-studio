import type { ReactNode } from 'react'
import './CheckRow.css'

type Props = {
  children: ReactNode
}

export function CheckRow({ children }: Props) {
  return <label className="check-row">{children}</label>
}
