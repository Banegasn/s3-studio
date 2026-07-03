use std::path::Path;

pub fn error_message(error: impl ToString) -> String {
    error.to_string()
}

pub fn normalize_prefix(prefix: &str) -> String {
    let clean = prefix.trim_start_matches('/');
    if clean.is_empty() || clean.ends_with('/') {
        clean.to_string()
    } else {
        format!("{clean}/")
    }
}

pub fn non_negative_u64(value: Option<i64>) -> Option<u64> {
    value.and_then(|number| u64::try_from(number).ok())
}

pub fn date_to_string<T: ToString>(value: Option<&T>) -> Option<String> {
    value.map(ToString::to_string)
}

pub fn content_type_with_guess(content_type: Option<&str>, key: Option<&str>) -> Option<String> {
    content_type.map(ToString::to_string).or_else(|| {
        key.and_then(|value| {
            mime_guess::from_path(value)
                .first_raw()
                .map(ToString::to_string)
        })
    })
}

pub fn should_render_text(content_type: Option<&str>, key: &str) -> bool {
    if let Some(value) = content_type {
        let mime = value.to_ascii_lowercase();
        if mime.starts_with("text/")
            || mime.contains("json")
            || mime.contains("xml")
            || mime.contains("yaml")
            || mime.contains("javascript")
        {
            return true;
        }
    }
    matches!(
        Path::new(key).extension().and_then(|value| value.to_str()),
        Some(
            "txt"
                | "md"
                | "json"
                | "yaml"
                | "yml"
                | "toml"
                | "csv"
                | "tsv"
                | "xml"
                | "html"
                | "css"
                | "js"
                | "ts"
        )
    )
}

pub fn should_render_base64(content_type: Option<&str>) -> bool {
    let Some(value) = content_type else {
        return false;
    };
    let mime = value.to_ascii_lowercase();
    mime.starts_with("image/")
        || mime == "application/pdf"
        || mime.starts_with("audio/")
        || mime.starts_with("video/")
}
