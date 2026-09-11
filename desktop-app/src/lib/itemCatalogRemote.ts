import { sftpListDir, sftpReadFile, sftpWriteFile } from "./api";
import { ITEMS_FOLDER, itemsOfFile, parseItemsFile, serializeItemsFile } from "./itemCatalog";
import type { CustomItemEntry } from "./types";

// Katalog itemów na serwerze (SFTP albo folder lokalny - to samo API).

export function itemsDir(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/${ITEMS_FOLDER}`;
}

/** Wszystkie pliki items/*.yml (alfabetycznie, jak czyta je plugin) i ich itemy. */
export async function loadItemCatalog(
  profileId: string,
  pluginsPath: string
): Promise<{ files: string[]; items: CustomItemEntry[] }> {
  const dir = itemsDir(pluginsPath);
  const entries = await sftpListDir(profileId, dir);
  const files = entries
    .filter((e) => !e.is_dir && e.name.toLowerCase().endsWith(".yml"))
    .map((e) => e.name)
    .sort();
  const texts = await Promise.all(files.map((f) => sftpReadFile(profileId, `${dir}/${f}`)));
  return { files, items: files.flatMap((f, i) => parseItemsFile(f, texts[i])) };
}

/** Zapisuje podane pliki katalogu (każdy z itemami, które do niego należą). */
export async function saveItemFiles(
  profileId: string,
  pluginsPath: string,
  items: CustomItemEntry[],
  files: string[]
): Promise<void> {
  const dir = itemsDir(pluginsPath);
  for (const f of files) {
    await sftpWriteFile(profileId, `${dir}/${f}`, serializeItemsFile(itemsOfFile(items, f)));
  }
}
