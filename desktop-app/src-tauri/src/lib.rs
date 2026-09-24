mod deploy;
mod embedded_jars;
mod local_fs;
mod models;
mod profiles;
mod rcon;
mod resourcepack;
mod settings;
mod sftp;
mod shop;
mod texturepack_registry;
mod uninstall;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            profiles::list_profiles,
            profiles::save_profile,
            profiles::delete_profile,
            sftp::sftp_list_dir,
            sftp::sftp_read_file,
            sftp::sftp_write_file,
            sftp::sftp_upload_local_file,
            sftp::sftp_download_file,
            sftp::sftp_delete_file,
            sftp::sftp_upload_embedded_jar,
            embedded_jars::list_embedded_jars,
            rcon::rcon_send_command,
            resourcepack::rp_read_meta,
            resourcepack::rp_write_meta,
            resourcepack::rp_texture_status,
            resourcepack::rp_make_transparent,
            resourcepack::rp_import_texture,
            resourcepack::rp_reset_texture,
            resourcepack::rp_export_zip,
            resourcepack::rp_save_png_bytes,
            resourcepack::rp_list_all_textures,
            resourcepack::rp_download_pack,
            resourcepack::rp_download_vanilla_assets,
            resourcepack::rp_list_mc_versions,
            resourcepack::rp_write_text_file,
            resourcepack::rp_read_text_file,
            deploy::run_maven_build,
            deploy::list_dist_jars,
            deploy::export_plugin_bundle,
            texturepack_registry::list_texture_packs,
            texturepack_registry::save_texture_pack,
            texturepack_registry::delete_texture_pack,
            shop::shop_register,
            shop::shop_login,
            shop::shop_logout,
            shop::shop_is_logged_in,
            shop::shop_me,
            shop::shop_forgot_password,
            shop::shop_reset_password,
            shop::shop_my_licenses,
            shop::shop_dev_grant,
            shop::shop_catalog,
            shop::shop_checkout_url,
            shop::shop_change_password,
            shop::shop_ticket_meta,
            shop::shop_my_tickets,
            shop::shop_create_ticket,
            settings::open_app_data_dir,
            settings::app_version,
            uninstall::uninstall_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
