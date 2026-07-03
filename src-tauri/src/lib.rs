mod aws_clients;
mod cloudfront_ops;
mod devtools;
mod models;
mod profiles;
mod s3_ops;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            profiles::list_profiles,
            s3_ops::list_buckets,
            s3_ops::list_objects,
            s3_ops::get_object_metadata,
            s3_ops::get_object_preview,
            s3_ops::download_object,
            s3_ops::download_prefix,
            s3_ops::download_entries,
            s3_ops::upload_file,
            s3_ops::upload_paths,
            s3_ops::delete_object,
            s3_ops::delete_prefix,
            s3_ops::delete_entries,
            s3_ops::get_bucket_permissions,
            s3_ops::get_object_permissions,
            s3_ops::get_prefix_permissions,
            s3_ops::set_bucket_canned_acl,
            s3_ops::set_object_canned_acl,
            s3_ops::set_prefix_canned_acl,
            s3_ops::set_bucket_policy,
            s3_ops::delete_bucket_policy,
            s3_ops::set_bucket_public_access_block,
            cloudfront_ops::find_linked_distributions,
            cloudfront_ops::create_invalidation,
            devtools::open_devtools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
