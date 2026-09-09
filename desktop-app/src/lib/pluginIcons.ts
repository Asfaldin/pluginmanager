import {
  Award,
  Carrot,
  Coins,
  Compass,
  Fish,
  Gift,
  LayoutGrid,
  Megaphone,
  Package,
  Palmtree,
  PawPrint,
  MessageSquare,
  Puzzle,
  ScrollText,
  Skull,
  Sparkles,
  Store,
  Trophy,
  Tv,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Ta sama ikona per plugin co w PluginGraph.tsx (ekosystem na Dashboardzie) - osobna
// kopia mapy zamiast importu stamtąd, żeby nie ryzykować refaktoru już przetestowanego
// komponentu. Używane jako ikona nagłówka na PluginDetailPage.tsx.
export const PLUGIN_ICONS: Record<string, LucideIcon> = {
  core: Puzzle,
  advancements: Trophy,
  chatfilter: MessageSquare,
  crates: Gift,
  dungeons: Skull,
  fishing: Fish,
  hud: Tv,
  market: Coins,
  quests: ScrollText,
  ranks: Award,
  redstone: Zap,
  shop: Store,
  skyblock: Palmtree,
  spawn: Compass,
  spawners: PawPrint,
  tools: Wrench,
  announcer: Megaphone,
  farming: Carrot,
  menu: LayoutGrid,
  teleport: Sparkles,
};

/** Domyślna ikona dla pakietów (nie są "pluginem" same w sobie, więc nie ma dla nich wpisu wyżej). */
export const PACKAGE_ICON: LucideIcon = Package;
