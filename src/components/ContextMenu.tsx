import { ClipboardPaste, CloudLightning, Copy, Download, ExternalLink, FolderOpen, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { S3Entry } from '../types'
import './ContextMenu.css'

export type ContextMenuState = {
  x: number
  y: number
  entry?: S3Entry
}

type Props = {
  state?: ContextMenuState
  selectedCount: number
  canPaste: boolean
  onClose: () => void
  onOpen: (entry: S3Entry) => void
  onDownload: (entry: S3Entry) => void
  onCopy: (entry: S3Entry) => void
  onPasteInto: (entry: S3Entry) => void
  onPasteHere: () => void
  onUploadFiles: () => void
  onUploadFolders: () => void
  onRefresh: () => void
  onRename: (entry: S3Entry) => void
  onDelete: (entry: S3Entry) => void
  onInvalidate: (entry: S3Entry) => void
  onInspect: () => void
}

export function ContextMenu({ state, selectedCount, canPaste, onClose, onOpen, onDownload, onCopy, onPasteInto, onPasteHere, onUploadFiles, onUploadFolders, onRefresh, onRename, onDelete, onInvalidate, onInspect }: Props) {
  if (!state) return null
  const { entry } = state
  const isFolder = entry?.kind === 'folder'
  const count = Math.max(1, selectedCount)
  const hasMultiple = count > 1
  const left = Math.min(state.x, window.innerWidth - 236)
  const top = Math.min(state.y, window.innerHeight - (entry ? 360 : 260))

  function run(action: () => void) {
    onClose()
    action()
  }

  return (
    <div className="context-menu-backdrop" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="context-menu"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
        onMouseDown={(event) => event.stopPropagation()}
        role="menu"
      >
        {entry ? (
          <>
            {isFolder ? (
              <button type="button" onClick={() => run(() => onOpen(entry))} role="menuitem">
                <FolderOpen size={15} />
                Open folder
              </button>
            ) : null}
            <button type="button" onClick={() => run(() => onDownload(entry))} role="menuitem">
              <Download size={15} />
              {hasMultiple ? `Download ${count} items` : isFolder ? 'Download folder' : 'Download'}
            </button>
            <button type="button" onClick={() => run(() => onCopy(entry))} role="menuitem">
              <Copy size={15} />
              {hasMultiple ? `Copy ${count} items` : isFolder ? 'Copy folder' : 'Copy'}
            </button>
            {isFolder ? (
              <button type="button" onClick={() => run(() => onPasteInto(entry))} role="menuitem" disabled={!canPaste}>
                <ClipboardPaste size={15} />
                Paste into folder
              </button>
            ) : null}
            <button type="button" onClick={() => run(() => onRename(entry))} role="menuitem" disabled={hasMultiple}>
              <Pencil size={15} />
              Rename
            </button>
            <button type="button" onClick={() => run(() => onInvalidate(entry))} role="menuitem">
              <CloudLightning size={15} />
              {hasMultiple ? `Invalidate ${count} items` : isFolder ? 'Invalidate folder' : 'Invalidate'}
            </button>
            <button type="button" className="danger" onClick={() => run(() => onDelete(entry))} role="menuitem">
              <Trash2 size={15} />
              {hasMultiple ? `Delete ${count} items` : isFolder ? 'Delete folder' : 'Delete'}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => run(onPasteHere)} role="menuitem" disabled={!canPaste}>
              <ClipboardPaste size={15} />
              Paste here
            </button>
            <div className="context-menu-separator" />
            <button type="button" onClick={() => run(onUploadFiles)} role="menuitem">
              <Upload size={15} />
              Upload files
            </button>
            <button type="button" onClick={() => run(onUploadFolders)} role="menuitem">
              <FolderOpen size={15} />
              Upload folders
            </button>
            <button type="button" onClick={() => run(onRefresh)} role="menuitem">
              <RefreshCw size={15} />
              Refresh
            </button>
          </>
        )}
        <div className="context-menu-separator" />
        <button type="button" onClick={() => run(onInspect)} role="menuitem">
          <ExternalLink size={15} />
          Inspect app
        </button>
      </div>
    </div>
  )
}
