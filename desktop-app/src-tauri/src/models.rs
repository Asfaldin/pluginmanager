use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthMethod {
    Password,
    PrivateKey,
}

/// Gdzie jest serwer: w internecie (SFTP) albo w folderze na tym komputerze.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum ProfileKind {
    #[default]
    Remote,
    Local,
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
    // Stare profile (zapisane przed serwerami lokalnymi) nie mają tych pól -> Remote.
    #[serde(default)]
    pub kind: ProfileKind,
    #[serde(default)]
    pub local_path: Option<String>,
}

impl ServerProfile {
    /// Folder serwera, jeśli to serwer "na tym komputerze" - wtedy pliki idą przez local_fs zamiast SFTP.
    pub fn local_root(&self) -> Option<&str> {
        match self.kind {
            ProfileKind::Local => self.local_path.as_deref().filter(|p| !p.trim().is_empty()),
            ProfileKind::Remote => None,
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    const OLD_PROFILE: &str = r#"{"id":"a","name":"VPS","sftp_host":"h","sftp_port":22,"sftp_username":"u",
        "auth_method":"Password","private_key_path":null,"remote_plugins_path":"/plugins","rcon_host":"h","rcon_port":25575}"#;

    #[test]
    fn profiles_saved_before_local_servers_load_as_remote() {
        let p: ServerProfile = serde_json::from_str(OLD_PROFILE).unwrap();
        assert_eq!(p.kind, ProfileKind::Remote);
        assert_eq!(p.local_root(), None);
    }

    #[test]
    fn local_profile_uses_its_folder_but_only_when_set() {
        let mut p: ServerProfile = serde_json::from_str(OLD_PROFILE).unwrap();
        p.kind = ProfileKind::Local;
        assert_eq!(p.local_root(), None);
        p.local_path = Some("C:/Users/Zgredek/Desktop/Serwer".into());
        assert_eq!(p.local_root(), Some("C:/Users/Zgredek/Desktop/Serwer"));
    }
}

