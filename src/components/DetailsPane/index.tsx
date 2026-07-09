import { Boxes } from 'lucide-react'
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
} from '../../types'
import { BucketDetails } from './BucketDetails'
import { FolderDetails } from './FolderDetails'
import '../DetailsPane.css'
import { ObjectDetails } from './ObjectDetails'
import { PanelHeading, EmptyState } from '../ui'

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
  theme: 'light' | 'dark'
  onSaveBucketAclGrants: (grants: PermissionGrant[]) => void
  onSaveFolderAclGrants: (grants: PermissionGrant[]) => void
  onSaveObjectAclGrants: (grants: PermissionGrant[]) => void
  onLoadFolderPermissions: () => void
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
        <PanelHeading eyebrow="Details" title="No bucket" />
        <div className="preview-box">
          <EmptyState icon={<Boxes size={22} />} message="Select a bucket" compact />
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
