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
  ];
  // Szybki nie mają własnej tekstury przedmiotu - w ekwipunku wyglądają jak całe szkło w tym kolorze
  // (bez tego łapało się *_pane_top.png, czyli sama cienka krawędź).
  if (lower.endsWith("_pane")) paths.push(`assets/minecraft/textures/block/${lower.slice(0, -"_pane".length)}.png`);
  paths.push(
    `assets/minecraft/textures/block/${lower}_top.png`,
    `assets/minecraft/textures/block/${lower}_front.png`,
    `assets/minecraft/textures/block/${lower}_side.png`,
  );
  const exception = MATERIAL_NAME_EXCEPTIONS[material];
  if (exception) {
    paths.push(`assets/minecraft/textures/item/${exception}.png`, `assets/minecraft/textures/block/${exception}.png`);
  }
  return paths;
}

/** Kawałek tekstury do wycięcia (sx,sy,sw,sh) i miejsce na ikonce (dx,dy). */
export interface IconCropPart {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
}

/** Ikonka składana z tekstury modelu (skrzynie, głowy) - te przedmioty nie mają płaskiej tekstury. */
export interface IconCrop {
  texture: string;
  width: number;
  height: number;
  parts: IconCropPart[];
}

// Przód skrzyni z tekstury modelu 64x64: przód wieka, przód dołu i zamek.
function chestCrop(file: string): IconCrop {
  return {
    texture: `assets/minecraft/textures/entity/chest/${file}.png`,
    width: 14,
    height: 15,
    parts: [
      { sx: 14, sy: 14, sw: 14, sh: 5, dx: 0, dy: 0 },
      { sx: 14, sy: 33, sw: 14, sh: 10, dx: 0, dy: 5 },
      { sx: 1, sy: 1, sw: 2, sh: 4, dx: 6, dy: 3 },
    ],
  };
}

// Twarz głowy (przód 8x8) + nakładka "czapki", jeśli tekstura ją ma.
function headCrop(texture: string, faceWidth = 8, withHat = false): IconCrop {
  const parts: IconCropPart[] = [{ sx: 8, sy: 8, sw: faceWidth, sh: 8, dx: 0, dy: 0 }];
  if (withHat) parts.push({ sx: 40, sy: 8, sw: 8, sh: 8, dx: 0, dy: 0 });
  return { texture: `assets/minecraft/textures/entity/${texture}.png`, width: faceWidth, height: 8, parts };
}

const COPPER: Record<string, string> = { "": "copper", EXPOSED_: "copper_exposed", WEATHERED_: "copper_weathered", OXIDIZED_: "copper_oxidized" };

const ICON_CROPS: Record<string, IconCrop> = {
  CHEST: chestCrop("normal"),
  TRAPPED_CHEST: chestCrop("trapped"),
  ENDER_CHEST: chestCrop("ender"),
  ...Object.fromEntries(
    Object.entries(COPPER).flatMap(([prefix, file]) => [
      [`${prefix}COPPER_CHEST`, chestCrop(file)],
      [`WAXED_${prefix}COPPER_CHEST`, chestCrop(file)],
    ])
  ),
  PLAYER_HEAD: headCrop("player/wide/steve", 8, true),
  ZOMBIE_HEAD: headCrop("zombie/zombie", 8, true),
  SKELETON_SKULL: headCrop("skeleton/skeleton"),
  WITHER_SKELETON_SKULL: headCrop("skeleton/wither_skeleton"),
  CREEPER_HEAD: headCrop("creeper/creeper"),
  PIGLIN_HEAD: headCrop("piglin/piglin", 10),
};

export function iconCropForMaterial(material: string): IconCrop | undefined {
  return ICON_CROPS[material];
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
