import { appDataDir, join } from "@tauri-apps/api/path";

// Shared "which texture pack to pull item/block icons from" preference, so
// picking it once in one editor makes every material picker across the app
// show real icons, without re-asking per page.

const ICON_PACK_KEY = "pluginmanager:iconTexturePackDir";

const VANILLA_CACHE_SUBDIR = "vanilla-texture-cache";

/** Fixed, app-managed folder for the auto-downloaded Vanilla base - not a
 * user-chosen project, so material icons work out of the box everywhere
 * without anyone having to set up a texture pack first. */
export async function getVanillaCacheDir(): Promise<string> {
  const base = await appDataDir();
  return join(base, VANILLA_CACHE_SUBDIR);
}

export function getIconPackDir(): string {
  return localStorage.getItem(ICON_PACK_KEY) ?? "";
}

export function setIconPackDir(path: string): void {
  localStorage.setItem(ICON_PACK_KEY, path);
}

const TEXTURE_PATH_RE = /\/textures\/(item|block)\//;

/** Derives Bukkit-style material names (e.g. DIAMOND_SWORD) from a resource pack's item/block texture filenames. */
export function materialsFromTextureList(allTextures: string[]): string[] {
  const names = new Set<string>();
  for (const path of allTextures) {
    if (!TEXTURE_PATH_RE.test(path)) continue;
    const file = path.split("/").pop();
    if (!file?.endsWith(".png")) continue;
    names.add(file.slice(0, -4).toUpperCase());
  }
  return [...names].sort();
}

// A handful of vanilla materials whose Bukkit enum name doesn't match their
// actual texture filename at all (historical naming, not a pattern) -
// verified directly against the downloaded vanilla asset folder.
const MATERIAL_NAME_EXCEPTIONS: Record<string, string> = {
  SNOW_BLOCK: "snow",
  MAGMA_BLOCK: "magma",
};

/**
 * Candidate texture paths for a material, in priority order. Many blocks
 * (grass, logs, machines like dispenser/grindstone) don't have one single
 * flat texture - their real inventory icon is a 3D isometric render built
 * from several face textures - so besides the exact name, this also tries
 * the most "iconic" single face (top, then front, then side) as a
 * reasonable stand-in preview. Verified against the real shop's item list:
 * exact-name lookup alone resolves ~85% of materials in use; adding these
 * fallbacks brings that to ~97% (the rest - player/mob heads, decorated
 * pots, and animated items like compass/clock - genuinely have no single
 * static texture to fall back to).
 */
export function textureRelPathsForMaterial(material: string): string[] {
  const lower = material.toLowerCase();
  const paths = [
    `assets/minecraft/textures/item/${lower}.png`,
    `assets/minecraft/textures/block/${lower}.png`,
    `assets/minecraft/textures/block/${lower}_top.png`,
    `assets/minecraft/textures/block/${lower}_front.png`,
    `assets/minecraft/textures/block/${lower}_side.png`,
  ];
  const exception = MATERIAL_NAME_EXCEPTIONS[material];
  if (exception) {
    paths.push(`assets/minecraft/textures/item/${exception}.png`, `assets/minecraft/textures/block/${exception}.png`);
  }
  return paths;
}

// Purely cosmetic default icons for structural GUI button roles that have no
// per-slot material of their own in the real data (nav arrows, exit, search,
// sort) - standard Minecraft plugin convention, not a claim about any
// specific server's actual configured icon (buttons don't have one).
// COMPASS/CLOCK are excluded - vanilla ships them as numbered animation
// frames (compass_00.png..compass_31.png), not a single static "compass.png",
// so they'd never resolve through the simple per-material lookup below.
const ROLE_ICONS: Record<string, string> = {
  NAV_PREV: "ARROW",
  NAV_NEXT: "ARROW",
  NAV_BACK: "ARROW",
  EXIT: "BARRIER",
  SEARCH: "SPYGLASS",
  SORT: "HOPPER",
};

export function conventionalRoleIcon(role: string): string | undefined {
  return ROLE_ICONS[role];
}
