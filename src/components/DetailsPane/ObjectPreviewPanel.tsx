import { useEffect, useState, type KeyboardEvent } from 'react'
import Editor from '@monaco-editor/react'
import { Archive, Image, Loader2, Maximize2, RotateCcw, Save, X } from 'lucide-react'
import type { ObjectPreview, S3Entry } from '../../types'
import { isImagePreview, isPdfPreview } from '../../utils/format'
import { EmptyState, IconButton, Button } from '../ui'

type Props = {
  selectedObject: S3Entry
  preview?: ObjectPreview
  loadingDetails: boolean
  disabled?: boolean
  theme: 'light' | 'dark'
  onSave: (text: string) => void
}

export function ObjectPreviewPanel({ selectedObject, preview, loadingDetails, disabled, theme, onSave }: Props) {
  const [draft, setDraft] = useState('')
  const [lastPreviewKey, setLastPreviewKey] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!preview || preview.encoding !== 'text') return
    const previewKey = `${preview.bucket}:${preview.key}:${preview.etag || ''}:${preview.text || ''}`
    setLastPreviewKey(previewKey)
    setDraft(preview.text || '')
  }, [preview])

  if (loadingDetails) {
    return <EmptyState icon={<Loader2 className="spin" size={22} />} message="Loading preview" compact />
  }
  if (!preview || preview.encoding === 'none') {
    return <EmptyState icon={<Archive size={22} />} message="No inline preview" compact />
  }
  if (isImagePreview(preview)) {
    return <img className="object-preview-image" src={`data:${preview.content_type};base64,${preview.body_base64}`} alt={selectedObject.name} />
  }
  if (isPdfPreview(preview)) {
    return <iframe className="object-preview-frame" src={`data:application/pdf;base64,${preview.body_base64}`} title={selectedObject.name} />
  }
  if (preview.encoding === 'text') {
    const dirty = draft !== (preview.text || '')
    return (
      <TextEditorView
        selectedObject={selectedObject}
        draft={draft}
        preview={preview}
        lastPreviewKey={lastPreviewKey}
        isFullscreen={isFullscreen}
        dirty={dirty}
        disabled={disabled}
        theme={theme}
        setDraft={setDraft}
        setIsFullscreen={setIsFullscreen}
        onSave={onSave}
      />
    )
  }
  return <EmptyState icon={<Image size={22} />} message="Binary preview loaded" compact />
}

function TextEditorView({
  selectedObject,
  draft,
  preview,
  lastPreviewKey,
  isFullscreen,
  dirty,
  disabled,
  theme,
  setDraft,
  setIsFullscreen,
  onSave,
}: {
  selectedObject: S3Entry
  draft: string
  preview: ObjectPreview
  lastPreviewKey: string
  isFullscreen: boolean
  dirty: boolean
  disabled?: boolean
  theme: 'light' | 'dark'
  setDraft: (value: string) => void
  setIsFullscreen: (value: boolean) => void
  onSave: (text: string) => void
}) {
  const language = editorLanguage(selectedObject.key, preview.content_type)
  const canSave = !disabled && dirty && !preview.truncated

  function discardChanges() {
    setDraft(preview.text || '')
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (canSave) onSave(draft)
      return
    }
    if (event.key === 'Escape' && isFullscreen) {
      event.preventDefault()
      setIsFullscreen(false)
    }
  }

  return (
    <div className="object-editor" onKeyDown={handleEditorKeyDown}>
      <div className="object-editor-toolbar">
        <div className="editor-toolbar-meta">
          <span>{language}</span>
          {preview.truncated ? <strong>Preview truncated</strong> : null}
        </div>
        <div className="editor-toolbar-actions">
          <IconButton compact onClick={discardChanges} disabled={!dirty} title="Discard changes">
            <RotateCcw size={14} />
          </IconButton>
          <IconButton compact variant="primary" onClick={() => onSave(draft)} disabled={!canSave} title="Save changes (⌘/Ctrl+S)">
            <Save size={14} />
          </IconButton>
          <IconButton compact onClick={() => setIsFullscreen(true)} title="Open fullscreen editor">
            <Maximize2 size={14} />
          </IconButton>
        </div>
      </div>
      <CodeEditor keyValue={lastPreviewKey} value={draft} language={language} theme={theme} onChange={setDraft} />
      {isFullscreen ? (
        <div className="editor-fullscreen-backdrop">
          <section className="editor-fullscreen" role="dialog" aria-modal="true" aria-label="Fullscreen editor">
            <div className="object-editor-toolbar">
              <div className="editor-toolbar-meta">
                <span>{selectedObject.key}</span>
                {preview.truncated ? <strong>Preview truncated</strong> : null}
              </div>
              <div className="editor-toolbar-actions">
                <Button onClick={discardChanges} disabled={!dirty} title="Discard changes">
                  <RotateCcw size={14} />
                  Discard
                </Button>
                <Button variant="primary" onClick={() => onSave(draft)} disabled={!canSave} title="Save changes (⌘/Ctrl+S)">
                  <Save size={14} />
                  Save
                </Button>
                <IconButton compact onClick={() => setIsFullscreen(false)} title="Close fullscreen editor">
                  <X size={14} />
                </IconButton>
              </div>
            </div>
            <CodeEditor keyValue={`fullscreen:${lastPreviewKey}`} value={draft} language={language} theme={theme} onChange={setDraft} />
          </section>
        </div>
      ) : null}
    </div>
  )
}

function CodeEditor({
  keyValue,
  value,
  language,
  theme,
  onChange,
}: {
  keyValue: string
  value: string
  language: string
  theme: 'light' | 'dark'
  onChange: (value: string) => void
}) {
  return (
    <Editor
      key={keyValue}
      value={value}
      language={language}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      loading={<EmptyState message="Loading editor" compact />}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        padding: { top: 10, bottom: 10 },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
        folding: true,
        smoothScrolling: true,
        mouseWheelZoom: true,
        cursorSmoothCaretAnimation: 'on',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: true },
        renderWhitespace: 'selection',
        stickyScroll: { enabled: false },
        ariaLabel: 'Object text editor',
      }}
      onChange={(nextValue) => onChange(nextValue || '')}
    />
  )
}

function editorLanguage(key: string, contentType?: string) {
  const lowerKey = key.toLowerCase()
  const lowerType = contentType?.toLowerCase() || ''
  if (lowerKey.endsWith('.ts') || lowerKey.endsWith('.tsx')) return 'typescript'
  if (lowerKey.endsWith('.js') || lowerKey.endsWith('.jsx') || lowerType.includes('javascript')) return 'javascript'
  if (lowerKey.endsWith('.json') || lowerType.includes('json')) return 'json'
  if (lowerKey.endsWith('.css') || lowerType.includes('css')) return 'css'
  if (lowerKey.endsWith('.html') || lowerType.includes('html')) return 'html'
  if (lowerKey.endsWith('.xml') || lowerType.includes('xml')) return 'xml'
  if (lowerKey.endsWith('.md') || lowerType.includes('markdown')) return 'markdown'
  if (lowerKey.endsWith('.yml') || lowerKey.endsWith('.yaml')) return 'yaml'
  return 'plaintext'
}
