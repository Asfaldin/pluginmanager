import * as yaml from "js-yaml";
import type { MenuButton, MenuGuiContent } from "./types";

// A lore/description line that's just "~" (a common decorative divider in
// item lore) parses as YAML null, not the literal text "~" - unquoted, YAML
// only recognizes "~" as null when it's the WHOLE scalar. Left as null it
// crashes MinecraftTextInput's color-code parser (calls .length on it), so
// restore the most likely intended text instead of passing null through.
function sanitizeLoreLine(raw: any): string {
  return raw == null ? "~" : String(raw);
}

function parseButton(raw: any): MenuButton {
  return {
    slot: Number(raw.slot),
    material: raw.material,
    nazwa: raw.nazwa ?? "",
    lore: Array.isArray(raw.lore) ? raw.lore.map(sanitizeLoreLine) : [],
    komenda: raw.komenda ?? "",
  };
}

function serializeButton(b: MenuButton): Record<string, any> {
  return { slot: b.slot, material: b.material, nazwa: b.nazwa, lore: b.lore, komenda: b.komenda };
}

export function parseMenuGuiContent(text: string): MenuGuiContent {
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  return {
    size: Number(raw.size ?? 45),
    tlo: raw.tlo ?? "GRAY_STAINED_GLASS_PANE",
    przyciski: Array.isArray(raw.przyciski) ? raw.przyciski.map(parseButton) : [],
  };
}

export function serializeMenuGuiContent(content: MenuGuiContent): string {
  return yaml.dump({ size: content.size, tlo: content.tlo, przyciski: content.przyciski.map(serializeButton) }, { lineWidth: -1 });
}
