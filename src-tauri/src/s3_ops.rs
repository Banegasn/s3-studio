use crate::aws_clients::{s3_bucket_client, s3_client};
use crate::models::{
    BucketPermissions, CommandResult, DeleteEntriesResult, DeletePrefixResult, DeleteResult,
    DownloadEntriesResult, DownloadPrefixResult, ListObjectsResponse, ObjectMetadata,
    ObjectPermissions, ObjectPreview, PermissionGrant, PermissionOwner, PermissionUpdateResult,
    PrefixObjectPermissions, PrefixPermissions, PreviewEncoding, PublicAccessBlock, S3Bucket,
    S3Entry, S3EntryKind, S3EntrySelection, UploadResult,
};
use crate::utils::{
    content_type_with_guess, date_to_string, error_message, non_negative_u64, normalize_prefix,
    should_render_base64, should_render_text,
};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{
    BucketCannedAcl, Delete, Grant, ObjectCannedAcl, ObjectIdentifier, Owner,
    PublicAccessBlockConfiguration,
};
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::task::JoinSet;

const S3_DELETE_OBJECTS_LIMIT: usize = 1000;
const MAX_CONCURRENT_DELETE_BATCHES: usize = 4;
const PREFIX_PERMISSION_SAMPLE_LIMIT: i32 = 25;

#[derive(Clone, Serialize)]
struct DeleteProgressPayload {
    id: String,
    bucket: String,
    phase: String,
    listed: usize,
    deleted: usize,
    total: Option<usize>,
    done: bool,
}

struct UploadPlan {
    source_path: PathBuf,
    key: String,
}

#[tauri::command]
pub async fn list_buckets(profile: String, region: String) -> CommandResult<Vec<S3Bucket>> {
    let client = s3_client(&profile, &region).await;
    let output = client.list_buckets().send().await.map_err(error_message)?;
    let mut buckets = output
        .buckets()
        .iter()
        .filter_map(|bucket| {
            let name = bucket.name()?.to_string();
            Some(S3Bucket {
                name,
                creation_date: date_to_string(bucket.creation_date()),
                region: None,
            })
        })
        .collect::<Vec<_>>();
    buckets.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(buckets)
}

#[tauri::command]
pub async fn list_objects(
    profile: String,
    region: String,
    bucket: String,
    prefix: String,
    continuation_token: Option<String>,
) -> CommandResult<ListObjectsResponse> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let normalized_prefix = normalize_prefix(&prefix);
    let mut request = client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix(&normalized_prefix)
        .delimiter("/")
        .max_keys(1000);

    if let Some(token) = continuation_token {
        request = request.continuation_token(token);
    }

    let output = request.send().await.map_err(error_message)?;
    let mut entries = Vec::new();

    for common_prefix in output.common_prefixes() {
        if let Some(folder_prefix) = common_prefix.prefix() {
            entries.push(S3Entry {
                key: folder_prefix.to_string(),
                name: folder_name(folder_prefix, &normalized_prefix),
                kind: S3EntryKind::Folder,
                size: None,
                last_modified: None,
                etag: None,
                storage_class: None,
            });
        }
    }

    for object in output.contents() {
        let Some(key) = object.key() else {
            continue;
        };
        if key == normalized_prefix {
            continue;
        }
        entries.push(S3Entry {
            key: key.to_string(),
            name: object_name(key, &normalized_prefix),
            kind: S3EntryKind::Object,
            size: non_negative_u64(object.size()),
            last_modified: date_to_string(object.last_modified()),
            etag: object.e_tag().map(ToString::to_string),
            storage_class: object
                .storage_class()
                .map(|class| class.as_str().to_string()),
        });
    }

    entries.sort_by(|left, right| match (&left.kind, &right.kind) {
        (S3EntryKind::Folder, S3EntryKind::Object) => std::cmp::Ordering::Less,
        (S3EntryKind::Object, S3EntryKind::Folder) => std::cmp::Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });

    Ok(ListObjectsResponse {
        bucket,
        prefix: normalized_prefix,
        entries,
        next_continuation_token: output.next_continuation_token().map(ToString::to_string),
        is_truncated: output.is_truncated().unwrap_or(false),
    })
}

#[tauri::command]
pub async fn get_object_metadata(
    profile: String,
    region: String,
    bucket: String,
    key: String,
) -> CommandResult<ObjectMetadata> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let output = client
        .head_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(error_message)?;

    let metadata = output
        .metadata()
        .map(|values| {
            values
                .iter()
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let resolved_content_type = content_type_with_guess(output.content_type(), Some(&key));

    Ok(ObjectMetadata {
        bucket,
        key,
        size: non_negative_u64(output.content_length()),
        last_modified: date_to_string(output.last_modified()),
        etag: output.e_tag().map(ToString::to_string),
        content_type: resolved_content_type,
        cache_control: output.cache_control().map(ToString::to_string),
        storage_class: output
            .storage_class()
            .map(|class| class.as_str().to_string()),
        metadata,
    })
}

#[tauri::command]
pub async fn get_object_preview(
    profile: String,
    region: String,
    bucket: String,
    key: String,
    max_bytes: u64,
) -> CommandResult<ObjectPreview> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let capped = max_bytes.max(1);
    let output = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .range(format!("bytes=0-{}", capped - 1))
        .send()
        .await
        .map_err(error_message)?;

    let size = non_negative_u64(output.content_length());
    let last_modified = date_to_string(output.last_modified());
    let etag = output.e_tag().map(ToString::to_string);
    let content_type = content_type_with_guess(output.content_type(), Some(&key));
    let bytes = output
        .body
        .collect()
        .await
        .map_err(error_message)?
        .into_bytes();
    let truncated = bytes.len() as u64 >= capped;

    if should_render_text(content_type.as_deref(), &key) {
        return Ok(ObjectPreview {
            bucket,
            key,
            size,
            content_type,
            last_modified,
            etag,
            encoding: PreviewEncoding::Text,
            text: Some(String::from_utf8_lossy(&bytes).to_string()),
            body_base64: None,
            truncated,
        });
    }

    if should_render_base64(content_type.as_deref()) {
        return Ok(ObjectPreview {
            bucket,
            key,
            size,
            content_type,
            last_modified,
            etag,
            encoding: PreviewEncoding::Base64,
            text: None,
            body_base64: Some(general_purpose::STANDARD.encode(&bytes)),
            truncated,
        });
    }

    Ok(ObjectPreview {
        bucket,
        key,
        size,
        content_type,
        last_modified,
        etag,
        encoding: PreviewEncoding::None,
        text: None,
        body_base64: None,
        truncated,
    })
}

#[tauri::command]
pub async fn download_object(
    profile: String,
    region: String,
    bucket: String,
    key: String,
    destination_path: String,
) -> CommandResult<String> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let output = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(error_message)?;
    let mut reader = output.body.into_async_read();
    let mut file = tokio::fs::File::create(&destination_path)
        .await
        .map_err(error_message)?;
    tokio::io::copy(&mut reader, &mut file)
        .await
        .map_err(error_message)?;
    Ok(destination_path)
}

#[tauri::command]
pub async fn download_prefix(
    profile: String,
    region: String,
    bucket: String,
    prefix: String,
    destination_path: String,
) -> CommandResult<DownloadPrefixResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let normalized_prefix = normalize_prefix(&prefix);
    let keys = list_keys_for_prefix(&client, &bucket, &normalized_prefix).await?;
    if keys.is_empty() {
        return Err("No objects found in this folder".to_string());
    }

    let destination_root = folder_download_root(&destination_path, &normalized_prefix);
    tokio::fs::create_dir_all(&destination_root)
        .await
        .map_err(error_message)?;

    let mut downloaded = 0;
    for key in keys {
        let relative = key
            .strip_prefix(&normalized_prefix)
            .filter(|value| !value.is_empty())
            .unwrap_or(&key);
        let local_path = destination_root.join(safe_relative_path(relative));
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(error_message)?;
        }
        let output = client
            .get_object()
            .bucket(&bucket)
            .key(&key)
            .send()
            .await
            .map_err(error_message)?;
        let mut reader = output.body.into_async_read();
        let mut file = tokio::fs::File::create(&local_path)
            .await
            .map_err(error_message)?;
        tokio::io::copy(&mut reader, &mut file)
            .await
            .map_err(error_message)?;
        downloaded += 1;
    }

    Ok(DownloadPrefixResult {
        bucket,
        prefix: normalized_prefix,
        destination_path: destination_root.to_string_lossy().to_string(),
        downloaded,
    })
}

#[tauri::command]
pub async fn download_entries(
    profile: String,
    region: String,
    bucket: String,
    entries: Vec<S3EntrySelection>,
    destination_path: String,
) -> CommandResult<DownloadEntriesResult> {
    if entries.is_empty() {
        return Err("No selected items to download".to_string());
    }

    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let destination_root = PathBuf::from(&destination_path);
    tokio::fs::create_dir_all(&destination_root)
        .await
        .map_err(error_message)?;

    let mut downloaded = 0;
    let mut seen_keys = BTreeSet::new();

    for entry in entries {
        match entry.kind.as_str() {
            "folder" => {
                let normalized_prefix = normalize_prefix(&entry.key);
                let folder_root = folder_download_root(&destination_path, &normalized_prefix);
                tokio::fs::create_dir_all(&folder_root)
                    .await
                    .map_err(error_message)?;
                for key in list_keys_for_prefix(&client, &bucket, &normalized_prefix).await? {
                    if !seen_keys.insert(key.clone()) {
                        continue;
                    }
                    let relative = key
                        .strip_prefix(&normalized_prefix)
                        .filter(|value| !value.is_empty())
                        .unwrap_or(&key);
                    download_key_to_path(
                        &client,
                        &bucket,
                        &key,
                        folder_root.join(safe_relative_path(relative)),
                    )
                    .await?;
                    downloaded += 1;
                }
            }
            "object" => {
                if !seen_keys.insert(entry.key.clone()) {
                    continue;
                }
                let local_path = destination_root.join(download_file_name(&entry.key));
                download_key_to_path(&client, &bucket, &entry.key, local_path).await?;
                downloaded += 1;
            }
            _ => return Err(format!("Unsupported selected item kind: {}", entry.kind)),
        }
    }

    Ok(DownloadEntriesResult {
        bucket,
        destination_path,
        downloaded,
    })
}

#[tauri::command]
pub async fn upload_file(
    profile: String,
    region: String,
    bucket: String,
    key: String,
    source_path: String,
    content_type: Option<String>,
) -> CommandResult<UploadResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let body = ByteStream::from_path(Path::new(&source_path))
        .await
        .map_err(error_message)?;
    let guessed_type = content_type.or_else(|| {
        mime_guess::from_path(&source_path)
            .first_raw()
            .map(ToString::to_string)
    });
    let mut request = client.put_object().bucket(&bucket).key(&key).body(body);
    if let Some(mime) = guessed_type {
        request = request.content_type(mime);
    }
    let output = request.send().await.map_err(error_message)?;
    Ok(UploadResult {
        bucket,
        key,
        etag: output.e_tag().map(ToString::to_string),
        version_id: output.version_id().map(ToString::to_string),
    })
}

#[tauri::command]
pub async fn upload_paths(
    profile: String,
    region: String,
    bucket: String,
    prefix: String,
    source_paths: Vec<String>,
) -> CommandResult<Vec<UploadResult>> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let plans = build_upload_plans(&prefix, &source_paths)?;
    let mut uploaded = Vec::with_capacity(plans.len());

    for plan in plans {
        let body = ByteStream::from_path(&plan.source_path)
            .await
            .map_err(error_message)?;
        let guessed_type = mime_guess::from_path(&plan.source_path)
            .first_raw()
            .map(ToString::to_string);
        let mut request = client
            .put_object()
            .bucket(&bucket)
            .key(&plan.key)
            .body(body);
        if let Some(mime) = guessed_type {
            request = request.content_type(mime);
        }
        let output = request.send().await.map_err(error_message)?;
        uploaded.push(UploadResult {
            bucket: bucket.clone(),
            key: plan.key,
            etag: output.e_tag().map(ToString::to_string),
            version_id: output.version_id().map(ToString::to_string),
        });
    }

    Ok(uploaded)
}

#[tauri::command]
pub async fn delete_object(
    profile: String,
    region: String,
    bucket: String,
    key: String,
) -> CommandResult<DeleteResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let output = client
        .delete_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(error_message)?;

    Ok(DeleteResult {
        bucket,
        key,
        version_id: output.version_id().map(ToString::to_string),
    })
}

#[tauri::command]
pub async fn delete_prefix(
    app_handle: tauri::AppHandle,
    profile: String,
    region: String,
    bucket: String,
    prefix: String,
    progress_id: Option<String>,
) -> CommandResult<DeletePrefixResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let normalized_prefix = normalize_prefix(&prefix);
    let progress = DeleteProgress::new(app_handle, bucket.clone(), progress_id, None);
    progress.emit("listing", 0, 0, false);
    let deleted = delete_prefix_keys(&client, &bucket, &normalized_prefix, &progress).await?;
    if deleted == 0 {
        return Err("No objects found in this folder".to_string());
    }
    progress.emit("complete", deleted, deleted, true);

    Ok(DeletePrefixResult {
        bucket,
        prefix: normalized_prefix,
        deleted,
    })
}

#[tauri::command]
pub async fn delete_entries(
    app_handle: tauri::AppHandle,
    profile: String,
    region: String,
    bucket: String,
    entries: Vec<S3EntrySelection>,
    progress_id: Option<String>,
) -> CommandResult<DeleteEntriesResult> {
    if entries.is_empty() {
        return Err("No selected items to delete".to_string());
    }

    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let mut keys = BTreeSet::new();
    let mut prefixes = Vec::new();

    for entry in entries {
        match entry.kind.as_str() {
            "folder" => {
                prefixes.push(normalize_prefix(&entry.key));
            }
            "object" => {
                keys.insert(entry.key);
            }
            _ => return Err(format!("Unsupported selected item kind: {}", entry.kind)),
        }
    }

    prefixes.sort();
    prefixes.dedup();
    let prefixes = prefixes
        .into_iter()
        .fold(Vec::<String>::new(), |mut deduped, prefix| {
            if !deduped.iter().any(|current| prefix.starts_with(current)) {
                deduped.push(prefix);
            }
            deduped
        });

    let standalone_keys: Vec<String> = keys
        .into_iter()
        .filter(|key| !prefixes.iter().any(|prefix| key.starts_with(prefix)))
        .collect();
    let known_total = if prefixes.is_empty() {
        Some(standalone_keys.len())
    } else {
        None
    };
    let progress = DeleteProgress::new(app_handle, bucket.clone(), progress_id, known_total);
    progress.emit("deleting", standalone_keys.len(), 0, false);
    let mut deleted = delete_keys(&client, &bucket, standalone_keys).await?;
    progress.add(deleted, deleted);
    progress.emit("deleting", deleted, deleted, false);
    for prefix in prefixes {
        deleted += delete_prefix_keys(&client, &bucket, &prefix, &progress).await?;
    }
    progress.emit("complete", deleted, deleted, true);

    Ok(DeleteEntriesResult { bucket, deleted })
}

#[tauri::command]
pub async fn get_bucket_permissions(
    profile: String,
    region: String,
    bucket: String,
) -> CommandResult<BucketPermissions> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let mut owner = None;
    let mut grants = Vec::new();
    let mut public_access_block = None;
    let mut bucket_policy = None;
    let mut object_ownership = Vec::new();
    let mut errors = Vec::new();

    match client.get_bucket_acl().bucket(&bucket).send().await {
        Ok(output) => {
            owner = owner_summary(output.owner());
            grants = output.grants().iter().map(grant_summary).collect();
        }
        Err(error) => errors.push(format!("Bucket ACL unavailable: {}", error_message(error))),
    }

    match client
        .get_public_access_block()
        .bucket(&bucket)
        .send()
        .await
    {
        Ok(output) => {
            public_access_block = output
                .public_access_block_configuration()
                .map(public_access_block_summary);
        }
        Err(error) => {
            let message = error_message(error);
            if !is_missing_configuration_error(&message) {
                errors.push(format!("Public access block unavailable: {message}"));
            }
        }
    }

    match client.get_bucket_policy().bucket(&bucket).send().await {
        Ok(output) => {
            bucket_policy = output.policy().map(ToString::to_string);
        }
        Err(error) => {
            let message = error_message(error);
            if !is_missing_configuration_error(&message) {
                errors.push(format!("Bucket policy unavailable: {message}"));
            }
        }
    }

    match client
        .get_bucket_ownership_controls()
        .bucket(&bucket)
        .send()
        .await
    {
        Ok(output) => {
            if let Some(controls) = output.ownership_controls() {
                object_ownership = controls
                    .rules()
                    .iter()
                    .map(|rule| rule.object_ownership().as_str().to_string())
                    .collect();
            }
        }
        Err(error) => {
            let message = error_message(error);
            if !is_missing_configuration_error(&message) {
                errors.push(format!("Object ownership controls unavailable: {message}"));
            }
        }
    }

    Ok(BucketPermissions {
        bucket,
        owner,
        grants,
        public_access_block,
        bucket_policy,
        object_ownership,
        errors,
    })
}

#[tauri::command]
pub async fn get_object_permissions(
    profile: String,
    region: String,
    bucket: String,
    key: String,
) -> CommandResult<ObjectPermissions> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    Ok(object_permissions_for_key(&client, &bucket, &key).await)
}

#[tauri::command]
pub async fn get_prefix_permissions(
    profile: String,
    region: String,
    bucket: String,
    prefix: String,
) -> CommandResult<PrefixPermissions> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let normalized_prefix = normalize_prefix(&prefix);
    let output = client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix(&normalized_prefix)
        .max_keys(PREFIX_PERMISSION_SAMPLE_LIMIT)
        .send()
        .await
        .map_err(error_message)?;
    let keys = output
        .contents()
        .iter()
        .filter_map(|object| object.key().map(ToString::to_string))
        .collect::<Vec<_>>();
    let mut sampled_objects = Vec::new();

    for key in &keys {
        let permissions = object_permissions_for_key(&client, &bucket, key).await;
        sampled_objects.push(PrefixObjectPermissions {
            key: key.to_string(),
            owner: permissions.owner,
            grants: permissions.grants,
            error: permissions.errors.first().cloned(),
        });
    }

    Ok(PrefixPermissions {
        bucket,
        prefix: normalized_prefix,
        object_count: keys.len(),
        object_count_truncated: output.is_truncated().unwrap_or(false),
        sampled_objects,
        errors: Vec::new(),
    })
}

#[tauri::command]
pub async fn set_bucket_canned_acl(
    profile: String,
    region: String,
    bucket: String,
    acl: String,
) -> CommandResult<PermissionUpdateResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let canned_acl = parse_bucket_acl(&acl)?;
    client
        .put_bucket_acl()
        .bucket(&bucket)
        .acl(canned_acl)
        .send()
        .await
        .map_err(error_message)?;

    Ok(PermissionUpdateResult {
        bucket,
        key: None,
        prefix: None,
        acl: Some(acl),
        updated: 1,
        message: "Bucket ACL updated".to_string(),
    })
}

#[tauri::command]
pub async fn set_object_canned_acl(
    profile: String,
    region: String,
    bucket: String,
    key: String,
    acl: String,
) -> CommandResult<PermissionUpdateResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let canned_acl = parse_object_acl(&acl)?;
    client
        .put_object_acl()
        .bucket(&bucket)
        .key(&key)
        .acl(canned_acl)
        .send()
        .await
        .map_err(error_message)?;

    Ok(PermissionUpdateResult {
        bucket,
        key: Some(key),
        prefix: None,
        acl: Some(acl),
        updated: 1,
        message: "Object ACL updated".to_string(),
    })
}

#[tauri::command]
pub async fn set_prefix_canned_acl(
    profile: String,
    region: String,
    bucket: String,
    prefix: String,
    acl: String,
) -> CommandResult<PermissionUpdateResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let canned_acl = parse_object_acl(&acl)?;
    let normalized_prefix = normalize_prefix(&prefix);
    let keys = list_keys_for_prefix(&client, &bucket, &normalized_prefix).await?;
    if keys.is_empty() {
        return Err("No objects found in this folder".to_string());
    }

    let mut updated = 0;
    for key in keys {
        client
            .put_object_acl()
            .bucket(&bucket)
            .key(&key)
            .acl(canned_acl.clone())
            .send()
            .await
            .map_err(error_message)?;
        updated += 1;
    }

    Ok(PermissionUpdateResult {
        bucket,
        key: None,
        prefix: Some(normalized_prefix),
        acl: Some(acl),
        updated,
        message: "Folder object ACLs updated".to_string(),
    })
}

#[tauri::command]
pub async fn set_bucket_policy(
    profile: String,
    region: String,
    bucket: String,
    policy: String,
) -> CommandResult<PermissionUpdateResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    client
        .put_bucket_policy()
        .bucket(&bucket)
        .policy(policy)
        .send()
        .await
        .map_err(error_message)?;

    Ok(PermissionUpdateResult {
        bucket,
        key: None,
        prefix: None,
        acl: None,
        updated: 1,
        message: "Bucket policy saved".to_string(),
    })
}

#[tauri::command]
pub async fn delete_bucket_policy(
    profile: String,
    region: String,
    bucket: String,
) -> CommandResult<PermissionUpdateResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    client
        .delete_bucket_policy()
        .bucket(&bucket)
        .send()
        .await
        .map_err(error_message)?;

    Ok(PermissionUpdateResult {
        bucket,
        key: None,
        prefix: None,
        acl: None,
        updated: 1,
        message: "Bucket policy deleted".to_string(),
    })
}

#[tauri::command]
pub async fn set_bucket_public_access_block(
    profile: String,
    region: String,
    bucket: String,
    public_access_block: PublicAccessBlock,
) -> CommandResult<PermissionUpdateResult> {
    let client = s3_bucket_client(&profile, &region, &bucket).await;
    let configuration = PublicAccessBlockConfiguration::builder()
        .set_block_public_acls(public_access_block.block_public_acls)
        .set_ignore_public_acls(public_access_block.ignore_public_acls)
        .set_block_public_policy(public_access_block.block_public_policy)
        .set_restrict_public_buckets(public_access_block.restrict_public_buckets)
        .build();

    client
        .put_public_access_block()
        .bucket(&bucket)
        .public_access_block_configuration(configuration)
        .send()
        .await
        .map_err(error_message)?;

    Ok(PermissionUpdateResult {
        bucket,
        key: None,
        prefix: None,
        acl: None,
        updated: 1,
        message: "Public access block saved".to_string(),
    })
}

async fn list_keys_for_prefix(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    prefix: &str,
) -> CommandResult<Vec<String>> {
    let mut token: Option<String> = None;
    let mut keys = Vec::new();

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix(prefix)
            .max_keys(1000);
        if let Some(next) = token.take() {
            request = request.continuation_token(next);
        }

        let output = request.send().await.map_err(error_message)?;
        for object in output.contents() {
            if let Some(key) = object.key() {
                keys.push(key.to_string());
            }
        }

        if output.is_truncated().unwrap_or(false) {
            token = output.next_continuation_token().map(ToString::to_string);
            if token.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    Ok(keys)
}

async fn delete_keys(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    keys: Vec<String>,
) -> CommandResult<usize> {
    let mut deleted = 0;

    for chunk in keys.chunks(S3_DELETE_OBJECTS_LIMIT) {
        deleted += delete_key_batch(client, bucket, chunk.to_vec()).await?;
    }

    Ok(deleted)
}

async fn delete_prefix_keys(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    prefix: &str,
    progress: &DeleteProgress,
) -> CommandResult<usize> {
    let mut token: Option<String> = None;
    let base_listed = progress.listed();
    let mut listed = 0;
    let mut deleted = 0;
    let mut delete_tasks = JoinSet::new();

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix(prefix)
            .max_keys(S3_DELETE_OBJECTS_LIMIT as i32);
        if let Some(next) = token.take() {
            request = request.continuation_token(next);
        }

        let output = request.send().await.map_err(error_message)?;
        let keys = output
            .contents()
            .iter()
            .filter_map(|object| object.key().map(ToString::to_string))
            .collect::<Vec<_>>();

        if !keys.is_empty() {
            listed += keys.len();
            progress.emit(
                "deleting",
                base_listed + listed,
                progress.deleted() + deleted,
                false,
            );
            spawn_delete_batch(&mut delete_tasks, client.clone(), bucket.to_string(), keys);
            if delete_tasks.len() >= MAX_CONCURRENT_DELETE_BATCHES {
                deleted += join_delete_batch(&mut delete_tasks).await?;
                progress.emit(
                    "deleting",
                    base_listed + listed,
                    progress.deleted() + deleted,
                    false,
                );
            }
        }

        if output.is_truncated().unwrap_or(false) {
            token = output.next_continuation_token().map(ToString::to_string);
            if token.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    while !delete_tasks.is_empty() {
        deleted += join_delete_batch(&mut delete_tasks).await?;
        progress.emit(
            "deleting",
            base_listed + listed,
            progress.deleted() + deleted,
            false,
        );
    }

    progress.add(listed, deleted);
    Ok(deleted)
}

fn spawn_delete_batch(
    delete_tasks: &mut JoinSet<CommandResult<usize>>,
    client: aws_sdk_s3::Client,
    bucket: String,
    keys: Vec<String>,
) {
    delete_tasks.spawn(async move { delete_key_batch(&client, &bucket, keys).await });
}

async fn join_delete_batch(
    delete_tasks: &mut JoinSet<CommandResult<usize>>,
) -> CommandResult<usize> {
    match delete_tasks.join_next().await {
        Some(Ok(result)) => result,
        Some(Err(error)) => Err(error_message(error)),
        None => Ok(0),
    }
}

async fn delete_key_batch(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    keys: Vec<String>,
) -> CommandResult<usize> {
    let objects = keys
        .iter()
        .map(|key| {
            ObjectIdentifier::builder()
                .key(key)
                .build()
                .map_err(error_message)
        })
        .collect::<CommandResult<Vec<_>>>()?;
    let delete = Delete::builder()
        .set_objects(Some(objects))
        .quiet(true)
        .build()
        .map_err(error_message)?;
    let output = client
        .delete_objects()
        .bucket(bucket)
        .delete(delete)
        .send()
        .await
        .map_err(error_message)?;

    if let Some(error) = output.errors().first() {
        let key = error.key().unwrap_or("unknown key");
        let message = error.message().unwrap_or("unknown delete error");
        return Err(format!("Failed to delete {key}: {message}"));
    }

    Ok(keys.len())
}

struct DeleteProgress {
    app_handle: tauri::AppHandle,
    bucket: String,
    id: Option<String>,
    total: Option<usize>,
    listed: std::sync::atomic::AtomicUsize,
    deleted: std::sync::atomic::AtomicUsize,
}

impl DeleteProgress {
    fn new(
        app_handle: tauri::AppHandle,
        bucket: String,
        id: Option<String>,
        total: Option<usize>,
    ) -> Self {
        Self {
            app_handle,
            bucket,
            id,
            total,
            listed: std::sync::atomic::AtomicUsize::new(0),
            deleted: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    fn listed(&self) -> usize {
        self.listed.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn deleted(&self) -> usize {
        self.deleted.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn add(&self, listed: usize, deleted: usize) {
        self.listed
            .fetch_add(listed, std::sync::atomic::Ordering::Relaxed);
        self.deleted
            .fetch_add(deleted, std::sync::atomic::Ordering::Relaxed);
    }

    fn emit(&self, phase: &str, listed: usize, deleted: usize, done: bool) {
        let Some(id) = &self.id else {
            return;
        };
        let _ = self.app_handle.emit(
            "s3-delete-progress",
            DeleteProgressPayload {
                id: id.clone(),
                bucket: self.bucket.clone(),
                phase: phase.to_string(),
                listed,
                deleted,
                total: self.total,
                done,
            },
        );
    }
}

fn build_upload_plans(prefix: &str, source_paths: &[String]) -> CommandResult<Vec<UploadPlan>> {
    let prefix = normalize_prefix(prefix);
    let mut plans = Vec::new();

    for source in source_paths {
        let path = PathBuf::from(source);
        if path.is_file() {
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| format!("Cannot determine file name for {}", path.display()))?
                .to_string();
            plans.push(UploadPlan {
                source_path: path,
                key: format!("{prefix}{}", normalize_key_part(&file_name)),
            });
            continue;
        }

        if path.is_dir() {
            let folder_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| format!("Cannot determine folder name for {}", path.display()))?;
            for entry in walkdir::WalkDir::new(&path)
                .into_iter()
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let relative = entry
                    .path()
                    .strip_prefix(&path)
                    .map_err(error_message)?
                    .components()
                    .filter_map(|component| component.as_os_str().to_str())
                    .map(normalize_key_part)
                    .collect::<Vec<_>>()
                    .join("/");
                plans.push(UploadPlan {
                    source_path: entry.path().to_path_buf(),
                    key: format!("{prefix}{}/{}", normalize_key_part(folder_name), relative),
                });
            }
            continue;
        }

        return Err(format!(
            "Dropped path does not exist or is not readable: {}",
            path.display()
        ));
    }

    if plans.is_empty() {
        return Err("No uploadable files were found".to_string());
    }

    Ok(plans)
}

fn folder_name(folder_prefix: &str, current_prefix: &str) -> String {
    folder_prefix
        .strip_prefix(current_prefix)
        .unwrap_or(folder_prefix)
        .trim_end_matches('/')
        .to_string()
}

fn object_name(key: &str, current_prefix: &str) -> String {
    key.strip_prefix(current_prefix).unwrap_or(key).to_string()
}

async fn download_key_to_path(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    local_path: PathBuf,
) -> CommandResult<()> {
    if let Some(parent) = local_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(error_message)?;
    }
    let output = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(error_message)?;
    let mut reader = output.body.into_async_read();
    let mut file = tokio::fs::File::create(&local_path)
        .await
        .map_err(error_message)?;
    tokio::io::copy(&mut reader, &mut file)
        .await
        .map_err(error_message)?;
    Ok(())
}

async fn object_permissions_for_key(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> ObjectPermissions {
    match client.get_object_acl().bucket(bucket).key(key).send().await {
        Ok(output) => ObjectPermissions {
            bucket: bucket.to_string(),
            key: key.to_string(),
            owner: owner_summary(output.owner()),
            grants: output.grants().iter().map(grant_summary).collect(),
            errors: Vec::new(),
        },
        Err(error) => ObjectPermissions {
            bucket: bucket.to_string(),
            key: key.to_string(),
            owner: None,
            grants: Vec::new(),
            errors: vec![error_message(error)],
        },
    }
}

fn owner_summary(owner: Option<&Owner>) -> Option<PermissionOwner> {
    owner.map(|owner| PermissionOwner {
        display_name: owner.display_name().map(ToString::to_string),
        id: owner.id().map(ToString::to_string),
    })
}

fn grant_summary(grant: &Grant) -> PermissionGrant {
    let grantee = grant.grantee();
    PermissionGrant {
        permission: grant.permission().map(|value| value.as_str().to_string()),
        grantee_type: grantee.map(|value| value.r#type().as_str().to_string()),
        display_name: grantee.and_then(|value| value.display_name().map(ToString::to_string)),
        email_address: grantee.and_then(|value| value.email_address().map(ToString::to_string)),
        id: grantee.and_then(|value| value.id().map(ToString::to_string)),
        uri: grantee.and_then(|value| value.uri().map(ToString::to_string)),
    }
}

fn public_access_block_summary(
    configuration: &PublicAccessBlockConfiguration,
) -> PublicAccessBlock {
    PublicAccessBlock {
        block_public_acls: configuration.block_public_acls(),
        ignore_public_acls: configuration.ignore_public_acls(),
        block_public_policy: configuration.block_public_policy(),
        restrict_public_buckets: configuration.restrict_public_buckets(),
    }
}

fn parse_bucket_acl(acl: &str) -> CommandResult<BucketCannedAcl> {
    match acl {
        "authenticated-read" | "private" | "public-read" | "public-read-write" => {
            Ok(BucketCannedAcl::from(acl))
        }
        _ => Err(format!("Unsupported bucket ACL: {acl}")),
    }
}

fn parse_object_acl(acl: &str) -> CommandResult<ObjectCannedAcl> {
    match acl {
        "authenticated-read"
        | "aws-exec-read"
        | "bucket-owner-full-control"
        | "bucket-owner-read"
        | "private"
        | "public-read"
        | "public-read-write" => Ok(ObjectCannedAcl::from(acl)),
        _ => Err(format!("Unsupported object ACL: {acl}")),
    }
}

fn is_missing_configuration_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("nosuchbucketpolicy")
        || lower.contains("nosuchpublicaccessblockconfiguration")
        || lower.contains("ownershipcontrolsnotfound")
        || lower.contains("not found")
}

fn normalize_key_part(value: &str) -> String {
    value.replace('\\', "/").trim_matches('/').to_string()
}

fn folder_download_root(destination_path: &str, prefix: &str) -> PathBuf {
    let base = PathBuf::from(destination_path);
    let folder_name = prefix
        .trim_end_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back();
    match folder_name {
        Some(name) => base.join(normalize_key_part(name)),
        None => base,
    }
}

fn download_file_name(key: &str) -> PathBuf {
    let name = key
        .trim_end_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or("download");
    safe_relative_path(name)
}

fn safe_relative_path(key: &str) -> PathBuf {
    key.split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .fold(PathBuf::new(), |mut path, part| {
            path.push(part);
            path
        })
}
