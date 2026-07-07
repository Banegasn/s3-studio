import type { ReactNode } from 'react'

type Props = {
  icon: ReactNode
  title: string
  count?: number
  children?: ReactNode
}

export function SectionHeading({ icon, title, count, children }: Props) {
  return (
    <div className="section-heading">
      {icon}
      <h3>{title}</h3>
      {count !== undefined ? <span className="badge badge-status info">{count}</span> : null}
      {children}
    </div>
  )
}
