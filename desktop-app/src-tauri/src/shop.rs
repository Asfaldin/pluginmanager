use serde::{Deserialize, Serialize};
use tauri::AppHandle;

// Zakładka "Sklep" - to jest to, czego używa sam KLIENT: zakłada konto, loguje się,
// przegląda katalog i kupuje. Bez panelu admina w appce (świadomie usunięty - to
// narzędzie operatora, patrz Mainplugins/license-server/README.md, wystawianie
// kluczy przez curl).
//
// Adres serwera licencyjnego jest wbudowany w binarkę W CZASIE KOMPILACJI - klient
// appki nigdy go nie konfiguruje, to Ty jako operator decydujesz, gdzie appka się łączy:
//
//   * build dla klienta:  ustaw zmienną PLUGINMANAGER_API_URL na prawdziwy adres
//                         produkcyjny (https://...) PRZED `tauri build`. option_env!
//                         wczytuje ją w czasie kompilacji i wypala w .exe.
//   * dev u operatora:    bez tej zmiennej appka używa SHOP_API_URL_FALLBACK poniżej
//                         (localhost), czyli lokalnego license-servera.
//
// !!! PRZED SPRZEDAŻĄ: albo zawsze buduj z PLUGINMANAGER_API_URL, albo zmień fallback
//     na produkcyjny adres - inaczej klient dostanie localhost i nie przejdzie logowania.
//
// Token sesji trzymany w keychain OS jak reszta sekretów appki (SFTP/RCON) - jedno
// konto na instalację appki, prosty model bez multi-account switchingu na razie.

const SHOP_API_URL_FALLBACK: &str = "http://localhost:3000";

fn shop_api_url() -> &'static str {
    match option_env!("PLUGINMANAGER_API_URL") {
        Some(url) if !url.is_empty() => url,
        _ => SHOP_API_URL_FALLBACK,
    }
}

const KEYRING_SERVICE: &str = "pluginmanager-shop";
const KEYRING_ACCOUNT: &str = "session-token";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseRecord {
    pub key: String,
    pub plugin: String,
    #[serde(default)]
    pub note: String,
    #[serde(rename = "serverId")]
    pub server_id: Option<String>,
    pub status: String,
    #[serde(rename = "billingType")]
    pub billing_type: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "boundAt")]
    pub bound_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerInfo {
    pub id: String,
    pub email: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthResponse {
    token: String,
    customer: CustomerInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogCategory {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogPlugin {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(rename = "variantId")]
    pub variant_id: Option<String>,
}

/// `plugins` w JSON-ie jest albo "*" (wszystko) albo listą id - patrz catalog.js.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PackagePlugins {
    All(String),
    List(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogPackage {
    pub id: String,
    pub label: String,
    pub description: String,
    pub plugins: PackagePlugins,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(rename = "subscriptionPrice", default)]
    pub subscription_price: Option<f64>,
    #[serde(rename = "variantId")]
    pub variant_id: Option<String>,
    #[serde(rename = "subscriptionVariantId")]
    pub subscription_variant_id: Option<String>,
    /// Pakiet dobrany pod konkretny tryb serwera (Skyblock/Prison/RPG) zamiast cenowej
    /// drabinki Starter/Pro/Ultimate - patrz komentarz w catalog.js. Brak pola w JSON-ie
    /// (stare pakiety) = false.
    #[serde(default)]
    pub mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketMessage {
    pub from: String,
    pub body: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketRecord {
    pub id: String,
    pub subject: String,
    pub category: String,
    pub priority: String,
    #[serde(rename = "serverProfile")]
    pub server_profile: Option<String>,
    pub status: String,
    pub messages: Vec<TicketMessage>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketMeta {
    pub categories: Vec<String>,
    pub priorities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    #[serde(rename = "storeUrl")]
    pub store_url: Option<String>,
    #[serde(default)]
    pub categories: Vec<CatalogCategory>,
    #[serde(rename = "individualPlugins")]
    pub individual_plugins: Vec<CatalogPlugin>,
    pub packages: Vec<CatalogPackage>,
}

fn get_token() -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()?.get_password().ok()
}

fn set_token(token: &str) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| e.to_string())?
        .set_password(token)
        .map_err(|e| e.to_string())
}

fn base_url(_app: &AppHandle) -> Result<String, String> {
    Ok(shop_api_url().trim_end_matches('/').to_string())
}

#[tauri::command]
pub async fn shop_register(app: AppHandle, email: String, password: String) -> Result<CustomerInfo, String> {
    let url = format!("{}/api/auth/register", base_url(&app)?);
    let resp = reqwest::Client::new()
        .post(url)
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    let auth: AuthResponse = resp.json().await.map_err(|e| e.to_string())?;
    set_token(&auth.token)?;
    Ok(auth.customer)
}

#[tauri::command]
pub async fn shop_login(app: AppHandle, email: String, password: String) -> Result<CustomerInfo, String> {
    let url = format!("{}/api/auth/login", base_url(&app)?);
    let resp = reqwest::Client::new()
        .post(url)
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    let auth: AuthResponse = resp.json().await.map_err(|e| e.to_string())?;
    set_token(&auth.token)?;
    Ok(auth.customer)
}

#[tauri::command]
pub fn shop_logout() -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[tauri::command]
pub fn shop_is_logged_in() -> bool {
    get_token().is_some()
}

/// Zwraca None (nie błąd) gdy niezalogowany albo token wygasł - upraszcza UI (nie trzeba
/// odróżniać "błąd sieci" od "po prostu nie jesteś zalogowany" przy starcie strony).
#[tauri::command]
pub async fn shop_me(app: AppHandle) -> Result<Option<CustomerInfo>, String> {
    let Some(token) = get_token() else { return Ok(None) };
    let url = format!("{}/api/me", base_url(&app)?);
    let resp = reqwest::Client::new()
        .get(url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        shop_logout()?;
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    Ok(Some(resp.json().await.map_err(|e| e.to_string())?))
}

/// Zawsze Ok(()) (serwer sam nie zdradza, czy e-mail istnieje - patrz forgot-password
/// w server.js), więc UI zawsze pokazuje ten sam komunikat "sprawdź maila".
#[tauri::command]
pub async fn shop_forgot_password(app: AppHandle, email: String) -> Result<(), String> {
    let url = format!("{}/api/auth/forgot-password", base_url(&app)?);
    let resp = reqwest::Client::new()
        .post(url)
        .json(&serde_json::json!({ "email": email }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    Ok(())
}

#[tauri::command]
pub async fn shop_reset_password(app: AppHandle, token: String, new_password: String) -> Result<(), String> {
    let url = format!("{}/api/auth/reset-password", base_url(&app)?);
    let resp = reqwest::Client::new()
        .post(url)
        .json(&serde_json::json!({ "token": token, "newPassword": new_password }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    Ok(())
}

#[tauri::command]
pub async fn shop_change_password(app: AppHandle, current_password: String, new_password: String) -> Result<(), String> {
    let token = get_token().ok_or("Nie jesteś zalogowany.")?;
    let url = format!("{}/api/me/password", base_url(&app)?);
    let resp = reqwest::Client::new()
        .patch(url)
        .bearer_auth(&token)
        .json(&serde_json::json!({ "currentPassword": current_password, "newPassword": new_password }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    Ok(())
}

#[tauri::command]
pub async fn shop_my_licenses(app: AppHandle) -> Result<Vec<LicenseRecord>, String> {
    let token = get_token().ok_or("Nie jesteś zalogowany.")?;
    let url = format!("{}/api/me/licenses", base_url(&app)?);
    let resp = reqwest::Client::new()
        .get(url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    resp.json().await.map_err(|e| e.to_string())
}

/// Testowe "kup" bez prawdziwej płatności - trafia do /api/me/dev-grant, który sam
/// odmawia (404), jeśli operator nie ustawił DEV_LICENSE_GRANTS=1 w .env
/// license-servera. Appka pokazuje przycisk wołający to tylko w import.meta.env.DEV
/// (patrz ShopPage.tsx) - druga, niezależna warstwa: nawet zbudowana wersja dla klienta
/// nie ma jak wywołać tej komendy z UI.
#[tauri::command]
pub async fn shop_dev_grant(app: AppHandle, plugin: String) -> Result<LicenseRecord, String> {
    let token = get_token().ok_or("Nie jesteś zalogowany.")?;
    let url = format!("{}/api/me/dev-grant", base_url(&app)?);
    let resp = reqwest::Client::new()
        .post(url)
        .bearer_auth(&token)
        .json(&serde_json::json!({ "plugin": plugin }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    resp.json().await.map_err(|e| e.to_string())
}

/** Kategorie/priorytety do wypełnienia formularza "Nowe zgłoszenie" - publiczny endpoint,
    nie wymaga logowania (patrz /api/tickets/meta w server.js). */
#[tauri::command]
pub async fn shop_ticket_meta(app: AppHandle) -> Result<TicketMeta, String> {
    let url = format!("{}/api/tickets/meta", base_url(&app)?);
    let resp = reqwest::Client::new().get(url).send().await.map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shop_my_tickets(app: AppHandle) -> Result<Vec<TicketRecord>, String> {
    let token = get_token().ok_or("Nie jesteś zalogowany.")?;
    let url = format!("{}/api/tickets", base_url(&app)?);
    let resp = reqwest::Client::new()
        .get(url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shop_create_ticket(
    app: AppHandle,
    subject: String,
    category: String,
    priority: String,
    server_profile: Option<String>,
    message: String,
) -> Result<TicketRecord, String> {
    let token = get_token().ok_or("Nie jesteś zalogowany.")?;
    let url = format!("{}/api/tickets", base_url(&app)?);
    let resp = reqwest::Client::new()
        .post(url)
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "subject": subject,
            "category": category,
            "priority": priority,
            "serverProfile": server_profile,
            "message": message,
        }))
        .send()
        .await
        .map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shop_catalog(app: AppHandle) -> Result<Catalog, String> {
    let url = format!("{}/api/catalog", base_url(&app)?);
    let resp = reqwest::Client::new().get(url).send().await.map_err(|e| friendly_request_error(&e))?;
    if !resp.status().is_success() {
        return Err(extract_error(resp).await);
    }
    resp.json().await.map_err(|e| e.to_string())
}

/// Do budowania linku "Kup" w przeglądarce - appka sama nic nie wysyła do LemonSqueezy,
/// tylko otwiera ten URL (patrz ShopPage.tsx, @tauri-apps/plugin-opener). customer_id w
/// custom_data pozwala webhookowi automatycznie dowiązać zakup do konta (patrz
/// license-server/src/lemonsqueezy.js#resolveCustomerId).
#[tauri::command]
pub async fn shop_checkout_url(app: AppHandle, variant_id: String) -> Result<String, String> {
    let catalog = shop_catalog(app.clone()).await?;
    let store_url = catalog
        .store_url
        .ok_or("Sklep LemonSqueezy nie jest jeszcze skonfigurowany (LEMONSQUEEZY_STORE_URL).")?;
    let me = shop_me(app).await?.ok_or("Zaloguj się przed zakupem.")?;
    let url = format!(
        "{}/checkout/buy/{}?checkout[email]={}&checkout[custom][customer_id]={}",
        store_url.trim_end_matches('/'),
        variant_id,
        urlencoding_encode(&me.email),
        urlencoding_encode(&me.id),
    );
    Ok(url)
}

/// Mini url-encode bez dodatkowej zależności - wystarczy dla e-maila i UUID (jedyne
/// pola, które tu wstawiamy; '@' i '+' to jedyne znaki spoza unreserved, na jakie trzeba
/// tu realnie trafić).
fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

/// Zamienia surowy błąd transportu reqwest (np. "tcp connect error: Connection refused"
/// przy niedziałającym/nieosiągalnym license-serverze) na krótki, polski komunikat -
/// inaczej klient widziałby angielski, deweloperski tekst prosto z biblioteki HTTP.
fn friendly_request_error(e: &reqwest::Error) -> String {
    if e.is_connect() {
        "Nie udało się połączyć z serwerem sklepu. Sprawdź internet i spróbuj ponownie.".to_string()
    } else if e.is_timeout() {
        "Serwer sklepu nie odpowiedział na czas. Spróbuj ponownie za chwilę.".to_string()
    } else {
        format!("Błąd połączenia z serwerem sklepu: {e}")
    }
}

/// Znacznik w treści błędu, po którym front (patrz api.ts) rozpoznaje "sesja wygasła" i
/// czyści stan zalogowania - odróżnia to od zwykłego błędu walidacji/uprawnień.
const SESSION_EXPIRED_MARKER: &str = "SESJA_WYGASŁA";

async fn extract_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        // Token wygasł/został unieważniony W TRAKCIE sesji (nie tylko przy starcie appki,
        // to już obsługuje shop_me) - czyścimy go lokalnie, żeby appka nie "myślała"
        // dalej, że klient jest zalogowany, mimo że każde kolejne wywołanie i tak dostanie 401.
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
            let _ = entry.delete_credential();
        }
        return format!("{SESSION_EXPIRED_MARKER}: Sesja wygasła - zaloguj się ponownie.");
    }
    match resp.json::<serde_json::Value>().await {
        Ok(body) => body.get("error").and_then(|v| v.as_str()).unwrap_or("nieznany błąd").to_string(),
        Err(_) => format!("HTTP {}", status),
    }
}
