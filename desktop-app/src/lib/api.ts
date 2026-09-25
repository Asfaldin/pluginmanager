import { invoke } from "@tauri-apps/api/core";
import { setHasConfigured } from "./appSettings";
import { clearIconCache } from "./iconCache";
import type {
  Catalog,
  CustomerInfo,
  DownloadResult,
  LicenseRecord,
  LocalJar,
  McVersionSummary,
  PackMeta,
  RemoteEntry,
  ServerProfile,
  TexturePackProject,
  TextureStatus,
  TicketMeta,
  TicketRecord,
} from "./types";

export function listProfiles(): Promise<ServerProfile[]> {
  return invoke("list_profiles");
}

export function saveProfile(
  profile: ServerProfile,
  sftpSecret?: string,
  rconSecret?: string
): Promise<void> {
  return invoke("save_profile", {
    profile,
    sftpSecret: sftpSecret ?? null,
    rconSecret: rconSecret ?? null,
  });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke("delete_profile", { id });
}

export function sftpListDir(profileId: string, path: string): Promise<RemoteEntry[]> {
  return invoke("sftp_list_dir", { profileId, path });
}

export function sftpReadFile(profileId: string, path: string): Promise<string> {
  return invoke("sftp_read_file", { profileId, path });
}

export async function sftpWriteFile(profileId: string, path: string, contents: string): Promise<void> {
  await invoke("sftp_write_file", { profileId, path, contents });
  // Wspólny punkt dla "Wyślij na serwer" ze wszystkich edytorów configów - stąd
  // checklista "Pierwsze kroki" na Dashboardzie wie, że ktoś skonfigurował coś
  // niezależnie od tego, w którym edytorze to zrobił.
  setHasConfigured();
}

export function rconSendCommand(profileId: string, command: string): Promise<string> {
  return invoke("rcon_send_command", { profileId, command });
}

export function sftpUploadLocalFile(profileId: string, localPath: string, remotePath: string): Promise<void> {
  return invoke("sftp_upload_local_file", { profileId, localPath, remotePath });
}

/** Pobiera plik z serwera na dysk lokalny - binarnie (schematy .nbt/.schem i inne pliki niebędące configiem). */
export function sftpDownloadFile(profileId: string, remotePath: string, localPath: string): Promise<void> {
  return invoke("sftp_download_file", { profileId, remotePath, localPath });
}

export function sftpDeleteFile(profileId: string, remotePath: string): Promise<void> {
  return invoke("sftp_delete_file", { profileId, remotePath });
}

/** Wgrywa wbudowany w appkę jar pluginu (patrz embedded_jars.rs) prosto na serwer przez SFTP - zwraca zdalną ścieżkę. */
export function sftpUploadEmbeddedJar(profileId: string, pluginId: string): Promise<string> {
  return invoke("sftp_upload_embedded_jar", { profileId, pluginId });
}

export interface EmbeddedJar {
  id: string;
  filename: string;
  size: number;
}

/** Wszystkie jary wbudowane w appkę (patrz embedded_jars.rs) - do zakładki Wdrożenie. */
export function listEmbeddedJars(): Promise<EmbeddedJar[]> {
  return invoke("list_embedded_jars");
}

export function rpReadMeta(packDir: string): Promise<PackMeta> {
  return invoke("rp_read_meta", { packDir });
}

export function rpWriteMeta(packDir: string, meta: PackMeta): Promise<void> {
  return invoke("rp_write_meta", { packDir, meta });
}

export function rpTextureStatus(packDir: string, relPath: string): Promise<TextureStatus> {
  return invoke("rp_texture_status", { packDir, relPath });
}

export function rpMakeTransparent(packDir: string, relPath: string, width: number, height: number): Promise<void> {
  clearIconCache();
  return invoke("rp_make_transparent", { packDir, relPath, width, height });
}

export function rpImportTexture(
  packDir: string,
  relPath: string,
  sourcePath: string,
  stripAlpha: boolean
): Promise<void> {
  clearIconCache();
  return invoke("rp_import_texture", { packDir, relPath, sourcePath, stripAlpha });
}

export function rpResetTexture(packDir: string, relPath: string): Promise<void> {
  clearIconCache();
  return invoke("rp_reset_texture", { packDir, relPath });
}

export function rpExportZip(packDir: string, outputPath: string): Promise<void> {
  return invoke("rp_export_zip", { packDir, outputPath });
}

export function rpSavePngBytes(packDir: string, relPath: string, pngBase64: string): Promise<void> {
  clearIconCache();
  return invoke("rp_save_png_bytes", { packDir, relPath, pngBase64 });
}

export function rpListAllTextures(packDir: string): Promise<string[]> {
  return invoke("rp_list_all_textures", { packDir });
}

export function rpDownloadPack(url: string, expectedSha1: string, packDir: string): Promise<DownloadResult> {
  return invoke("rp_download_pack", { url, expectedSha1: expectedSha1 || null, packDir });
}

export function rpDownloadVanillaAssets(version: string, packDir: string): Promise<DownloadResult> {
  return invoke("rp_download_vanilla_assets", { version: version || null, packDir });
}

export function runMavenBuild(projectDir: string): Promise<string> {
  return invoke("run_maven_build", { projectDir });
}

export function listDistJars(projectDir: string): Promise<LocalJar[]> {
  return invoke("list_dist_jars", { projectDir });
}

export function exportPluginBundle(
  pluginId: string,
  pluginFolderName: string,
  configFilename: string,
  configContents: string,
  destDir: string
): Promise<string> {
  return invoke("export_plugin_bundle", {
    pluginId,
    pluginFolderName,
    configFilename,
    configContents,
    destDir,
  });
}

export function rpListMcVersions(): Promise<McVersionSummary[]> {
  return invoke("rp_list_mc_versions");
}

export function rpWriteTextFile(packDir: string, relPath: string, contents: string): Promise<void> {
  return invoke("rp_write_text_file", { packDir, relPath, contents });
}

export function rpReadTextFile(packDir: string, relPath: string): Promise<string | null> {
  return invoke("rp_read_text_file", { packDir, relPath });
}

export function listTexturePacks(): Promise<TexturePackProject[]> {
  return invoke("list_texture_packs");
}

export function saveTexturePack(pack: TexturePackProject): Promise<void> {
  return invoke("save_texture_pack", { pack });
}

export function deleteTexturePack(id: string): Promise<void> {
  return invoke("delete_texture_pack", { id });
}

// --- Sklep (klient, nie operator - patrz shop.rs) ---

/** Znacznik dopisywany przez shop.rs::extract_error, gdy token sesji wygasł/został
    unieważniony W TRAKCIE pracy appki (nie tylko przy starcie - to już obsługuje shop_me).
    Bez tego appka "myślała" dalej, że klient jest zalogowany (sidebar dalej pokazywał
    e-mail), mimo że każde kolejne wywołanie i tak dostawało niejasny błąd 401. */
const SESSION_EXPIRED_MARKER = "SESJA_WYGASŁA";

let sessionExpiredHandler: (() => void) | null = null;

/** Wołane raz przez AuthProvider (patrz AuthContext.tsx) - gdy dowolna komenda wymagająca
    zalogowania dostanie SESSION_EXPIRED_MARKER, appka sama czyści stan `customer`, żeby
    UI (pasek boczny, gated strony) natychmiast wrócił do stanu "niezalogowany". */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function invokeAuthed<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    if (String(e).includes(SESSION_EXPIRED_MARKER)) sessionExpiredHandler?.();
    throw e;
  }
}

export function shopRegister(email: string, password: string): Promise<CustomerInfo> {
  return invoke("shop_register", { email, password });
}

export function shopLogin(email: string, password: string): Promise<CustomerInfo> {
  return invoke("shop_login", { email, password });
}

export function shopLogout(): Promise<void> {
  return invoke("shop_logout");
}

export function shopMe(): Promise<CustomerInfo | null> {
  return invoke("shop_me");
}

/** Zawsze się "udaje" (serwer nie zdradza, czy e-mail istnieje) - wysyła kod resetu mailem, jeśli konto istnieje. */
export function shopForgotPassword(email: string): Promise<void> {
  return invoke("shop_forgot_password", { email });
}

/** `token` to kod z maila (patrz shopForgotPassword) - jednorazowy, ważny 30 minut. */
export function shopResetPassword(token: string, newPassword: string): Promise<void> {
  return invoke("shop_reset_password", { token, newPassword });
}

export function shopMyLicenses(): Promise<LicenseRecord[]> {
  return invokeAuthed("shop_my_licenses");
}

/** Testowe "kup" bez prawdziwej płatności - działa tylko, gdy operator włączył
    DEV_LICENSE_GRANTS=1 na license-serverze (patrz shop.rs). Wołane wyłącznie z
    przycisku widocznego tylko w import.meta.env.DEV (patrz ShopPage.tsx). */
export function shopDevGrant(pluginId: string): Promise<LicenseRecord> {
  return invokeAuthed("shop_dev_grant", { plugin: pluginId });
}

export function shopCatalog(): Promise<Catalog> {
  return invoke("shop_catalog");
}

export function shopCheckoutUrl(variantId: string): Promise<string> {
  return invokeAuthed("shop_checkout_url", { variantId });
}

export function shopChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  return invokeAuthed("shop_change_password", { currentPassword, newPassword });
}

/** Kategorie/priorytety do formularza "Nowe zgłoszenie" (patrz SupportPage.tsx) - publiczny,
    nie wymaga logowania. */
export function shopTicketMeta(): Promise<TicketMeta> {
  return invoke("shop_ticket_meta");
}

export function shopMyTickets(): Promise<TicketRecord[]> {
  return invokeAuthed("shop_my_tickets");
}

export function shopCreateTicket(input: {
  subject: string;
  category: string;
  priority: string;
  serverProfile: string | null;
  message: string;
}): Promise<TicketRecord> {
  return invokeAuthed("shop_create_ticket", input);
}

// --- Ustawienia appki ---

export function openAppDataDir(): Promise<void> {
  return invoke("open_app_data_dir");
}

export function appVersion(): Promise<string> {
  return invoke("app_version");
}

/** Prawdziwy deinstalator Windows (patrz uninstall.rs) - działa tylko w zbudowanej,
    zainstalowanej appce (installer rejestruje wpis w rejestrze). W trybie deweloperskim
    zwraca czytelny błąd zamiast czegokolwiek robić. */
export function uninstallApp(): Promise<void> {
  return invoke("uninstall_app");
}
