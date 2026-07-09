import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, Loader2, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import type { PermissionGrant, PrefixObjectPermissions, PublicAccessBlock } from '../types'
import { SectionHeading, Button, IconButton, Input, Select, Card, EmptyState, CheckRow } from './ui'
import './PermissionsPanel.css'

const PERMISSIONS = ['READ', 'WRITE', 'READ_ACP', 'WRITE_ACP', 'FULL_CONTROL']
const GRANTEE_TYPES = ['CanonicalUser', 'Group', 'AmazonCustomerByEmail']
const GROUPS = [
  { label: 'Everyone', value: 'http://acs.amazonaws.com/groups/global/AllUsers' },
  { label: 'AWS authenticated users', value: 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers' },
  { label: 'Log delivery', value: 'http://acs.amazonaws.com/groups/s3/LogDelivery' },
]

type Props = {
  kind: 'bucket' | 'folder' | 'object'
  grants: PermissionGrant[]
  errors: string[]
  disabled?: boolean
  objectCount?: number
  sampledObjects?: PrefixObjectPermissions[]
  objectOwnership?: string[]
  publicAccessBlock?: PublicAccessBlock
  bucketPolicy?: string
  onSaveAclGrants: (grants: PermissionGrant[]) => void
  onLoadFolderPermissions?: () => void
  permissionsLoaded?: boolean
  loadingPermissions?: boolean
  onPublicAccessBlockChange?: (value: PublicAccessBlock) => void
  onSavePublicAccessBlock?: () => void
  onBucketPolicyChange?: (value: string) => void
  onSaveBucketPolicy?: () => void
  onDeleteBucketPolicy?: () => void
}

export function PermissionsPanel({
  kind,
  grants,
  errors,
  disabled,
  objectCount,
  sampledObjects,
  objectOwnership,
  publicAccessBlock,
  bucketPolicy,
  onSaveAclGrants,
  onLoadFolderPermissions,
  permissionsLoaded = kind !== 'folder',
  loadingPermissions,
  onPublicAccessBlockChange,
  onSavePublicAccessBlock,
  onBucketPolicyChange,
  onSaveBucketPolicy,
  onDeleteBucketPolicy,
}: Props) {
  const [draftGrants, setDraftGrants] = useState<PermissionGrant[]>(grants)
  const publicBlockCount = publicAccessBlock ? Object.values(publicAccessBlock).filter(Boolean).length : 0
  const hasMoreAwsSettings = kind === 'bucket' || kind === 'folder' || Boolean(sampledObjects && sampledObjects.length > 0)
  const showPrimaryAclTable = kind !== 'folder'

  useEffect(() => {
    setDraftGrants(grants)
  }, [grants])

  function updateGrant(index: number, nextGrant: PermissionGrant) {
    setDraftGrants((current) => current.map((grant, grantIndex) => (grantIndex === index ? nextGrant : grant)))
  }

  function addGrant() {
    setDraftGrants((current) => [
      ...current,
      {
        permission: 'READ',
        grantee_type: 'CanonicalUser',
        id: '',
      },
    ])
  }

  function removeGrant(index: number) {
    setDraftGrants((current) => current.filter((_, grantIndex) => grantIndex !== index))
  }

  return (
    <section className="permissions-panel">
      <SectionHeading icon={<ShieldCheck size={18} />} title="Permissions" count={permissionsLoaded ? draftGrants.length : undefined} />

      {kind === 'folder' && !permissionsLoaded ? (
        <div className="permission-note">
          Open more access settings to load object ACLs for this prefix.
        </div>
      ) : null}

      {showPrimaryAclTable ? (
        <AclTable
          grants={draftGrants}
          disabled={disabled}
          onAdd={addGrant}
          onSave={() => onSaveAclGrants(draftGrants)}
          onUpdate={updateGrant}
          onRemove={removeGrant}
        />
      ) : null}

      {hasMoreAwsSettings ? (
        <details
          className="advanced-permissions"
          onToggle={(event) => {
            if (kind === 'folder' && event.currentTarget.open && !permissionsLoaded && !loadingPermissions) {
              onLoadFolderPermissions?.()
            }
          }}
        >
          <summary>
            <ChevronDown size={15} />
            More AWS access settings
          </summary>
          <div className="advanced-permissions-body">
            {kind === 'folder' ? (
              <>
                {loadingPermissions ? (
                  <div className="permission-loading">
                    <Loader2 className="spin" size={16} />
                    <span>Loading folder ACLs</span>
                  </div>
                ) : null}
                {permissionsLoaded ? (
                  <>
                    <div className="permission-note">
                      S3 folders are prefixes. Saving this table applies it to {objectCount ?? 0} object
                      {objectCount === 1 ? '' : 's'} currently under this prefix.
                    </div>
                    <AclTable
                      grants={draftGrants}
                      disabled={disabled}
                      onAdd={addGrant}
                      onSave={() => onSaveAclGrants(draftGrants)}
                      onUpdate={updateGrant}
                      onRemove={removeGrant}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {kind === 'bucket' ? (
              <>
                <div className="permission-meta-grid">
                  <div className="permission-fact">
                    <span>Public guardrails</span>
                    <strong>{publicAccessBlock ? `${publicBlockCount}/4 enabled` : 'Not configured'}</strong>
                  </div>
                  <div className="permission-fact">
                    <span>Bucket policy</span>
                    <strong>{bucketPolicy ? 'Configured' : 'None'}</strong>
                  </div>
                </div>
                <BucketGuardrailsSummary
                  value={publicAccessBlock}
                  disabled={disabled}
                  onChange={onPublicAccessBlockChange}
                  onSave={onSavePublicAccessBlock}
                />
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
            {sampledObjects && sampledObjects.length > 0 ? <SampledObjectGrants objects={sampledObjects} /> : null}
          </div>
        </details>
      ) : null}

      <PermissionErrors errors={errors} />
    </section>
  )
}

function AclTable({
  grants,
  disabled,
  onAdd,
  onSave,
  onUpdate,
  onRemove,
}: {
  grants: PermissionGrant[]
  disabled?: boolean
  onAdd: () => void
  onSave: () => void
  onUpdate: (index: number, grant: PermissionGrant) => void
  onRemove: (index: number) => void
}) {
  return (
    <Card className="acl-table-card">
      <div className="permission-block-heading">
        <strong>ACL grants</strong>
        <div className="permission-actions">
          <Button size="sm" onClick={onAdd} disabled={disabled}>
            <Plus size={15} />
            Add
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={disabled}>
            <Save size={15} />
            Save
          </Button>
        </div>
      </div>
      <div className="acl-table">
        <div className="acl-row acl-head">
          <span>Permission</span>
          <span>Grantee</span>
          <span>Value</span>
          <span />
        </div>
        {grants.map((grant, index) => (
          <AclGrantRow
            key={`${grant.permission || 'grant'}:${grant.id || grant.uri || grant.email_address || index}`}
            grant={grant}
            disabled={disabled}
            onChange={(nextGrant) => onUpdate(index, nextGrant)}
            onRemove={() => onRemove(index)}
          />
        ))}
        {grants.length === 0 ? <EmptyState message="No ACL grants found" compact /> : null}
      </div>
    </Card>
  )
}

function AclGrantRow({
  grant,
  disabled,
  onChange,
  onRemove,
}: {
  grant: PermissionGrant
  disabled?: boolean
  onChange: (grant: PermissionGrant) => void
  onRemove: () => void
}) {
  const granteeType = grant.grantee_type || 'CanonicalUser'
  const value = granteeValue(grant)

  function updateType(nextType: string) {
    if (nextType === 'Group') {
      onChange({ permission: grant.permission, grantee_type: nextType, uri: GROUPS[0].value })
      return
    }
    if (nextType === 'AmazonCustomerByEmail') {
      onChange({ permission: grant.permission, grantee_type: nextType, email_address: '' })
      return
    }
    onChange({ permission: grant.permission, grantee_type: nextType, id: '' })
  }

  function updateValue(nextValue: string) {
    if (granteeType === 'Group') {
      onChange({ ...grant, uri: nextValue })
      return
    }
    if (granteeType === 'AmazonCustomerByEmail') {
      onChange({ ...grant, email_address: nextValue })
      return
    }
    onChange({ ...grant, id: nextValue })
  }

  return (
    <div className={`acl-row ${grantTone(grant)}`}>
      <Select value={grant.permission || 'READ'} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ ...grant, permission: event.target.value })} disabled={disabled}>
        {PERMISSIONS.map((permission) => (
          <option key={permission} value={permission}>
            {friendlyPermission(permission)}
          </option>
        ))}
      </Select>
      <Select value={granteeType} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateType(event.target.value)} disabled={disabled}>
        {GRANTEE_TYPES.map((type) => (
          <option key={type} value={type}>
            {friendlyGranteeType(type)}
          </option>
        ))}
      </Select>
      {granteeType === 'Group' ? (
        <Select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateValue(event.target.value)} disabled={disabled}>
          {GROUPS.map((group) => (
            <option key={group.value} value={group.value}>
              {group.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => updateValue(event.target.value)} disabled={disabled} placeholder={granteeType === 'AmazonCustomerByEmail' ? 'name@example.com' : 'Canonical user ID'} />
      )}
      <IconButton onClick={onRemove} disabled={disabled} title="Remove ACL grant">
        <Trash2 size={15} />
      </IconButton>
    </div>
  )
}

function granteeValue(grant: PermissionGrant) {
  if ((grant.grantee_type || 'CanonicalUser') === 'Group') return grant.uri || ''
  if (grant.grantee_type === 'AmazonCustomerByEmail') return grant.email_address || ''
  return grant.id || ''
}

function grantTone(grant: PermissionGrant) {
  if (grant.uri?.includes('AllUsers')) return 'public'
  if (grant.uri?.includes('AuthenticatedUsers')) return 'authenticated'
  if (grant.permission === 'FULL_CONTROL') return 'full'
  return 'standard'
}

function friendlyGranteeType(value: string) {
  if (value === 'CanonicalUser') return 'Canonical user'
  if (value === 'AmazonCustomerByEmail') return 'Email'
  return value
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
    <Card className="permission-block">
      <div className="permission-block-heading">
        <strong>Public access guardrails</strong>
        <Button variant="primary" size="sm" onClick={onSave} disabled={disabled}>
          <Save size={15} />
          Save
        </Button>
      </div>
      <CheckRow>
        <input type="checkbox" checked={Boolean(nextValue.block_public_acls)} onChange={(event: ChangeEvent<HTMLInputElement>) => update('block_public_acls', event.target.checked)} />
        <span>Block new public ACLs</span>
      </CheckRow>
      <CheckRow>
        <input type="checkbox" checked={Boolean(nextValue.ignore_public_acls)} onChange={(event: ChangeEvent<HTMLInputElement>) => update('ignore_public_acls', event.target.checked)} />
        <span>Ignore existing public ACLs</span>
      </CheckRow>
      <CheckRow>
        <input type="checkbox" checked={Boolean(nextValue.block_public_policy)} onChange={(event: ChangeEvent<HTMLInputElement>) => update('block_public_policy', event.target.checked)} />
        <span>Block public bucket policies</span>
      </CheckRow>
      <CheckRow>
        <input type="checkbox" checked={Boolean(nextValue.restrict_public_buckets)} onChange={(event: ChangeEvent<HTMLInputElement>) => update('restrict_public_buckets', event.target.checked)} />
        <span>Restrict public bucket policies</span>
      </CheckRow>
    </Card>
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
    <Card className="permission-block">
      <div className="permission-block-heading">
        <strong>Bucket policy JSON</strong>
        <div className="permission-actions">
          <Button size="sm" onClick={onDelete} disabled={disabled}>
            <Trash2 size={15} />
            Delete
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={disabled || value.trim().length === 0}>
            <Save size={15} />
            Save
          </Button>
        </div>
      </div>
      <textarea value={value} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)} spellCheck={false} />
    </Card>
  )
}

function OwnershipList({ values }: { values: string[] }) {
  return (
    <Card className="permission-block compact">
      <strong>Object ownership</strong>
      <div className="pill-list">
        {values.length > 0 ? values.map((value) => <span key={value}>{friendlyOwnership(value)}</span>) : <span>Not configured</span>}
      </div>
    </Card>
  )
}

function SampledObjectGrants({ objects }: { objects: PrefixObjectPermissions[] }) {
  return (
    <Card className="permission-block compact">
      <strong>Objects checked in this folder</strong>
      <div className="sample-list">
        {objects.map((object) => (
          <div className="sample-row" key={object.key}>
            <span>{object.key}</span>
            <strong>{object.error || `${object.grants.length} ACL grant${object.grants.length === 1 ? '' : 's'}`}</strong>
          </div>
        ))}
      </div>
    </Card>
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

function friendlyPermission(value?: string) {
  if (!value) return '-'
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function friendlyOwnership(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2')
}
