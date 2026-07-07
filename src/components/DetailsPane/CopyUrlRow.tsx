import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type Props = {
  label?: string
  value: string
}

export function CopyUrlRow({ label, value }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyValue() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="copy-url-row">
      {label && <span>{label}</span>}
      <code>{value}</code>
      <button type="button" onClick={copyValue} title={`Copy ${label || 'URL'}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}
