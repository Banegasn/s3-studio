import { AlertCircle, ChevronDown, Save, ShieldCheck, Trash2 } from 'lucide-react'
import type { PermissionGrant, PermissionOwner, PrefixObjectPermissions, PublicAccessBlock } from '../types'

const BUCKET_ACLS = [
  { value: 'private', label: 'Private', description: 'Only the owner account has access unless IAM or bucket policy allows more.' },
  { value: 'public-read', label: 'Public read', description: 'Anyone on the internet may read. Writes stay private.' },
  { value: 'public-read-write', label: 'Public read/write', description: 'Anyone may read and write. Use only for temporary testing.' },
  { value: 'authenticated-read', label: 'AWS authenticated read', description: 'Any signed-in AWS account may read.' },
]

const OBJECT_ACLS = [
  ...BUCKET_ACLS,
  { value: 'bucket-owner-read', label: 'Bucket owner read', description: 'The bucket owner can read this object.' },
  { value: 'bucket-owner-full-control', label: 'Bucket owner full control', description: 'The bucket owner can read and manage this object.' },
]

type Props = {
  kind: 'bucket' | 'folder' | 'object'
  owner?: PermissionOwner
  grants: PermissionGrant[]
  errors: string[]
  aclValue: string
  disabled?: boolean
  objectCount?: number
  sampledObjects?: PrefixObjectPermissions[]
  objectOwnership?: string[]
  publicAccessBlock?: PublicAccessBlock
  bucketPolicy?: string
  onAclChange: (value: string) => void
  onApplyAcl: () => void
  onPublicAccessBlockChange?: (value: PublicAccessBlock) => void
  onSavePublicAccessBlock?: () => void
  onBucketPolicyChange?: (value: string) => void
  onSaveBucketPolicy?: () => void
  onDeleteBucketPolicy?: () => void
}

export function PermissionsPanel({
  kind,
  owner,
  grants,
  errors,
  aclValue,
  disabled,
  objectCount,
  sampledObjects,
  objectOwnership,
  publicAccessBlock,
  bucketPolicy,
  onAclChange,
  onApplyAcl,
  onPublicAccessBlockChange,
  onSavePublicAccessBlock,
  onBucketPolicyChange,
  onSaveBucketPolicy,
  onDeleteBucketPolicy,
}: Props) {
  const aclOptions = kind === 'bucket' ? BUCKET_ACLS : OBJECT_ACLS
  const selectedAcl = aclOptions.find((option) => option.value === aclValue) ?? aclOptions[0]
  const status = accessStatus(kind, grants, publicAccessBlock, bucketPolicy)
  const publicBlockCount = publicAccessBlock ? Object.values(publicAccessBlock).filter(Boolean).length : 0

  return (
    <section className="permissions-panel">
      <div className="section-heading">
        <ShieldCheck size={18} />
        <h3>Permissions</h3>
        {objectCount !== undefined ? <span>{objectCount}</span> : null}
      </div>

      <div className="permission-overview">
        <div className={`permission-status ${status.tone}`}>
          <strong>{status.label}</strong>
          <span>{status.description}</span>
        </div>
        <div className="permission-fact">
          <span>Owner</span>
          <strong>{owner?.display_name || compactId(owner?.id) || '-'}</strong>
        </div>
        {kind === 'bucket' ? (
          <>
            <div className="permission-fact">
              <span>Public guardrails</span>
              <strong>{publicAccessBlock ? `${publicBlockCount}/4 enabled` : 'Not configured'}</strong>
            </div>
            <div className="permission-fact">
              <span>Bucket policy</span>
              <strong>{bucketPolicy ? 'Configured' : 'None'}</strong>
            </div>
          </>
        ) : null}
        {kind === 'folder' ? (
          <div className="permission-fact">
            <span>Applies to</span>
            <strong>{objectCount ?? 0} object{objectCount === 1 ? '' : 's'}</strong>
          </div>
        ) : null}
      </div>

      <div className="permission-editor">
        <label>
          <span>Access preset</span>
          <select value={aclValue} onChange={(event) => onAclChange(event.target.value)} disabled={disabled}>
            {aclOptions.map((acl) => (
              <option key={acl.value} value={acl.value}>
                {acl.label}
              </option>
            ))}
          </select>
          <small>{selectedAcl.description}</small>
        </label>
        <button type="button" className="primary-action" onClick={onApplyAcl} disabled={disabled}>
          <Save size={15} />
          Apply
        </button>
      </div>

      {kind === 'folder' ? (
        <div className="permission-note">
          S3 folders are prefixes. Applying a preset here updates every object currently under this prefix.
        </div>
      ) : null}

      {kind === 'bucket' ? (
        <BucketGuardrailsSummary
          value={publicAccessBlock}
          disabled={disabled}
          onChange={onPublicAccessBlockChange}
          onSave={onSavePublicAccessBlock}
        />
      ) : null}

      <details className="advanced-permissions">
        <summary>
          <ChevronDown size={15} />
          Advanced AWS details
        </summary>
        <div className="advanced-permissions-body">
          {kind === 'bucket' ? (
            <>
              <BucketPolicyEditor
                value={bucketPolicy || ''}
                disabled={disabled}
                onChange={onBucketPolicyChange}
                onSave={onSaveBucketPolicy}
                onDelete={onDeleteBucketPolicy}
              />
              <OwnershipList values={objectOwnership || []} />
            </>
          ) : null}
          <GrantList grants={grants} />
          {sampledObjects && sampledObjects.length > 0 ? <SampledObjectGrants objects={sampledObjects} /> : null}
        </div>
      </details>

      <PermissionErrors errors={errors} />
    </section>
  )
}

function BucketGuardrailsSummary({
  value,
  disabled,
  onChange,
  onSave,
}: {
  value?: PublicAccessBlock
  disabled?: boolean
  onChange?: (value: PublicAccessBlock) => void
  onSave?: () => void
}) {
  if (!onChange || !onSave) return null
  const changeValue = onChange
  const nextValue = {
    block_public_acls: value?.block_public_acls ?? false,
    ignore_public_acls: value?.ignore_public_acls ?? false,
    block_public_policy: value?.block_public_policy ?? false,
    restrict_public_buckets: value?.restrict_public_buckets ?? false,
  }

  function update(key: keyof PublicAccessBlock, checked: boolean) {
    changeValue({ ...nextValue, [key]: checked })
  }

  return (
    <div className="permission-block">
      <div className="permission-block-heading">
        <strong>Public access guardrails</strong>
        <button type="button" className="primary-action" onClick={onSave} disabled={disabled}>
          <Save size={15} />
          Save
        </button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={Boolean(nextValue.block_public_acls)} onChange={(event) => update('block_public_acls', event.target.checked)} />
        <span>Block new public ACLs</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={Boolean(nextValue.ignore_public_acls)} onChange={(event) => update('ignore_public_acls', event.target.checked)} />
        <span>Ignore existing public ACLs</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={Boolean(nextValue.block_public_policy)} onChange={(event) => update('block_public_policy', event.target.checked)} />
        <span>Block public bucket policies</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={Boolean(nextValue.restrict_public_buckets)}
          onChange={(event) => update('restrict_public_buckets', event.target.checked)}
        />
        <span>Restrict public bucket policies</span>
      </label>
    </div>
  )
}

function BucketPolicyEditor({
  value,
  disabled,
  onChange,
  onSave,
  onDelete,
}: {
  value: string
  disabled?: boolean
  onChange?: (value: string) => void
  onSave?: () => void
  onDelete?: () => void
}) {
  if (!onChange || !onSave || !onDelete) return null
  return (
    <div className="permission-block">
      <div className="permission-block-heading">
        <strong>Bucket policy JSON</strong>
        <div className="permission-actions">
          <button type="button" onClick={onDelete} disabled={disabled}>
            <Trash2 size={15} />
            Delete
          </button>
          <button type="button" className="primary-action" onClick={onSave} disabled={disabled || value.trim().length === 0}>
            <Save size={15} />
            Save
          </button>
        </div>
      </div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
    </div>
  )
}

function OwnershipList({ values }: { values: string[] }) {
  return (
    <div className="permission-block compact">
      <strong>Object ownership</strong>
      <div className="pill-list">
        {values.length > 0 ? values.map((value) => <span key={value}>{friendlyOwnership(value)}</span>) : <span>Not configured</span>}
      </div>
    </div>
  )
}

function GrantList({ grants }: { grants: PermissionGrant[] }) {
  return (
    <div className="permission-block compact">
      <strong>ACL grants</strong>
      <div className="grant-list">
        {grants.map((grant, index) => (
          <div className="grant-row" key={`${grant.permission || 'grant'}:${grant.id || grant.uri || index}`}>
            <span>{friendlyPermission(grant.permission)}</span>
            <strong>{friendlyGrantee(grant)}</strong>
          </div>
        ))}
        {grants.length === 0 ? <div className="empty-state compact">No ACL grants found</div> : null}
      </div>
    </div>
  )
}

function SampledObjectGrants({ objects }: { objects: PrefixObjectPermissions[] }) {
  return (
    <div className="permission-block compact">
      <strong>Objects checked in this folder</strong>
      <div className="sample-list">
        {objects.map((object) => (
          <div className="sample-row" key={object.key}>
            <span>{object.key}</span>
            <strong>{object.error || `${object.grants.length} ACL grant${object.grants.length === 1 ? '' : 's'}`}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function PermissionErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div className="permission-errors">
      {errors.map((error) => (
        <div key={error}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      ))}
    </div>
  )
}

function accessStatus(kind: Props['kind'], grants: PermissionGrant[], publicAccessBlock?: PublicAccessBlock, bucketPolicy?: string) {
  const hasPublicAcl = grants.some(isPublicGrant)
  const hasPolicy = Boolean(bucketPolicy?.trim())
  const publicBlockCount = publicAccessBlock ? Object.values(publicAccessBlock).filter(Boolean).length : 0

  if (kind === 'folder') {
    return {
      tone: hasPublicAcl ? 'warning' : 'neutral',
      label: hasPublicAcl ? 'Some objects may be public' : 'Prefix permissions sampled',
      description: 'S3 has no real folder permission. The app checks objects under this prefix.',
    }
  }

  if (hasPublicAcl) {
    return {
      tone: 'warning',
      label: 'Public ACL found',
      description: 'At least one ACL grants access outside the owner account.',
    }
  }

  if (kind === 'bucket' && hasPolicy) {
    return {
      tone: 'review',
      label: 'Bucket policy configured',
      description: 'A JSON policy can allow or deny access. Review it in advanced details.',
    }
  }

  if (kind === 'bucket' && publicBlockCount === 4) {
    return {
      tone: 'good',
      label: 'Public access blocked',
      description: 'All S3 public access guardrails are enabled for this bucket.',
    }
  }

  return {
    tone: 'neutral',
    label: 'No public ACL detected',
    description: 'Access may still be affected by IAM, bucket policy, or CloudFront.',
  }
}

function isPublicGrant(grant: PermissionGrant) {
  const uri = grant.uri || ''
  return uri.includes('AllUsers') || uri.includes('AuthenticatedUsers')
}

function friendlyPermission(value?: string) {
  if (!value) return '-'
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function friendlyGrantee(grant: PermissionGrant) {
  if (grant.uri?.includes('AllUsers')) return 'Everyone on the internet'
  if (grant.uri?.includes('AuthenticatedUsers')) return 'Any AWS authenticated user'
  return grant.display_name || grant.email_address || compactId(grant.id) || grant.grantee_type || '-'
}

function friendlyOwnership(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function compactId(value?: string) {
  if (!value) return undefined
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}
