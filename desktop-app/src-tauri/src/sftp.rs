use crate::local_fs;
use crate::models::{AuthMethod, RemoteEntry, ServerProfile};
use crate::profiles;
use russh::client::{self, Handle};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;
use std::sync::Arc;
use tauri::AppHandle;

struct SshHandler;

impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // TOFU: we don't pin host keys yet, any key is accepted.
        Ok(true)
    }
}

async fn connect_sftp(profile: &ServerProfile) -> Result<SftpSession, String> {
    let config = Arc::new(client::Config::default());
    let mut session: Handle<SshHandler> = client::connect(
        config,
        (profile.sftp_host.as_str(), profile.sftp_port),
        SshHandler,
    )
    .await
    .map_err(|e| format!("SSH connect failed: {e}"))?;

    let auth_ok = match profile.auth_method {
        AuthMethod::Password => {
            let password = profiles::get_sftp_secret(&profile.id)
                .ok_or("No SFTP password stored for this profile")?;
            session
                .authenticate_password(profile.sftp_username.clone(), password)
                .await
                .map_err(|e| format!("Authentication failed: {e}"))?
                .success()
        }
        AuthMethod::PrivateKey => {
            let key_path = profile
                .private_key_path
                .clone()
                .ok_or("No private key path configured for this profile")?;
            let passphrase = profiles::get_sftp_secret(&profile.id);
            let key = load_secret_key(&key_path, passphrase.as_deref())
                .map_err(|e| format!("Failed to load private key: {e}"))?;
            let key_with_alg = PrivateKeyWithHashAlg::new(
                Arc::new(key),
                session.best_supported_rsa_hash().await.ok().flatten().flatten(),
            );
            session
                .authenticate_publickey(profile.sftp_username.clone(), key_with_alg)
                .await
                .map_err(|e| format!("Authentication failed: {e}"))?
                .success()
        }
    };

    if !auth_ok {
        return Err("SFTP authentication rejected by server".to_string());
    }

    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open channel: {e}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("Failed to request sftp subsystem: {e}"))?;

    SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("Failed to start SFTP session: {e}"))
}

fn resolve_profile(app: &AppHandle, profile_id: &str) -> Result<ServerProfile, String> {
    profiles::list_profiles(app.clone())?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("Unknown server profile '{profile_id}'"))
}

#[tauri::command]
pub async fn sftp_list_dir(app: AppHandle, profile_id: String, path: String) -> Result<Vec<RemoteEntry>, String> {
    let profile = resolve_profile(&app, &profile_id)?;
    if let Some(root) = profile.local_root() {
        return local_fs::list_dir(root, &path);
    }
    let sftp = connect_sftp(&profile).await?;

    let mut entries = Vec::new();
    for entry in sftp.read_dir(&path).await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata();
        let entry_path = if path.ends_with('/') {
            format!("{path}{}", entry.file_name())
        } else {
            format!("{path}/{}", entry.file_name())
        };
        entries.push(RemoteEntry {
            name: entry.file_name(),
            path: entry_path,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

#[tauri::command]
pub async fn sftp_read_file(app: AppHandle, profile_id: String, path: String) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    let profile = resolve_profile(&app, &profile_id)?;
    if let Some(root) = profile.local_root() {
        return local_fs::read_file(root, &path);
    }
    let sftp = connect_sftp(&profile).await?;

    let mut file = sftp.open(&path).await.map_err(|e| e.to_string())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .await
        .map_err(|e| e.to_string())?;
    Ok(contents)
}

#[tauri::command]
pub async fn sftp_write_file(
    app: AppHandle,
    profile_id: String,
    path: String,
    contents: String,
) -> Result<(), String> {
    use russh_sftp::protocol::OpenFlags;
    use tokio::io::AsyncWriteExt;

    let profile = resolve_profile(&app, &profile_id)?;
    if let Some(root) = profile.local_root() {
        return local_fs::write_bytes(root, &path, contents.as_bytes());
    }
    let sftp = connect_sftp(&profile).await?;

    let mut file = sftp
        .open_with_flags(
            &path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|e| e.to_string())?;
    file.write_all(contents.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    file.shutdown().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// "Automat na serwer": wgrywa WBUDOWANY w appkę jar pluginu (patrz embedded_jars.rs)
/// prosto na serwer klienta przez SFTP - bez pośredniego zapisu na dysk, bez potrzeby
/// posiadania kodu źródłowego Mainplugins. Restart/reload pluginu zostaje osobnym
/// krokiem (RCON) po stronie wołającego, tak jak przy każdym innym wgraniu jara.
#[tauri::command]
pub async fn sftp_upload_embedded_jar(
    app: AppHandle,
    profile_id: String,
    plugin_id: String,
) -> Result<String, String> {
    use russh_sftp::protocol::OpenFlags;
    use tokio::io::AsyncWriteExt;

    let bytes = crate::embedded_jars::jar_bytes(&plugin_id)
        .ok_or_else(|| format!("Brak wbudowanego jara dla pluginu '{plugin_id}' w tej appce."))?;
    let jar_filename = crate::embedded_jars::jar_filename(&plugin_id).unwrap();

    let profile = resolve_profile(&app, &profile_id)?;
    let remote_path = format!("{}/{}", profile.remote_plugins_path.trim_end_matches('/'), jar_filename);
    if let Some(root) = profile.local_root() {
        local_fs::write_bytes(root, &remote_path, bytes)?;
        return Ok(remote_path);
    }
    let sftp = connect_sftp(&profile).await?;

    let mut file = sftp
        .open_with_flags(&remote_path, OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE)
        .await
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).await.map_err(|e| e.to_string())?;
    file.shutdown().await.map_err(|e| e.to_string())?;
    Ok(remote_path)
}

#[tauri::command]
pub async fn sftp_upload_local_file(
    app: AppHandle,
    profile_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    use russh_sftp::protocol::OpenFlags;
    use tokio::io::AsyncWriteExt;

    let profile = resolve_profile(&app, &profile_id)?;
    let bytes = tokio::fs::read(&local_path).await.map_err(|e| e.to_string())?;
    if let Some(root) = profile.local_root() {
        return local_fs::write_bytes(root, &remote_path, &bytes);
    }
    let sftp = connect_sftp(&profile).await?;

    let mut file = sftp
        .open_with_flags(
            &remote_path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).await.map_err(|e| e.to_string())?;
    file.shutdown().await.map_err(|e| e.to_string())?;
    Ok(())
}
