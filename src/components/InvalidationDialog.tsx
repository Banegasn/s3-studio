import { CloudLightning, X } from 'lucide-react'
import type { LinkedDistribution } from '../types'
import { Modal, IconButton, Button, CheckRow } from './ui'
import './InvalidationDialog.css'

export type InvalidationDialogState = {
  title: string
  links: LinkedDistribution[]
  selected: Record<string, boolean>
  paths: Record<string, string>
  presets?: Record<string, { object: string; folder: string }>
}

type Props = {
  state?: InvalidationDialogState
  busy?: string
  onClose: () => void
  onToggle: (distributionId: string, selected: boolean) => void
  onPathChange: (distributionId: string, value: string) => void
  onCreate: () => void
}

export function InvalidationDialog({ state, busy, onClose, onToggle, onPathChange, onCreate }: Props) {
  if (!state) return null
  const selectedCount = state.links.filter((link) => state.selected[link.id]).length

  return (
    <Modal onClose={onClose}>
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">CloudFront</p>
          <h2>{state.title}</h2>
        </div>
        <IconButton onClick={onClose} title="Close">
          <X size={18} />
        </IconButton>
      </div>

      <div className="dialog-list">
        {state.links.map((link) => (
          <div className="dialog-distribution" key={link.id}>
            <CheckRow>
              <input type="checkbox" checked={Boolean(state.selected[link.id])} onChange={(event) => onToggle(link.id, event.target.checked)} />
              <span>{link.id}</span>
            </CheckRow>
            <div className="dialog-distribution-meta">
              <span>{link.aliases[0] || link.domain_name}</span>
              <span>{link.status || (link.enabled ? 'Enabled' : 'Disabled')}</span>
            </div>
            {state.presets?.[link.id] ? (
              <div className="dialog-path-actions">
                <Button size="sm" onClick={() => onPathChange(link.id, state.presets?.[link.id]?.object || link.invalidation_path)}>
                  Object
                </Button>
                <Button size="sm" onClick={() => onPathChange(link.id, state.presets?.[link.id]?.folder || link.invalidation_path)}>
                  Folder *
                </Button>
              </div>
            ) : null}
            <label className="path-editor">
              <span>Invalidation paths</span>
              <textarea value={state.paths[link.id] || link.invalidation_path} onChange={(event) => onPathChange(link.id, event.target.value)} />
            </label>
          </div>
        ))}
      </div>

      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <Button variant="primary" onClick={onCreate} disabled={Boolean(busy) || selectedCount === 0}>
          <CloudLightning size={15} />
          Invalidate {selectedCount}
        </Button>
      </div>
    </Modal>
  )
}
