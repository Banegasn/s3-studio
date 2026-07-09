import type {
  BucketPermissions,
  PublicAccessBlock,
  S3Bucket,
  PermissionGrant,
} from '../../types'
import { formatDate } from '../../utils/format'
import { PanelHeading } from '../ui'
import { PermissionsPanel } from '../PermissionsPanel'

type Props = {
  selectedBucket: string
  selectedBucketDetails?: S3Bucket
  bucketPermissions?: BucketPermissions
  bucketPolicyDraft: string
  publicAccessBlockDraft?: PublicAccessBlock
  loadingDetails: boolean
  busy?: string
  onSaveBucketAclGrants: (grants: PermissionGrant[]) => void
  onBucketPolicyChange: (value: string) => void
  onSaveBucketPolicy: () => void
  onDeleteBucketPolicy: () => void
  onPublicAccessBlockChange: (value: PublicAccessBlock) => void
  onSavePublicAccessBlock: () => void
}

export function BucketDetails({
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
      <PanelHeading eyebrow="Bucket" title={selectedBucket} />

      <DetailGrid>
        <DetailGridCell label="Name">{selectedBucket}</DetailGridCell>
        <DetailGridCell label="Created">{formatDate(selectedBucketDetails?.creation_date)}</DetailGridCell>
        <DetailGridCell label="Region">{selectedBucketDetails?.region || '-'}</DetailGridCell>
        <DetailGridCell label="Policy">{bucketPermissions?.bucket_policy ? 'Configured' : 'None'}</DetailGridCell>
      </DetailGrid>

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
