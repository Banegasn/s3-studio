import { useCallback, useState } from 'react'
import type { Toast, ToastKind } from '../types'

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.round(Math.random() * 1000)
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 6000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return { toasts, pushToast, dismissToast }
}
