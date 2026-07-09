import type { ReactNode } from 'react'
import './Modal.css'

type Props = {
  children: ReactNode
  onClose?: () => void
}

export function Modal({ children, onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  )
}
