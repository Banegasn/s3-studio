import type {
  LinkedDistribution,
  ObjectMetadata,
  ObjectPermissions,
  ObjectPreview,
  PermissionGrant,
  S3Entry,
} from '../../types'
import { fileNameFromKey, formatBytes, objectParentPrefix } from '../../utils/format'
import { PanelHeading } from '../ui'
import { PermissionsPanel } from '../PermissionsPanel'
import { CloudFrontPanel } from './CloudFrontPanel'
import { ObjectPreviewPanel } from './ObjectPreviewPanel'

type Props = {
  selectedBucket: string
  selectedRegion: string
  selectedObject: S3Entry
  metadata?: ObjectMetadata
  preview?: ObjectPreview
  objectPermissions?: ObjectPermissions
  linkedDistributions: LinkedDistribution[]
  pathOverrides: Record<string, string>
  loadingDetails: boolean
  busy?: string
  theme: 'light' | 'dark'
  onSaveObjectAclGrants: (grants: PermissionGrant[]) => void
  onSaveObjectText: (text: string) => void
  onInvalidate: (distribution: LinkedDistribution) => void
}

export function ObjectDetails({
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
  theme,
  onSaveObjectAclGrants,
  onSaveObjectText,
  onInvalidate,
}: Props) {
  return (
    <aside className="details-pane object-details-pane">
      <PanelHeading eyebrow="Object" title={fileNameFromKey(selectedObject.key)} />

      <div className="preview-box">
        <ObjectPreviewPanel
          selectedObject={selectedObject}
          preview={preview}
          loadingDetails={loadingDetails}
          disabled={Boolean(busy)}
          theme={theme}
          onSave={onSaveObjectText}
        />
      </div>

      <DetailGrid>
        <DetailGridCell label="Key">{selectedObject.key}</DetailGridCell>
        <DetailGridCell label="Size">{formatBytes(metadata?.size ?? selectedObject.size)}</DetailGridCell>
        <DetailGridCell label="Type">{metadata?.content_type || '-'}</DetailGridCell>
        <DetailGridCell label="Cache">{metadata?.cache_control || '-'}</DetailGridCell>
        <DetailGridCell label="Parent">{objectParentPrefix(selectedObject.key) || '/'}</DetailGridCell>
        <DetailGridCell label="ETag">{metadata?.etag || selectedObject.etag || '-'}</DetailGridCell>
      </DetailGrid>

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

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="detail-grid">{children}</div>
}

function DetailGridCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  )
}
