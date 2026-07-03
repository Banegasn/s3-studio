export type AwsProfile = {
  name: string
  region?: string
  source: string
}

export type S3Bucket = {
  name: string
  creation_date?: string
  region?: string
}

export type S3EntryKind = 'folder' | 'object'

export type S3Entry = {
  key: string
  name: string
  kind: S3EntryKind
  size?: number
  last_modified?: string
  etag?: string
  storage_class?: string
}

export type ListObjectsResponse = {
  bucket: string
  prefix: string
  entries: S3Entry[]
  next_continuation_token?: string
  is_truncated: boolean
}

export type ObjectMetadata = {
  bucket: string
  key: string
  size?: number
  last_modified?: string
  etag?: string
  content_type?: string
  cache_control?: string
  storage_class?: string
  metadata: Record<string, string>
}

export type ObjectPreview = {
  bucket: string
  key: string
  size?: number
  content_type?: string
  last_modified?: string
  etag?: string
  encoding: 'text' | 'base64' | 'none'
  text?: string
  body_base64?: string
  truncated: boolean
}

export type CloudFrontOrigin = {
  id: string
  domain_name: string
  origin_path?: string
}

export type LinkedDistribution = {
  id: string
  arn?: string
  domain_name: string
  status?: string
  enabled: boolean
  aliases: string[]
  matched_origin: CloudFrontOrigin
  behavior_path: string
  invalidation_path: string
}

export type InvalidationResult = {
  distribution_id: string
  invalidation_id?: string
  status?: string
  location?: string
  paths: string[]
  create_time?: string
}

export type UploadResult = {
  bucket: string
  key: string
  etag?: string
  version_id?: string
}

export type DeleteResult = {
  bucket: string
  key: string
  version_id?: string
}

export type DeletePrefixResult = {
  bucket: string
  prefix: string
  deleted: number
}

export type DeleteEntriesResult = {
  bucket: string
  deleted: number
}

export type DownloadPrefixResult = {
  bucket: string
  prefix: string
  destination_path: string
  downloaded: number
}

export type DownloadEntriesResult = {
  bucket: string
  destination_path: string
  downloaded: number
}

export type S3EntrySelection = {
  key: string
  kind: S3EntryKind
}

export type PermissionOwner = {
  display_name?: string
  id?: string
}

export type PermissionGrant = {
  permission?: string
  grantee_type?: string
  display_name?: string
  email_address?: string
  id?: string
  uri?: string
}

export type PublicAccessBlock = {
  block_public_acls?: boolean
  ignore_public_acls?: boolean
  block_public_policy?: boolean
  restrict_public_buckets?: boolean
}

export type BucketPermissions = {
  bucket: string
  owner?: PermissionOwner
  grants: PermissionGrant[]
  public_access_block?: PublicAccessBlock
  bucket_policy?: string
  object_ownership: string[]
  errors: string[]
}

export type ObjectPermissions = {
  bucket: string
  key: string
  owner?: PermissionOwner
  grants: PermissionGrant[]
  errors: string[]
}

export type PrefixObjectPermissions = {
  key: string
  owner?: PermissionOwner
  grants: PermissionGrant[]
  error?: string
}

export type PrefixPermissions = {
  bucket: string
  prefix: string
  object_count: number
  sampled_objects: PrefixObjectPermissions[]
  errors: string[]
}

export type PermissionUpdateResult = {
  bucket: string
  key?: string
  prefix?: string
  acl?: string
  updated: number
  message: string
}

export type ToastKind = 'info' | 'success' | 'error'

export type Toast = {
  id: number
  kind: ToastKind
  message: string
}
