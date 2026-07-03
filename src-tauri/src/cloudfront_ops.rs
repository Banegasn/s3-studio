use crate::aws_clients::cloudfront_client;
use crate::models::{CloudFrontOrigin, CommandResult, InvalidationResult, LinkedDistribution};
use crate::utils::error_message;
use aws_sdk_cloudfront::types::{InvalidationBatch, Paths};
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn find_linked_distributions(
    profile: String,
    region: String,
    bucket: String,
    key: String,
) -> CommandResult<Vec<LinkedDistribution>> {
    let client = cloudfront_client(&profile).await;
    let mut marker: Option<String> = None;
    let mut links = Vec::new();
    let mut seen = HashSet::new();

    loop {
        let mut request = client.list_distributions();
        if let Some(value) = marker.take() {
            request = request.marker(value);
        }
        let output = request.send().await.map_err(error_message)?;
        let Some(list) = output.distribution_list() else {
            break;
        };

        for distribution in list.items() {
            let distribution_id = distribution.id();
            if seen.contains(distribution_id) {
                continue;
            }
            let Some(origins) = distribution.origins() else {
                continue;
            };
            for origin in origins.items() {
                let origin_domain = origin.domain_name();
                let origin_path = clean_origin_path(origin.origin_path());
                if !origin_matches_bucket(origin_domain, origin_path.as_deref(), &bucket, &region) {
                    continue;
                }
                let origin_id = origin.id();
                let invalidation_path = invalidation_path_for_key(origin_path.as_deref(), &key);
                let Some(behavior_path) =
                    matching_behavior_path(distribution, origin_id, &invalidation_path)
                else {
                    continue;
                };
                seen.insert(distribution_id.to_string());
                links.push(LinkedDistribution {
                    id: distribution_id.to_string(),
                    arn: Some(distribution.arn().to_string()),
                    domain_name: distribution.domain_name().to_string(),
                    status: Some(distribution.status().to_string()),
                    enabled: distribution.enabled(),
                    aliases: distribution
                        .aliases()
                        .map(|aliases| aliases.items().to_vec())
                        .unwrap_or_default(),
                    matched_origin: CloudFrontOrigin {
                        id: origin_id.to_string(),
                        domain_name: origin_domain.to_string(),
                        origin_path,
                    },
                    behavior_path,
                    invalidation_path,
                });
                break;
            }
        }

        if list.is_truncated() {
            marker = list.next_marker().map(ToString::to_string);
            if marker.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    links.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(links)
}

#[tauri::command]
pub async fn create_invalidation(
    profile: String,
    distribution_id: String,
    paths: Vec<String>,
) -> CommandResult<InvalidationResult> {
    let client = cloudfront_client(&profile).await;
    let normalized_paths = paths
        .into_iter()
        .filter(|path| !path.trim().is_empty())
        .map(|path| normalize_invalidation_path(&path))
        .collect::<Vec<_>>();

    if normalized_paths.is_empty() {
        return Err("At least one invalidation path is required".to_string());
    }

    let invalidation_paths = Paths::builder()
        .set_items(Some(normalized_paths.clone()))
        .quantity(normalized_paths.len() as i32)
        .build()
        .map_err(error_message)?;
    let batch = InvalidationBatch::builder()
        .caller_reference(format!("s3-cloudfront-studio-{}", now_millis()))
        .paths(invalidation_paths)
        .build()
        .map_err(error_message)?;

    let output = client
        .create_invalidation()
        .distribution_id(&distribution_id)
        .invalidation_batch(batch)
        .send()
        .await
        .map_err(error_message)?;

    let invalidation = output.invalidation();
    Ok(InvalidationResult {
        distribution_id,
        invalidation_id: invalidation.map(|item| item.id().to_string()),
        status: invalidation.map(|item| item.status().to_string()),
        location: output.location().map(ToString::to_string),
        paths: normalized_paths,
        create_time: invalidation.map(|item| item.create_time().to_string()),
    })
}

fn clean_origin_path(origin_path: Option<&str>) -> Option<String> {
    origin_path.and_then(|path| {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn origin_matches_bucket(
    domain: &str,
    origin_path: Option<&str>,
    bucket: &str,
    region: &str,
) -> bool {
    let domain = domain.to_ascii_lowercase();
    let bucket = bucket.to_ascii_lowercase();
    let expected_regional = format!("{bucket}.s3.{region}.amazonaws.com").to_ascii_lowercase();
    let expected_global = format!("{bucket}.s3.amazonaws.com").to_ascii_lowercase();
    let expected_dualstack =
        format!("{bucket}.s3.dualstack.{region}.amazonaws.com").to_ascii_lowercase();
    let bucket_origin_path = format!("/{bucket}");

    domain == expected_global
        || domain == expected_regional
        || domain == expected_dualstack
        || domain.starts_with(&format!("{bucket}.s3-website"))
        || domain.starts_with(&format!("{bucket}.s3."))
        || domain.starts_with(&format!("{bucket}.s3-"))
        || (domain == "s3.amazonaws.com" && origin_path == Some(bucket_origin_path.as_str()))
        || (domain.starts_with("s3.") && origin_path == Some(bucket_origin_path.as_str()))
}

fn invalidation_path_for_key(origin_path: Option<&str>, key: &str) -> String {
    let origin_prefix = origin_path
        .map(|path| path.trim_matches('/').to_string())
        .unwrap_or_default();
    let viewer_key = if !origin_prefix.is_empty() {
        key.strip_prefix(&format!("{origin_prefix}/"))
            .unwrap_or(key)
    } else {
        key
    };
    normalize_invalidation_path(viewer_key)
}

fn normalize_invalidation_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn matching_behavior_path(
    distribution: &aws_sdk_cloudfront::types::DistributionSummary,
    origin_id: &str,
    invalidation_path: &str,
) -> Option<String> {
    let viewer_path = invalidation_path.trim_start_matches('/');
    let mut best_match: Option<String> = None;

    if let Some(cache_behaviors) = distribution.cache_behaviors() {
        for behavior in cache_behaviors.items() {
            if behavior.target_origin_id() != origin_id {
                continue;
            }
            let pattern = behavior.path_pattern();
            if wildcard_match(pattern, viewer_path) || wildcard_match(pattern, invalidation_path) {
                if best_match
                    .as_ref()
                    .map(|current| pattern.len() > current.len())
                    .unwrap_or(true)
                {
                    best_match = Some(pattern.to_string());
                }
            }
        }
    }

    if best_match.is_some() {
        return best_match;
    }

    if distribution
        .default_cache_behavior()
        .map(|behavior| behavior.target_origin_id())
        == Some(origin_id)
    {
        return Some("*".to_string());
    }

    None
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    let pattern = pattern.as_bytes();
    let value = value.as_bytes();
    let (mut pattern_index, mut value_index) = (0, 0);
    let mut star_index: Option<usize> = None;
    let mut star_value_index = 0;

    while value_index < value.len() {
        if pattern_index < pattern.len() && pattern[pattern_index] == value[value_index] {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
            star_index = Some(pattern_index);
            pattern_index += 1;
            star_value_index = value_index;
        } else if let Some(index) = star_index {
            pattern_index = index + 1;
            star_value_index += 1;
            value_index = star_value_index;
        } else {
            return false;
        }
    }

    while pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
        pattern_index += 1;
    }

    pattern_index == pattern.len()
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
