use crate::models::ServerProfile;
use crate::profiles;
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const TYPE_AUTH: i32 = 3;
const TYPE_EXEC_COMMAND: i32 = 2;
const TYPE_AUTH_RESPONSE: i32 = 2;

async fn send_packet(stream: &mut TcpStream, request_id: i32, packet_type: i32, body: &str) -> Result<(), String> {
    let body_bytes = body.as_bytes();
    // request_id(4) + type(4) + body + null(1) + null(1)
    let payload_len = 4 + 4 + body_bytes.len() + 2;

    let mut packet = Vec::with_capacity(4 + payload_len);
    packet.extend_from_slice(&(payload_len as i32).to_le_bytes());
    packet.extend_from_slice(&request_id.to_le_bytes());
    packet.extend_from_slice(&packet_type.to_le_bytes());
    packet.extend_from_slice(body_bytes);
    packet.push(0);
    packet.push(0);

    stream.write_all(&packet).await.map_err(|e| e.to_string())
}

struct RconPacket {
    request_id: i32,
    packet_type: i32,
    body: String,
}

async fn read_packet(stream: &mut TcpStream) -> Result<RconPacket, String> {
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).await.map_err(|e| e.to_string())?;
    let len = i32::from_le_bytes(len_buf) as usize;

    let mut rest = vec![0u8; len];
    stream.read_exact(&mut rest).await.map_err(|e| e.to_string())?;

    let request_id = i32::from_le_bytes(rest[0..4].try_into().unwrap());
    let packet_type = i32::from_le_bytes(rest[4..8].try_into().unwrap());
    let body_bytes = &rest[8..rest.len().saturating_sub(2)];
    let body = String::from_utf8_lossy(body_bytes).to_string();

    Ok(RconPacket { request_id, packet_type, body })
}

async fn run_command(profile: &ServerProfile, command: &str) -> Result<String, String> {
    // Bez RCON (typowe dla serwera testowego na tym komputerze) - jasna podpowiedź zamiast błędu połączenia.
    if profile.rcon_host.trim().is_empty() {
        return Err(format!(
            "Ten serwer nie ma ustawionego RCON - wpisz komendę w konsoli serwera: {command}"
        ));
    }
    let password = profiles::get_rcon_secret(&profile.id).ok_or("No RCON password stored for this profile")?;

    let mut stream = TcpStream::connect((profile.rcon_host.as_str(), profile.rcon_port))
        .await
        .map_err(|e| format!("RCON connect failed: {e}"))?;

    send_packet(&mut stream, 1, TYPE_AUTH, &password).await?;

    // The Source RCON protocol has a well-known quirk: some servers (Minecraft
    // included) send an empty SERVERDATA_RESPONSE_VALUE packet before the real
    // SERVERDATA_AUTH_RESPONSE. Skip past it instead of treating it as the answer.
    let mut auth_response = read_packet(&mut stream).await?;
    let mut attempts = 0;
    while auth_response.packet_type != TYPE_AUTH_RESPONSE && attempts < 4 {
        auth_response = read_packet(&mut stream).await?;
        attempts += 1;
    }

    if auth_response.request_id == -1 {
        return Err("RCON authentication rejected by server".to_string());
    }

    send_packet(&mut stream, 2, TYPE_EXEC_COMMAND, command).await?;
    let response = read_packet(&mut stream).await?;
    Ok(response.body)
}

#[tauri::command]
pub async fn rcon_send_command(app: AppHandle, profile_id: String, command: String) -> Result<String, String> {
    let profile = profiles::list_profiles(app)?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("Unknown server profile '{profile_id}'"))?;

    run_command(&profile, &command).await
}
