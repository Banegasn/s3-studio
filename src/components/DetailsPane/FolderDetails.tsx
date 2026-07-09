import type { PermissionGrant, PrefixPermissions, S3Entry } from '../../types'
import { PanelHeading } from '../ui'
import { PermissionsPanel } from '../PermissionsPanel'

type Props = {
  selectedBucket: string
  selectedEntry: S3Entry
  folderPermissions?: PrefixPermissions
  loadingDetails: boolean
  busy?: string
  onSaveFolderAclGrants: (grants: PermissionGrant[]) => void
  onLoadFolderPermissions: () => void
}

export function FolderDetails({
  selectedBucket,
  selectedEntry,
  folderPermissions,
  loadingDetails,
  busy,
  onSaveFolderAclGrants,
  onLoadFolderPermissions,
}: Props) {
  const firstSample = folderPermissions?.sampled_objects.find((object) => !object.error)

  return (
    <aside className="details-pane">
      <PanelHeading eyebrow="Folder" title={selectedEntry.name} />

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
        onLoadFolderPermissions={onLoadFolderPermissions}
        permissionsLoaded={Boolean(folderPermissions)}
        loadingPermissions={loadingDetails}
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
