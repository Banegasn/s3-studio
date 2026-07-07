import { Folder } from 'lucide-react'
import type { PermissionGrant, PrefixPermissions, S3Entry } from '../../types'
import { PanelHeading, EmptyState } from '../ui'
import { PermissionsPanel } from '../PermissionsPanel'
import { Loader2 } from 'lucide-react'

type Props = {
  selectedBucket: string
  selectedEntry: S3Entry
  folderPermissions?: PrefixPermissions
  loadingDetails: boolean
  busy?: string
  onSaveFolderAclGrants: (grants: PermissionGrant[]) => void
}

export function FolderDetails({
  selectedBucket,
  selectedEntry,
  folderPermissions,
  loadingDetails,
  busy,
  onSaveFolderAclGrants,
}: Props) {
  const firstSample = folderPermissions?.sampled_objects.find((object) => !object.error)

  return (
    <aside className="details-pane">
      <PanelHeading eyebrow="Folder" title={selectedEntry.name} />

      <div className="preview-box resource-preview">
        <ResourcePreview loading={loadingDetails} icon={<Folder size={26} />} label={selectedEntry.key} />
      </div>

      <DetailGrid>
        <DetailGridCell label="Bucket">{selectedBucket}</DetailGridCell>
        <DetailGridCell label="Objects">
          {folderPermissions ? `${folderPermissions.object_count}${folderPermissions.object_count_truncated ? '+' : ''}` : '-'}
        </DetailGridCell>
        <DetailGridCell label="Prefix">{selectedEntry.key}</DetailGridCell>
        <DetailGridCell label="Type">S3 prefix</DetailGridCell>
      </DetailGrid>

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

function ResourcePreview({ loading, icon, label }: { loading: boolean; icon: React.ReactNode; label: string }) {
  if (loading) {
    return <EmptyState icon={<Loader2 className="spin" size={22} />} message="Loading details" compact />
  }
  return (
    <div className="resource-preview-content">
      {icon}
      <span>{label}</span>
    </div>
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
