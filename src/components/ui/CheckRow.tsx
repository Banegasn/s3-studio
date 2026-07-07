import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export function CheckRow({ children }: Props) {
  return <label className="check-row">{children}</label>
}
