import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Check, ChevronRight, Copy, Download, File, Folder, Loader2, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { S3Entry } from '../types'
import { buildBreadcrumbs, currentFolderLabel, formatBytes, formatDate, parentPrefix } from '../utils/format'
import { Button, IconButton, SearchBox, EmptyState } from './ui'
import './BrowserPane.css'

export type SelectionMode = 'single' | 'toggle' | 'range'

type Props = {
  bucket: string
  prefix: string
  objects: S3Entry[]
  filteredObjects: S3Entry[]
  objectFilter: string
  selectedEntry?: S3Entry
  selectedEntries: S3Entry[]
  nextToken?: string
  busy?: string
  loadingObjects: boolean
  isDropActive: boolean
  onFilterChange: (value: string) => void
  onSetPrefix: (prefix: string) => void
  onSelectEntry: (entry: S3Entry, mode?: SelectionMode) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onActivateEntry: (entry: S3Entry) => void
  onContextMenu: (entry: S3Entry, x: number, y: number) => void
  onUploadFiles: () => void
  onUploadFolders: () => void
  onDownload: () => void
  onDelete: () => void
  onRefresh: () => void
  onLoadMore: () => void
}

export function BrowserPane({
  bucket,
  prefix,
  objects,
  filteredObjects,
  objectFilter,
  selectedEntry,
  selectedEntries,
  nextToken,
  busy,
  loadingObjects,
  isDropActive,
  onFilterChange,
  onSetPrefix,
  onSelectEntry,
  onSelectAll,
  onClearSelection,
  onActivateEntry,
  onContextMenu,
  onUploadFiles,
  onUploadFolders,
  onDownload,
  onDelete,
  onRefresh,
  onLoadMore,
}: Props) {
  const breadcrumbs = buildBreadcrumbs(prefix)
  const selectedIds = useMemo(() => new Set(selectedEntries.map(entryId)), [selectedEntries])
  const hasSelectedEntry = selectedEntries.length > 0
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const copyResetRef = useRef<number | undefined>(undefined)
  const [prefixDraft, setPrefixDraft] = useState(prefix)
  const [isEditingPrefix, setIsEditingPrefix] = useState(false)
  const [prefixCopied, setPrefixCopied] = useState(false)
  const selectedFilteredCount = filteredObjects.filter((entry) => selectedIds.has(entryId(entry))).length
  const allFilteredSelected = filteredObjects.length > 0 && selectedFilteredCount === filteredObjects.length
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedEntry?.key, selectedEntry?.kind])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected
    }
  }, [someFilteredSelected])

  useEffect(() => {
    setPrefixDraft(prefix)
  }, [prefix])

  useEffect(() => () => window.clearTimeout(copyResetRef.current), [])

  function submitPrefix(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsEditingPrefix(false)
    onSetPrefix(prefixDraft)
  }

  function cancelPrefixEditor() {
    setPrefixDraft(prefix)
    setIsEditingPrefix(false)
  }

  async function copyPrefix() {
    try {
      await navigator.clipboard.writeText(prefix)
    } catch {
      const copyInput = document.createElement('textarea')
      copyInput.value = prefix
      copyInput.style.position = 'fixed'
      copyInput.style.opacity = '0'
      document.body.append(copyInput)
      copyInput.select()
      document.execCommand('copy')
      copyInput.remove()
    }
    setPrefixCopied(true)
    window.clearTimeout(copyResetRef.current)
    copyResetRef.current = window.setTimeout(() => setPrefixCopied(false), 1400)
  }

  function toggleAllVisible() {
    if (allFilteredSelected) {
      onClearSelection()
      return
    }
    onSelectAll()
  }

  function moveSelection(direction: 1 | -1, mode: SelectionMode = 'single') {
    if (filteredObjects.length === 0) return
    const currentIndex = selectedEntry
      ? filteredObjects.findIndex((entry) => entry.key === selectedEntry.key && entry.kind === selectedEntry.kind)
      : -1
    const fallbackIndex = direction === 1 ? 0 : filteredObjects.length - 1
    const nextIndex = currentIndex >= 0 ? Math.min(Math.max(currentIndex + direction, 0), filteredObjects.length - 1) : fallbackIndex
    onSelectEntry(filteredObjects[nextIndex], mode)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1, event.shiftKey ? 'range' : 'single')
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1, event.shiftKey ? 'range' : 'single')
      return
    }
    if (event.key === 'Home' && filteredObjects.length > 0) {
      event.preventDefault()
      onSelectEntry(filteredObjects[0], event.shiftKey ? 'range' : 'single')
      return
    }
    if (event.key === 'End' && filteredObjects.length > 0) {
      event.preventDefault()
      onSelectEntry(filteredObjects[filteredObjects.length - 1], event.shiftKey ? 'range' : 'single')
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      onSelectAll()
      return
    }
    if ((event.key === 'Enter' || event.key === 'ArrowRight') && selectedEntry) {
      event.preventDefault()
      onActivateEntry(selectedEntry)
      return
    }
    if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && prefix) {
      event.preventDefault()
      onSetPrefix(parentPrefix(prefix))
      return
    }
    if (event.key === 'Delete' && hasSelectedEntry) {
      event.preventDefault()
      onDelete()
    }
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, entry: S3Entry) {
    if (event.shiftKey) {
      onSelectEntry(entry, 'range')
      return
    }
    if (event.metaKey || event.ctrlKey) {
      onSelectEntry(entry, 'toggle')
      return
    }
    onSelectEntry(entry, 'single')
  }

  return (
    <section className={isDropActive ? 'browser-pane drop-active' : 'browser-pane'}>
      <div className="browser-toolbar">
        {isEditingPrefix ? (
          <form className="breadcrumbs prefix-editor active" onSubmit={submitPrefix}>
            <Pencil size={15} />
            <input
              autoFocus
              value={prefixDraft}
              onChange={(event) => setPrefixDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelPrefixEditor()
              }}
              disabled={!bucket}
              placeholder="/"
              aria-label="Current prefix"
            />
            <IconButton compact type="submit" title="Open prefix" disabled={!bucket}>
              <ChevronRight size={14} />
            </IconButton>
          </form>
        ) : (
          <div className="breadcrumbs breadcrumb-control">
            <nav className="breadcrumb-trail" aria-label="Current S3 prefix">
              <button type="button" onClick={() => onSetPrefix('')} disabled={!bucket} title="Open bucket root">
                {bucket || 'No bucket'}
              </button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.prefix} className="crumb">
                  <ChevronRight size={15} />
                  <button type="button" onClick={() => onSetPrefix(crumb.prefix)} title={`Open ${crumb.prefix}`}>
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
            <div className="breadcrumb-actions">
              <IconButton compact onClick={() => void copyPrefix()} disabled={!bucket} title="Copy current prefix">
                {prefixCopied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
              <IconButton
                compact
                onClick={() => {
                  setPrefixDraft(prefix)
                  setIsEditingPrefix(true)
                }}
                disabled={!bucket}
                title="Edit current prefix"
              >
                <Pencil size={14} />
              </IconButton>
            </div>
          </div>
        )}
        <div className="toolbar-actions">
          <Button onClick={onUploadFiles} disabled={!bucket || Boolean(busy)}>
            <Upload size={16} />
            Files
          </Button>
          <Button onClick={onUploadFolders} disabled={!bucket || Boolean(busy)}>
            <Folder size={16} />
            Folder
          </Button>
          <Button onClick={onDownload} disabled={!hasSelectedEntry || Boolean(busy)}>
            <Download size={16} />
            {selectedEntries.length > 1 ? `Download ${selectedEntries.length}` : 'Download'}
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={!hasSelectedEntry || Boolean(busy)}>
            <Trash2 size={16} />
            {selectedEntries.length > 1 ? `Delete ${selectedEntries.length}` : 'Delete'}
          </Button>
          <IconButton onClick={onRefresh} disabled={!bucket || loadingObjects} title="Refresh objects">
            <RefreshCw size={18} className={loadingObjects ? 'spin' : undefined} />
          </IconButton>
        </div>
      </div>

      <div className="object-filter-row">
        <SearchBox value={objectFilter} onChange={onFilterChange} placeholder="Filter this folder" />
        <span>
          {objects.length} item{objects.length === 1 ? '' : 's'}
          {selectedEntries.length > 1 ? `, ${selectedEntries.length} selected` : ''}
        </span>
      </div>

      <div className="object-table-wrap" tabIndex={0} onKeyDown={handleKeyDown} aria-label="S3 objects">
        <table className="object-table">
          <thead>
            <tr>
              <th className="select-cell">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  disabled={filteredObjects.length === 0}
                  onChange={toggleAllVisible}
                  title="Select all visible items"
                />
              </th>
              <th>Name</th>
              <th>Size</th>
              <th>Modified</th>
              <th>Storage</th>
            </tr>
          </thead>
          <tbody>
            {filteredObjects.map((entry) => {
              const isSelected = selectedIds.has(entryId(entry))
              const isFocused = Boolean(selectedEntry && selectedEntry.key === entry.key && selectedEntry.kind === entry.kind)
              return (
                <tr
                  key={`${entry.kind}:${entry.key}`}
                  ref={isFocused ? selectedRowRef : undefined}
                  className={isSelected ? (isFocused ? 'selected focused' : 'selected') : undefined}
                  onClick={(event) => handleRowClick(event, entry)}
                  onDoubleClick={() => onActivateEntry(entry)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onContextMenu(entry, event.clientX, event.clientY)
                  }}
                  aria-selected={isSelected}
                >
                  <td className="select-cell">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelectEntry(entry, 'toggle')}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${entry.name}`}
                    />
                  </td>
                  <td>
                    <span className="object-name">
                      {entry.kind === 'folder' ? <Folder size={17} /> : <File size={17} />}
                      {entry.name}
                    </span>
                  </td>
                  <td>{entry.kind === 'folder' ? '-' : formatBytes(entry.size)}</td>
                  <td>{entry.kind === 'folder' ? '-' : formatDate(entry.last_modified)}</td>
                  <td>{entry.storage_class || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loadingObjects ? (
          <div className="table-overlay">
            <Loader2 className="spin" size={24} />
          </div>
        ) : null}
        {!loadingObjects && filteredObjects.length === 0 ? (
          <EmptyState icon={<Upload size={22} />} message="No objects in this folder. Drop files or folders here." />
        ) : null}
        {isDropActive ? (
          <div className="drop-overlay">
            <Upload size={28} />
            <span>Drop to upload into {currentFolderLabel(prefix)}</span>
          </div>
        ) : null}
      </div>

      {nextToken ? (
        <Button className="load-more" variant="primary" onClick={onLoadMore} disabled={loadingObjects}>
          Load more
        </Button>
      ) : null}
    </section>
  )
}

function entryId(entry: S3Entry) {
  return `${entry.kind}:${entry.key}`
}
