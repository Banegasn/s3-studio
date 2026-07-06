# S3 Studio

Cross-platform Tauri desktop app for browsing S3 and invalidating linked CloudFront distributions with local AWS CLI credentials.

## Features

- Reads AWS CLI profiles from `~/.aws/config`, `~/.aws/credentials`, `AWS_PROFILE`, `AWS_CONFIG_FILE`, and `AWS_SHARED_CREDENTIALS_FILE`.
- Lists buckets and browses S3 prefixes with folder-style navigation and a dedicated bucket/folder/object details pane.
- Previews text, JSON, XML, HTML, CSS, JavaScript, images, and PDFs up to a 1 MB range request.
- Uploads local files or whole local folders into the current S3 prefix.
- Supports dragging files or folders from Finder or Explorer into the object browser to upload.
- Selects multiple S3 folders and objects with checkboxes, Shift-click, keyboard ranges, or Cmd/Ctrl+A.
- Downloads or deletes selected objects and selected prefixes after confirmation.
- Finds CloudFront distributions whose origins point at the selected object bucket.
- Suggests an invalidation path by accounting for CloudFront origin paths.
- Creates object-level, folder wildcard, or multi-selection CloudFront invalidations.
- Summarizes S3 permissions in plain language while keeping raw ACL grants, bucket policy JSON, and public-access guardrails available under advanced details.

## Development

Install dependencies:

```sh
pnpm install
```

Run the web build:

```sh
pnpm run build
```

Run the desktop app in development:

```sh
pnpm run desktop:dev
```

Build the desktop app for the current platform:

```sh
pnpm run desktop:build
```

Tauri builds are platform-native. Run the build command on macOS for `.app`/`.dmg` output and on Windows for Windows installer output.

## AWS Permissions

The selected AWS profile needs the permissions matching the operations you use:

```json
{
  "Action": [
    "s3:ListAllMyBuckets",
    "s3:GetBucketLocation",
    "s3:ListBucket",
    "s3:GetObject",
    "s3:HeadObject",
    "s3:GetObjectAcl",
    "s3:GetBucketAcl",
    "s3:GetBucketPolicy",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketOwnershipControls",
    "s3:PutObject",
    "s3:PutObjectAcl",
    "s3:PutBucketAcl",
    "s3:PutBucketPolicy",
    "s3:PutBucketPublicAccessBlock",
    "s3:DeleteObject",
    "s3:DeleteBucketPolicy",
    "cloudfront:ListDistributions",
    "cloudfront:CreateInvalidation"
  ],
  "Effect": "Allow",
  "Resource": "*"
}
```

Use narrower bucket and distribution ARNs for production policies.

## Notes

- CloudFront does not store an object-to-distribution link. The app infers linked distributions by matching distribution origins to the S3 bucket and then matching cache behavior path patterns to the object viewer path.
- For S3 origins with an `OriginPath`, the app strips that origin path from the S3 key when building the invalidation path.
- The CloudFront client uses `us-east-1`, which is the standard SDK region for the global CloudFront API.
- S3 does not have real folders. Folder rows in the app are prefixes; folder operations apply to the objects currently under that prefix.
