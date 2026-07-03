use crate::utils::error_message;
use aws_config::Region;
use aws_sdk_cloudfront::Client as CloudFrontClient;
use aws_sdk_s3::Client as S3Client;

pub async fn s3_client(profile: &str, region: &str) -> S3Client {
    let config = aws_config::from_env()
        .profile_name(profile)
        .region(Region::new(region.to_string()))
        .load()
        .await;
    S3Client::new(&config)
}

pub async fn s3_bucket_client(profile: &str, fallback_region: &str, bucket: &str) -> S3Client {
    let region = bucket_region(profile, fallback_region, bucket)
        .await
        .unwrap_or_else(|| fallback_region.to_string());
    s3_client(profile, &region).await
}

pub async fn cloudfront_client(profile: &str) -> CloudFrontClient {
    let config = aws_config::from_env()
        .profile_name(profile)
        .region(Region::new("us-east-1"))
        .load()
        .await;
    CloudFrontClient::new(&config)
}

async fn bucket_region(profile: &str, fallback_region: &str, bucket: &str) -> Option<String> {
    let client = s3_client(profile, fallback_region).await;
    let output = client
        .get_bucket_location()
        .bucket(bucket)
        .send()
        .await
        .ok()?;
    let raw = output
        .location_constraint()
        .map(|constraint| constraint.as_str().to_string())
        .unwrap_or_else(|| "us-east-1".to_string());
    Some(match raw.as_str() {
        "" => "us-east-1".to_string(),
        "EU" => "eu-west-1".to_string(),
        other => other.to_string(),
    })
}

#[allow(dead_code)]
fn map_sdk_error(error: impl ToString) -> String {
    error_message(error)
}
