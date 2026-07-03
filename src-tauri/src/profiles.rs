use crate::models::{AwsProfile, CommandResult};
use std::collections::BTreeMap;
use std::env;
use std::path::PathBuf;

#[tauri::command]
pub async fn list_profiles() -> CommandResult<Vec<AwsProfile>> {
    let mut profiles: BTreeMap<String, AwsProfile> = BTreeMap::new();

    if let Some(path) = aws_config_file("AWS_CONFIG_FILE", &[".aws", "config"]) {
        merge_profiles(&mut profiles, path, true).await?;
    }
    if let Some(path) = aws_config_file("AWS_SHARED_CREDENTIALS_FILE", &[".aws", "credentials"]) {
        merge_profiles(&mut profiles, path, false).await?;
    }
    if let Ok(profile) = env::var("AWS_PROFILE") {
        profiles.entry(profile.clone()).or_insert(AwsProfile {
            name: profile,
            region: None,
            source: "environment".to_string(),
        });
    }

    if profiles.is_empty() {
        profiles.insert(
            "default".to_string(),
            AwsProfile {
                name: "default".to_string(),
                region: Some("us-east-1".to_string()),
                source: "fallback".to_string(),
            },
        );
    }

    Ok(profiles.into_values().collect())
}

async fn merge_profiles(
    profiles: &mut BTreeMap<String, AwsProfile>,
    path: PathBuf,
    is_config: bool,
) -> CommandResult<()> {
    let Ok(content) = tokio::fs::read_to_string(&path).await else {
        return Ok(());
    };
    let source_name = if is_config { "config" } else { "credentials" };
    let mut current_profile: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let mut section = trimmed.trim_start_matches('[').trim_end_matches(']').trim();
            if is_config && section != "default" {
                section = section.strip_prefix("profile ").unwrap_or("");
            }
            current_profile = if section.is_empty() {
                None
            } else {
                let name = section.to_string();
                profiles.entry(name.clone()).or_insert(AwsProfile {
                    name: name.clone(),
                    region: None,
                    source: source_name.to_string(),
                });
                Some(name)
            };
            continue;
        }

        let Some(profile_name) = current_profile.as_ref() else {
            continue;
        };
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        let profile = profiles.get_mut(profile_name).expect("profile inserted");
        if !profile
            .source
            .split(", ")
            .any(|source| source == source_name)
        {
            profile.source = format!("{}, {}", profile.source, source_name);
        }
        if key.trim() == "region" {
            profile.region = Some(value.trim().to_string());
        }
    }

    Ok(())
}

fn aws_config_file(env_name: &str, fallback: &[&str]) -> Option<PathBuf> {
    if let Ok(path) = env::var(env_name) {
        return Some(PathBuf::from(path));
    }
    let mut path = home_dir()?;
    for part in fallback {
        path.push(part);
    }
    Some(path)
}

fn home_dir() -> Option<PathBuf> {
    if let Some(home) = env::var_os("HOME") {
        return Some(PathBuf::from(home));
    }
    if cfg!(windows) {
        if let Some(profile) = env::var_os("USERPROFILE") {
            return Some(PathBuf::from(profile));
        }
        if let (Some(drive), Some(path)) = (env::var_os("HOMEDRIVE"), env::var_os("HOMEPATH")) {
            let mut combined = PathBuf::from(drive);
            combined.push(path);
            return Some(combined);
        }
    }
    None
}
