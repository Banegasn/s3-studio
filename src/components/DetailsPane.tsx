import type { ReactNode } from 'react'
import { AlertCircle, Archive, Boxes, CloudLightning, ExternalLink, Folder, Image, Loader2 } from 'lucide-react'
import type {
  BucketPermissions,
  LinkedDistribution,
  ObjectMetadata,
  ObjectPermissions,
  ObjectPreview,
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
  isTextPreview,
  objectParentPrefix,
} from '../utils/format'
import { PermissionsPanel } from './PermissionsPanel'

type Props = {
  selectedBucket: string
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
  bucketAcl: string
  folderAcl: string
  objectAcl: string
  bucketPolicyDraft: string
  publicAccessBlockDraft?: PublicAccessBlock
  loadingDetails: boolean
  busy?: string
  onBucketAclChange: (value: string) => void
  onFolderAclChange: (value: string) => void
  onObjectAclChange: (value: string) => void
  onApplyBucketAcl: () => void
  onApplyFolderAcl: () => void
  onApplyObjectAcl: () => void
  onBucketPolicyChange: (value: string) => void
  onSaveBucketPolicy: () => void
  onDeleteBucketPolicy: () => void
  onPublicAccessBlockChange: (value: PublicAccessBlock) => void
  onSavePublicAccessBlock: () => void
  onPathOverride: (distributionId: string, value: string) => void
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
  bucketAcl,
  bucketPolicyDraft,
  publicAccessBlockDraft,
  loadingDetails,
  busy,
  onBucketAclChange,
  onApplyBucketAcl,
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
        owner={bucketPermissions?.owner}
        grants={bucketPermissions?.grants || []}
        errors={bucketPermissions?.errors || []}
        objectOwnership={bucketPermissions?.object_ownership || []}
        publicAccessBlock={publicAccessBlockDraft}
        bucketPolicy={bucketPolicyDraft}
        aclValue={bucketAcl}
        disabled={Boolean(busy) || loadingDetails}
        onAclChange={onBucketAclChange}
        onApplyAcl={onApplyBucketAcl}
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
  folderAcl,
  loadingDetails,
  busy,
  onFolderAclChange,
  onApplyFolderAcl,
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
          <strong>{folderPermissions?.object_count ?? '-'}</strong>
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
        owner={firstSample?.owner}
        grants={firstSample?.grants || []}
        errors={folderPermissions?.errors || []}
        objectCount={folderPermissions?.object_count}
        sampledObjects={folderPermissions?.sampled_objects}
        aclValue={folderAcl}
        disabled={Boolean(busy) || loadingDetails || !folderPermissions || folderPermissions.object_count === 0}
        onAclChange={onFolderAclChange}
        onApplyAcl={onApplyFolderAcl}
      />
    </aside>
  )
}

function ObjectDetails({
  selectedObject,
  metadata,
  preview,
  objectPermissions,
  linkedDistributions,
  pathOverrides,
  objectAcl,
  loadingDetails,
  busy,
  onObjectAclChange,
  onApplyObjectAcl,
  onPathOverride,
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
        <ObjectPreviewPanel selectedObject={selectedObject} preview={preview} loadingDetails={loadingDetails} />
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
        owner={objectPermissions?.owner}
        grants={objectPermissions?.grants || []}
        errors={objectPermissions?.errors || []}
        aclValue={objectAcl}
        disabled={Boolean(busy) || loadingDetails}
        onAclChange={onObjectAclChange}
        onApplyAcl={onApplyObjectAcl}
      />

      <CloudFrontPanel
        selectedObject={selectedObject}
        linkedDistributions={linkedDistributions}
        pathOverrides={pathOverrides}
        loadingDetails={loadingDetails}
        busy={busy}
        onPathOverride={onPathOverride}
        onInvalidate={onInvalidate}
      />
    </aside>
  )
}

function CloudFrontPanel({
  selectedObject,
  linkedDistributions,
  pathOverrides,
  loadingDetails,
  busy,
  onPathOverride,
  onInvalidate,
}: {
  selectedObject: S3Entry
  linkedDistributions: LinkedDistribution[]
  pathOverrides: Record<string, string>
  loadingDetails: boolean
  busy?: string
  onPathOverride: (distributionId: string, value: string) => void
  onInvalidate: (distribution: LinkedDistribution) => void
}) {
  return (
    <section className="cloudfront-panel">
      <div className="section-heading">
        <CloudLightning size={18} />
        <h3>CloudFront</h3>
        <span>{linkedDistributions.length}</span>
      </div>
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
            <div className="origin-line">
              <ExternalLink size={14} />
              <span>{link.matched_origin.domain_name}</span>
            </div>
            <label className="path-editor">
              <span>Invalidation path</span>
              <input value={pathOverrides[link.id] || ''} onChange={(event) => onPathOverride(link.id, event.target.value)} />
            </label>
            <div className="distribution-actions">
              <button type="button" onClick={() => onPathOverride(link.id, link.invalidation_path)}>
                Object
              </button>
              <button type="button" onClick={() => onPathOverride(link.id, `${objectParentPrefix(selectedObject.key)}*`.replace(/^([^/])/, '/$1'))}>
                Folder *
              </button>
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
}: {
  selectedObject: S3Entry
  preview?: ObjectPreview
  loadingDetails: boolean
}) {
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
  if (isTextPreview(preview)) {
    return (
      <pre className="object-preview-text">
        {preview.text}
        {preview.truncated ? '\n\n[Preview truncated]' : ''}
      </pre>
    )
  }
  return (
    <div className="empty-state compact">
      <Image size={22} />
      <span>Binary preview loaded</span>
    </div>
  )
}
