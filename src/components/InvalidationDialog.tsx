import { CloudLightning, X } from 'lucide-react'
import type { LinkedDistribution } from '../types'

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
    <div className="modal-backdrop">
      <section className="invalidation-dialog" role="dialog" aria-modal="true" aria-label="CloudFront invalidation">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">CloudFront</p>
            <h2>{state.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-list">
          {state.links.map((link) => (
            <div className="dialog-distribution" key={link.id}>
              <label className="check-row">
                <input type="checkbox" checked={Boolean(state.selected[link.id])} onChange={(event) => onToggle(link.id, event.target.checked)} />
                <span>{link.id}</span>
              </label>
              <div className="dialog-distribution-meta">
                <span>{link.aliases[0] || link.domain_name}</span>
                <span>{link.status || (link.enabled ? 'Enabled' : 'Disabled')}</span>
              </div>
              {state.presets?.[link.id] ? (
                <div className="dialog-path-actions">
                  <button type="button" onClick={() => onPathChange(link.id, state.presets?.[link.id]?.object || link.invalidation_path)}>
                    Object
                  </button>
                  <button type="button" onClick={() => onPathChange(link.id, state.presets?.[link.id]?.folder || link.invalidation_path)}>
                    Folder *
                  </button>
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
          <button type="button" className="primary-action" onClick={onCreate} disabled={Boolean(busy) || selectedCount === 0}>
            <CloudLightning size={15} />
            Invalidate {selectedCount}
          </button>
        </div>
      </section>
    </div>
  )
}
