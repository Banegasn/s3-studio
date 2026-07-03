use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type CommandResult<T> = Result<T, String>;

#[derive(Clone, Serialize)]
pub struct AwsProfile {
    pub name: String,
    pub region: Option<String>,
    pub source: String,
}

#[derive(Serialize)]
pub struct S3Bucket {
    pub name: String,
    pub creation_date: Option<String>,
    pub region: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum S3EntryKind {
    Folder,
    Object,
}

#[derive(Serialize)]
pub struct S3Entry {
    pub key: String,
    pub name: String,
    pub kind: S3EntryKind,
    pub size: Option<u64>,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub storage_class: Option<String>,
}

#[derive(Serialize)]
pub struct ListObjectsResponse {
    pub bucket: String,
    pub prefix: String,
    pub entries: Vec<S3Entry>,
    pub next_continuation_token: Option<String>,
    pub is_truncated: bool,
}

#[derive(Serialize)]
pub struct ObjectMetadata {
    pub bucket: String,
    pub key: String,
    pub size: Option<u64>,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub content_type: Option<String>,
    pub cache_control: Option<String>,
    pub storage_class: Option<String>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewEncoding {
    Text,
    Base64,
    None,
}

#[derive(Serialize)]
pub struct ObjectPreview {
    pub bucket: String,
    pub key: String,
    pub size: Option<u64>,
    pub content_type: Option<String>,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub encoding: PreviewEncoding,
    pub text: Option<String>,
    pub body_base64: Option<String>,
    pub truncated: bool,
}

#[derive(Clone, Serialize)]
pub struct CloudFrontOrigin {
    pub id: String,
    pub domain_name: String,
    pub origin_path: Option<String>,
}

#[derive(Serialize)]
pub struct LinkedDistribution {
    pub id: String,
    pub arn: Option<String>,
    pub domain_name: String,
    pub status: Option<String>,
    pub enabled: bool,
    pub aliases: Vec<String>,
    pub matched_origin: CloudFrontOrigin,
    pub behavior_path: String,
    pub invalidation_path: String,
}

#[derive(Serialize)]
pub struct InvalidationResult {
    pub distribution_id: String,
    pub invalidation_id: Option<String>,
    pub status: Option<String>,
    pub location: Option<String>,
    pub paths: Vec<String>,
    pub create_time: Option<String>,
}

#[derive(Serialize)]
pub struct UploadResult {
    pub bucket: String,
    pub key: String,
    pub etag: Option<String>,
    pub version_id: Option<String>,
}

#[derive(Serialize)]
pub struct DeleteResult {
    pub bucket: String,
    pub key: String,
    pub version_id: Option<String>,
}

#[derive(Serialize)]
pub struct DeletePrefixResult {
    pub bucket: String,
    pub prefix: String,
    pub deleted: usize,
}

#[derive(Serialize)]
pub struct DownloadPrefixResult {
    pub bucket: String,
    pub prefix: String,
    pub destination_path: String,
    pub downloaded: usize,
}

#[derive(Clone, Deserialize)]
pub struct S3EntrySelection {
    pub key: String,
    pub kind: String,
}

#[derive(Serialize)]
pub struct DownloadEntriesResult {
    pub bucket: String,
    pub destination_path: String,
    pub downloaded: usize,
}

#[derive(Serialize)]
pub struct DeleteEntriesResult {
    pub bucket: String,
    pub deleted: usize,
}

#[derive(Clone, Serialize)]
pub struct PermissionOwner {
    pub display_name: Option<String>,
    pub id: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct PermissionGrant {
    pub permission: Option<String>,
    pub grantee_type: Option<String>,
    pub display_name: Option<String>,
    pub email_address: Option<String>,
    pub id: Option<String>,
    pub uri: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct PublicAccessBlock {
    pub block_public_acls: Option<bool>,
    pub ignore_public_acls: Option<bool>,
    pub block_public_policy: Option<bool>,
    pub restrict_public_buckets: Option<bool>,
}

#[derive(Serialize)]
pub struct BucketPermissions {
    pub bucket: String,
    pub owner: Option<PermissionOwner>,
    pub grants: Vec<PermissionGrant>,
    pub public_access_block: Option<PublicAccessBlock>,
    pub bucket_policy: Option<String>,
    pub object_ownership: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct ObjectPermissions {
    pub bucket: String,
    pub key: String,
    pub owner: Option<PermissionOwner>,
    pub grants: Vec<PermissionGrant>,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
pub struct PrefixObjectPermissions {
    pub key: String,
    pub owner: Option<PermissionOwner>,
    pub grants: Vec<PermissionGrant>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct PrefixPermissions {
    pub bucket: String,
    pub prefix: String,
    pub object_count: usize,
    pub object_count_truncated: bool,
    pub sampled_objects: Vec<PrefixObjectPermissions>,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
pub struct PermissionUpdateResult {
    pub bucket: String,
    pub key: Option<String>,
    pub prefix: Option<String>,
    pub acl: Option<String>,
    pub updated: usize,
    pub message: String,
}
