import { useEffect, useState, type ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { AlertCircle, Archive, Boxes, Check, CloudLightning, Copy, ExternalLink, Folder, Image, Loader2, Maximize2, Save, X } from 'lucide-react'
import type {
  BucketPermissions,
  LinkedDistribution,
  ObjectMetadata,
  ObjectPermissions,
  ObjectPreview,
  PermissionGrant,
  PrefixPermissions,
  PublicAccessBlock,
  S3Bucket,
  S3Entry,
} from '../types'
import {
  fileNameFromKey,
  formatBytes,
  formatDate,
  isImagePreview,
  isPdfPreview,
  objectParentPrefix,
} from '../utils/format'
import { PermissionsPanel } from './PermissionsPanel'

type Props = {
  selectedBucket: string
  selectedRegion: string
  selectedBucketDetails?: S3Bucket
  selectedEntry?: S3Entry
  selectedObject?: S3Entry
  metadata?: ObjectMetadata
  preview?: ObjectPreview
  bucketPermissions?: BucketPermissions
  folderPermissions?: PrefixPermissions
  objectPermissions?: ObjectPermissions
  linkedDistributions: LinkedDistribution[]
  pathOverrides: Record<string, string>
  bucketPolicyDraft: string
  publicAccessBlockDraft?: PublicAccessBlock
  loadingDetails: boolean
  busy?: string
  onSaveBucketAclGrants: (grants: PermissionGrant[]) => void
  onSaveFolderAclGrants: (grants: PermissionGrant[]) => void
  onSaveObjectAclGrants: (grants: PermissionGrant[]) => void
  onSaveObjectText: (text: string) => void
  onBucketPolicyChange: (value: string) => void
  onSaveBucketPolicy: () => void
  onDeleteBucketPolicy: () => void
  onPublicAccessBlockChange: (value: PublicAccessBlock) => void
  onSavePublicAccessBlock: () => void
  onInvalidate: (distribution: LinkedDistribution) => void
}

export function DetailsPane(props: Props) {
  if (!props.selectedBucket) {
    return (
      <aside className="details-pane">
        <div className="pane-heading">
          <div>
            <p className="eyebrow">Details</p>
            <h2>No bucket</h2>
          </div>
        </div>
        <div className="preview-box">
          <div className="empty-state compact">
            <Boxes size={22} />
            <span>Select a bucket</span>
          </div>
        </div>
      </aside>
    )
  }

  if (props.selectedEntry?.kind === 'folder') {
    return <FolderDetails {...props} selectedEntry={props.selectedEntry} />
  }

  if (props.selectedObject) {
    return <ObjectDetails {...props} selectedObject={props.selectedObject} />
  }

  return <BucketDetails {...props} />
}

function BucketDetails({
  selectedBucket,
  selectedBucketDetails,
  bucketPermissions,
  bucketPolicyDraft,
  publicAccessBlockDraft,
  loadingDetails,
  busy,
  onSaveBucketAclGrants,
  onBucketPolicyChange,
  onSaveBucketPolicy,
  onDeleteBucketPolicy,
  onPublicAccessBlockChange,
  onSavePublicAccessBlock,
}: Props) {
  return (
    <aside className="details-pane">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">Bucket</p>
          <h2>{selectedBucket}</h2>
        </div>
      </div>

      <div className="preview-box resource-preview">
        <ResourcePreview loading={loadingDetails} icon={<Boxes size={26} />} label={selectedBucket} />
      </div>

      <div className="detail-grid">
        <div>
          <span>Name</span>
          <strong>{selectedBucket}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{formatDate(selectedBucketDetails?.creation_date)}</strong>
        </div>
        <div>
          <span>Region</span>
          <strong>{selectedBucketDetails?.region || '-'}</strong>
        </div>
        <div>
          <span>Policy</span>
          <strong>{bucketPermissions?.bucket_policy ? 'Configured' : 'None'}</strong>
        </div>
      </div>

      <PermissionsPanel
        kind="bucket"
        grants={bucketPermissions?.grants || []}
        errors={bucketPermissions?.errors || []}
        objectOwnership={bucketPermissions?.object_ownership || []}
        publicAccessBlock={publicAccessBlockDraft}
        bucketPolicy={bucketPolicyDraft}
        disabled={Boolean(busy) || loadingDetails}
        onSaveAclGrants={onSaveBucketAclGrants}
        onPublicAccessBlockChange={onPublicAccessBlockChange}
        onSavePublicAccessBlock={onSavePublicAccessBlock}
        onBucketPolicyChange={onBucketPolicyChange}
        onSaveBucketPolicy={onSaveBucketPolicy}
        onDeleteBucketPolicy={onDeleteBucketPolicy}
      />
    </aside>
  )
}

function FolderDetails({
  selectedBucket,
  selectedEntry,
  folderPermissions,
  loadingDetails,
  busy,
  onSaveFolderAclGrants,
}: Props & { selectedEntry: S3Entry }) {
  const firstSample = folderPermissions?.sampled_objects.find((object) => !object.error)

  return (
    <aside className="details-pane">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">Folder</p>
          <h2>{selectedEntry.name}</h2>
        </div>
      </div>

      <div className="preview-box resource-preview">
        <ResourcePreview loading={loadingDetails} icon={<Folder size={26} />} label={selectedEntry.key} />
      </div>

      <div className="detail-grid">
        <div>
          <span>Bucket</span>
          <strong>{selectedBucket}</strong>
        </div>
        <div>
          <span>Objects</span>
          <strong>
            {folderPermissions ? `${folderPermissions.object_count}${folderPermissions.object_count_truncated ? '+' : ''}` : '-'}
          </strong>
        </div>
        <div>
          <span>Prefix</span>
          <strong>{selectedEntry.key}</strong>
        </div>
        <div>
          <span>Type</span>
          <strong>S3 prefix</strong>
        </div>
      </div>

      <PermissionsPanel
        kind="folder"
        grants={firstSample?.grants || []}
        errors={folderPermissions?.errors || []}
        objectCount={folderPermissions?.object_count}
        sampledObjects={folderPermissions?.sampled_objects}
        disabled={Boolean(busy) || loadingDetails || !folderPermissions || folderPermissions.object_count === 0}
        onSaveAclGrants={onSaveFolderAclGrants}
      />
    </aside>
  )
}

function ObjectDetails({
  selectedBucket,
  selectedRegion,
  selectedObject,
  metadata,
  preview,
  objectPermissions,
  linkedDistributions,
  pathOverrides,
  loadingDetails,
  busy,
  onSaveObjectAclGrants,
  onSaveObjectText,
  onInvalidate,
}: Props & { selectedObject: S3Entry }) {
  return (
    <aside className="details-pane">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">Object</p>
          <h2>{fileNameFromKey(selectedObject.key)}</h2>
        </div>
      </div>

      <div className="preview-box">
        <ObjectPreviewPanel
          selectedObject={selectedObject}
          preview={preview}
          loadingDetails={loadingDetails}
          disabled={Boolean(busy)}
          onSave={onSaveObjectText}
        />
      </div>

      <div className="detail-grid">
        <div>
          <span>Key</span>
          <strong>{selectedObject.key}</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>{formatBytes(metadata?.size ?? selectedObject.size)}</strong>
        </div>
        <div>
          <span>Type</span>
          <strong>{metadata?.content_type || '-'}</strong>
        </div>
        <div>
          <span>Cache</span>
          <strong>{metadata?.cache_control || '-'}</strong>
        </div>
        <div>
          <span>Parent</span>
          <strong>{objectParentPrefix(selectedObject.key) || '/'}</strong>
        </div>
        <div>
          <span>ETag</span>
          <strong>{metadata?.etag || selectedObject.etag || '-'}</strong>
        </div>
      </div>

      <PermissionsPanel
        kind="object"
        grants={objectPermissions?.grants || []}
        errors={objectPermissions?.errors || []}
        disabled={Boolean(busy) || loadingDetails}
        onSaveAclGrants={onSaveObjectAclGrants}
      />

      <CloudFrontPanel
        selectedBucket={selectedBucket}
        selectedRegion={selectedRegion}
        selectedObject={selectedObject}
        linkedDistributions={linkedDistributions}
        pathOverrides={pathOverrides}
        loadingDetails={loadingDetails}
        busy={busy}
        onInvalidate={onInvalidate}
      />
    </aside>
  )
}

function CloudFrontPanel({
  selectedBucket,
  selectedRegion,
  selectedObject,
  linkedDistributions,
  pathOverrides,
  loadingDetails,
  busy,
  onInvalidate,
}: {
  selectedBucket: string
  selectedRegion: string
  selectedObject: S3Entry
  linkedDistributions: LinkedDistribution[]
  pathOverrides: Record<string, string>
  loadingDetails: boolean
  busy?: string
  onInvalidate: (distribution: LinkedDistribution) => void
}) {
  const awsUrl = buildS3ObjectUrl(selectedBucket, selectedRegion, selectedObject.key)

  return (
    <section className="cloudfront-panel">
      <div className="section-heading">
        <CloudLightning size={18} />
        <h3>CloudFront</h3>
        <span>{linkedDistributions.length}</span>
      </div>
      <CopyUrlRow label="S3 raw" value={awsUrl} />
      <div className="distribution-list">
        {linkedDistributions.map((link) => (
          <div className="distribution-item" key={link.id}>
            <div className="distribution-title">
              <div>
                <strong>{link.id}</strong>
                <span>{link.aliases[0] || link.domain_name}</span>
              </div>
              <span className={link.enabled ? 'status deployed' : 'status disabled'}>{link.status || (link.enabled ? 'Enabled' : 'Disabled')}</span>
            </div>

            <div className="url-copy-list">
              <CopyUrlRow  value={buildCloudFrontUrl(link, pathOverrides[link.id])} />
            </div>
            <div className="distribution-actions">
              <button type="button" className="primary-action" onClick={() => onInvalidate(link)} disabled={Boolean(busy)}>
                <CloudLightning size={15} />
                Invalidate
              </button>
            </div>
          </div>
        ))}
        {!loadingDetails && linkedDistributions.length === 0 ? (
          <div className="empty-state compact">
            <AlertCircle size={20} />
            <span>No linked distributions found</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function CopyUrlRow({ label, value }: { label?: string; value: string }) {
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

function ResourcePreview({ loading, icon, label }: { loading: boolean; icon: ReactNode; label: string }) {
  if (loading) {
    return (
      <div className="empty-state compact">
        <Loader2 className="spin" size={22} />
        <span>Loading details</span>
      </div>
    )
  }
  return (
    <div className="resource-preview-content">
      {icon}
      <span>{label}</span>
    </div>
  )
}

function ObjectPreviewPanel({
  selectedObject,
  preview,
  loadingDetails,
  disabled,
  onSave,
}: {
  selectedObject: S3Entry
  preview?: ObjectPreview
  loadingDetails: boolean
  disabled?: boolean
  onSave: (text: string) => void
}) {
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
    return (
      <div className="empty-state compact">
        <Loader2 className="spin" size={22} />
        <span>Loading preview</span>
      </div>
    )
  }
  if (!preview || preview.encoding === 'none') {
    return (
      <div className="empty-state compact">
        <Archive size={22} />
        <span>No inline preview</span>
      </div>
    )
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
      <div className="object-editor">
        <div className="object-editor-toolbar">
          <span>{editorLanguage(selectedObject.key, preview.content_type)}</span>
          {preview.truncated ? <strong>Preview truncated</strong> : null}
          <button type="button" className="icon-button compact primary-action" onClick={() => onSave(draft)} disabled={disabled || !dirty || preview.truncated}>
            <Save size={14} />
          </button>
          <button type="button" className="icon-button compact" onClick={() => setIsFullscreen(true)} title="Open fullscreen editor">
            <Maximize2 size={14} />
          </button>
        </div>
        <CodeEditor keyValue={lastPreviewKey} value={draft} language={editorLanguage(selectedObject.key, preview.content_type)} onChange={setDraft} />
        {isFullscreen ? (
          <div className="editor-fullscreen-backdrop">
            <section className="editor-fullscreen" role="dialog" aria-modal="true" aria-label="Fullscreen editor">
              <div className="object-editor-toolbar">
                <span>{selectedObject.key}</span>
                {preview.truncated ? <strong>Preview truncated</strong> : null}
                <button type="button" className="primary-action" onClick={() => onSave(draft)} disabled={disabled || !dirty || preview.truncated}>
                  <Save size={14} />
                  Save
                </button>
                <button type="button" className="icon-button compact" onClick={() => setIsFullscreen(false)} title="Close fullscreen editor">
                  <X size={14} />
                </button>
              </div>
              <CodeEditor keyValue={`fullscreen:${lastPreviewKey}`} value={draft} language={editorLanguage(selectedObject.key, preview.content_type)} onChange={setDraft} />
            </section>
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div className="empty-state compact">
      <Image size={22} />
      <span>Binary preview loaded</span>
    </div>
  )
}

function CodeEditor({
  keyValue,
  value,
  language,
  onChange,
}: {
  keyValue: string
  value: string
  language: string
  onChange: (value: string) => void
}) {
  return (
    <Editor
      key={keyValue}
      value={value}
      language={language}
      theme="vs"
      loading={<div className="empty-state compact">Loading editor</div>}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        lineHeight: 18,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
      }}
      onChange={(nextValue) => onChange(nextValue || '')}
    />
  )
}

function buildCloudFrontUrl(link: LinkedDistribution, pathOverride?: string) {
  const host = link.aliases[0] || link.domain_name
  return `https://${host}${encodeUrlPath(pathOverride || link.invalidation_path)}`
}

function buildS3ObjectUrl(bucket: string, region: string, key: string) {
  const regionalHost = region === 'us-east-1' ? `${bucket}.s3.amazonaws.com` : `${bucket}.s3.${region}.amazonaws.com`
  return `https://${regionalHost}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function encodeUrlPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.split('/').map((part, index) => (index === 0 ? '' : encodeURIComponent(part))).join('/')
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
