import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: string
  action?: ReactNode
}

export function PanelHeading({ eyebrow, title, action }: Props) {
  return (
    <div className="pane-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}
