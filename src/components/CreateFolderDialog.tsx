import { useLayoutEffect, useState, type FormEvent } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { Button, IconButton, Input, Modal } from './ui'
import './RenameDialog.css'

type Props = {
  open: boolean
  prefix: string
  busy?: string
  onClose: () => void
  onCreate: (name: string) => void
}

export function CreateFolderDialog({ open, prefix, busy, onClose, onCreate }: Props) {
  const [name, setName] = useState('')

  useLayoutEffect(() => {
    if (open) setName('')
  }, [open])

  if (!open) return null
  const nextName = name.trim()
  const invalidReason = !nextName
    ? 'Enter a folder name.'
    : nextName.includes('/')
      ? 'Folder names cannot contain a slash.'
      : undefined

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invalidReason && !busy) onCreate(nextName)
  }

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <form className="rename-dialog-form" onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Folder</p>
            <h2>Create new folder</h2>
          </div>
          <IconButton type="button" onClick={onClose} title="Close" disabled={Boolean(busy)}>
            <X size={18} />
          </IconButton>
        </div>

        <label className="rename-field">
          <span>Folder name</span>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) onClose()
            }}
            disabled={Boolean(busy)}
            aria-describedby="create-folder-help"
          />
          <small id="create-folder-help">
            {invalidReason || `The folder will be created in /${prefix}`}
          </small>
        </label>

        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </button>
          <Button type="submit" variant="primary" disabled={Boolean(busy) || Boolean(invalidReason)}>
            <FolderPlus size={15} />
            Create folder
          </Button>
        </div>
      </form>
    </Modal>
  )
}
