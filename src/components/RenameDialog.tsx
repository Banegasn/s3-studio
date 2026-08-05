import { useLayoutEffect, useState, type FormEvent } from 'react'
import { Pencil, X } from 'lucide-react'
import type { S3Entry } from '../types'
import { Button, IconButton, Input, Modal } from './ui'
import './RenameDialog.css'

export type RenameDialogState = {
  entry: S3Entry
}

type Props = {
  state?: RenameDialogState
  busy?: string
  onClose: () => void
  onRename: (name: string) => void
}

export function RenameDialog({ state, busy, onClose, onRename }: Props) {
  const [name, setName] = useState('')

  useLayoutEffect(() => {
    setName(state?.entry.name || '')
  }, [state])

  if (!state) return null
  const nextName = name.trim()
  const invalidReason = !nextName
    ? 'Enter a name.'
    : nextName.includes('/')
      ? 'Names cannot contain a slash.'
      : nextName === state.entry.name
        ? 'Enter a different name.'
        : undefined

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invalidReason && !busy) onRename(nextName)
  }

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <form className="rename-dialog-form" onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{state.entry.kind === 'folder' ? 'Folder' : 'Object'}</p>
            <h2>Rename {state.entry.name}</h2>
          </div>
          <IconButton type="button" onClick={onClose} title="Close" disabled={Boolean(busy)}>
            <X size={18} />
          </IconButton>
        </div>

        <label className="rename-field">
          <span>New name</span>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) onClose()
            }}
            disabled={Boolean(busy)}
            aria-describedby="rename-help"
          />
          <small id="rename-help">{invalidReason || `The ${state.entry.kind} stays in its current folder.`}</small>
        </label>

        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </button>
          <Button type="submit" variant="primary" disabled={Boolean(busy) || Boolean(invalidReason)}>
            <Pencil size={15} />
            Rename
          </Button>
        </div>
      </form>
    </Modal>
  )
}
