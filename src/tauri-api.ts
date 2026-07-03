import { invoke } from '@tauri-apps/api/core'
import type {
  AwsProfile,
  BucketPermissions,
  DeleteEntriesResult,
  DeletePrefixResult,
  DeleteResult,
  DownloadEntriesResult,
  DownloadPrefixResult,
  InvalidationResult,
  LinkedDistribution,
  ListObjectsResponse,
  ObjectMetadata,
  ObjectPermissions,
  ObjectPreview,
  PermissionUpdateResult,
  PrefixPermissions,
  PublicAccessBlock,
  S3Bucket,
  S3EntrySelection,
  UploadResult,
} from './types'

export type AwsContext = {
  profile: string
  region: string
}

export function listProfiles() {
  return invoke<AwsProfile[]>('list_profiles')
}

export function listBuckets(context: AwsContext) {
  return invoke<S3Bucket[]>('list_buckets', context)
}

export function listObjects(
  context: AwsContext & {
    bucket: string
    prefix: string
    continuationToken?: string
  },
) {
  return invoke<ListObjectsResponse>('list_objects', context)
}

export function getObjectMetadata(
  context: AwsContext & {
    bucket: string
    key: string
  },
) {
  return invoke<ObjectMetadata>('get_object_metadata', context)
}

export function getObjectPreview(
  context: AwsContext & {
    bucket: string
    key: string
    maxBytes: number
  },
) {
  return invoke<ObjectPreview>('get_object_preview', context)
}

export function downloadObject(
  context: AwsContext & {
    bucket: string
    key: string
    destinationPath: string
  },
) {
  return invoke<string>('download_object', context)
}

export function downloadPrefix(
  context: AwsContext & {
    bucket: string
    prefix: string
    destinationPath: string
  },
) {
  return invoke<DownloadPrefixResult>('download_prefix', context)
}

export function downloadEntries(
  context: AwsContext & {
    bucket: string
    entries: S3EntrySelection[]
    destinationPath: string
  },
) {
  return invoke<DownloadEntriesResult>('download_entries', context)
}

export function uploadFile(
  context: AwsContext & {
    bucket: string
    key: string
    sourcePath: string
    contentType?: string
  },
) {
  return invoke<UploadResult>('upload_file', context)
}

export function uploadPaths(
  context: AwsContext & {
    bucket: string
    prefix: string
    sourcePaths: string[]
  },
) {
  return invoke<UploadResult[]>('upload_paths', context)
}

export function deleteObject(
  context: AwsContext & {
    bucket: string
    key: string
  },
) {
  return invoke<DeleteResult>('delete_object', context)
}

export function deletePrefix(
  context: AwsContext & {
    bucket: string
    prefix: string
  },
) {
  return invoke<DeletePrefixResult>('delete_prefix', context)
}

export function deleteEntries(
  context: AwsContext & {
    bucket: string
    entries: S3EntrySelection[]
  },
) {
  return invoke<DeleteEntriesResult>('delete_entries', context)
}

export function getBucketPermissions(context: AwsContext & { bucket: string }) {
  return invoke<BucketPermissions>('get_bucket_permissions', context)
}

export function getObjectPermissions(
  context: AwsContext & {
    bucket: string
    key: string
  },
) {
  return invoke<ObjectPermissions>('get_object_permissions', context)
}

export function getPrefixPermissions(
  context: AwsContext & {
    bucket: string
    prefix: string
  },
) {
  return invoke<PrefixPermissions>('get_prefix_permissions', context)
}

export function setBucketCannedAcl(
  context: AwsContext & {
    bucket: string
    acl: string
  },
) {
  return invoke<PermissionUpdateResult>('set_bucket_canned_acl', context)
}

export function setObjectCannedAcl(
  context: AwsContext & {
    bucket: string
    key: string
    acl: string
  },
) {
  return invoke<PermissionUpdateResult>('set_object_canned_acl', context)
}

export function setPrefixCannedAcl(
  context: AwsContext & {
    bucket: string
    prefix: string
    acl: string
  },
) {
  return invoke<PermissionUpdateResult>('set_prefix_canned_acl', context)
}

export function setBucketPolicy(
  context: AwsContext & {
    bucket: string
    policy: string
  },
) {
  return invoke<PermissionUpdateResult>('set_bucket_policy', context)
}

export function deleteBucketPolicy(context: AwsContext & { bucket: string }) {
  return invoke<PermissionUpdateResult>('delete_bucket_policy', context)
}

export function setBucketPublicAccessBlock(
  context: AwsContext & {
    bucket: string
    publicAccessBlock: PublicAccessBlock
  },
) {
  return invoke<PermissionUpdateResult>('set_bucket_public_access_block', context)
}

export function findLinkedDistributions(
  context: AwsContext & {
    bucket: string
    key: string
  },
) {
  return invoke<LinkedDistribution[]>('find_linked_distributions', context)
}

export function createInvalidation(
  context: Pick<AwsContext, 'profile'> & {
    distributionId: string
    paths: string[]
  },
) {
  return invoke<InvalidationResult>('create_invalidation', context)
}

export function openDevtools() {
  return invoke<void>('open_devtools')
}
