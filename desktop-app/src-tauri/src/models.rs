use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthMethod {
    Password,
    PrivateKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub sftp_host: String,
    pub sftp_port: u16,
    pub sftp_username: String,
    pub auth_method: AuthMethod,
    pub private_key_path: Option<String>,
    pub remote_plugins_path: String,
    pub rcon_host: String,
    pub rcon_port: u16,
}

/// Profile shape persisted to disk (no secrets - those live in the OS keychain).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProfileStore {
    pub profiles: Vec<ServerProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

/// A resource-pack project the user has created in the app, so it can be
/// picked from a list next time instead of re-browsing to the same local
/// folder, and exported independently of any other pack.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TexturePackProject {
    pub id: String,
    pub name: String,
    pub local_path: String,
    pub base_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TexturePackStore {
    pub packs: Vec<TexturePackProject>,
}

