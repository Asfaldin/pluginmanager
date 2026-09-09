import { useEffect, useState } from "react";
import { listTexturePacks, rpDownloadVanillaAssets, rpListAllTextures } from "./api";
import { getIconPackDir, getVanillaCacheDir, materialsFromTextureList, setIconPackDir } from "./materialIcons";
import { COMMON_MATERIALS } from "./minecraftData";
import type { TexturePackProject } from "./types";

/**
 * Shared "which texture pack gives us material icons" state - the Vanilla
 * base auto-downloads once (app-managed, no manual setup) and every page
 * using this hook gets the same icon pack dir and derived material list
 * without re-triggering the download if another page already did it.
 */
export function useIconPack(onStatus?: (msg: string) => void) {
  const [iconPackDir, setIconPackDirState] = useState(getIconPackDir());
  const [allMaterials, setAllMaterials] = useState<string[]>(COMMON_MATERIALS);
  const [packProjects, setPackProjects] = useState<TexturePackProject[]>([]);

  useEffect(() => {
    listTexturePacks()
      .then(setPackProjects)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!iconPackDir) {
      setAllMaterials(COMMON_MATERIALS);
      return;
    }
    rpListAllTextures(iconPackDir)
      .then((textures) => {
        const derived = materialsFromTextureList(textures);
        setAllMaterials(derived.length > 0 ? derived : COMMON_MATERIALS);
      })
      .catch(() => setAllMaterials(COMMON_MATERIALS));
  }, [iconPackDir]);

  function selectIconPack(dir: string) {
    setIconPackDirState(dir);
    setIconPackDir(dir);
  }

  async function downloadVanillaIntoCache(cacheDir: string, announce: boolean) {
    if (announce) onStatus?.("Pobieram bazę Vanilla w tle (jednorazowo, może potrwać chwilę)...");
    try {
      const result = await rpDownloadVanillaAssets("", cacheDir);
      selectIconPack(cacheDir);
      onStatus?.(`Baza Vanilla gotowa (${result.files_extracted} plików) — ikonki materiałów działają automatycznie, w każdym edytorze.`);
    } catch (e) {
      onStatus?.(`Nie udało się pobrać bazy Vanilla: ${String(e)}`);
    }
  }

  async function refreshVanillaBase() {
    const cacheDir = await getVanillaCacheDir();
    await downloadVanillaIntoCache(cacheDir, true);
  }

  // Only kicks in when the user hasn't already pointed icons at something
  // else (a custom pack) - otherwise just reuses whatever is already set.
  useEffect(() => {
    if (getIconPackDir()) return;
    (async () => {
      const cacheDir = await getVanillaCacheDir();
      try {
        const existing = await rpListAllTextures(cacheDir);
        if (existing.length > 0) {
          selectIconPack(cacheDir);
          return;
        }
      } catch {
        // cache dir doesn't exist yet - fall through to download it
      }
      await downloadVanillaIntoCache(cacheDir, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { iconPackDir, allMaterials, packProjects, selectIconPack, refreshVanillaBase };
}
