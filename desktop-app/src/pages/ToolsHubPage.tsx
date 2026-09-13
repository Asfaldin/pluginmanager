import {
  Award,
  Axe,
  Boxes,
  Compass,
  FileText,
  Fish,
  Gem,
  Gift,
  Hammer,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Palette,
  Palmtree,
  PawPrint,
  Rocket,
  ScrollText,
  Settings,
  Skull,
  Sprout,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PLUGIN_ART } from "../lib/pluginArt";

interface Tool {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Klucz do PLUGIN_ART (ten sam co w Sklepie) - jeśli jest grafika, karta dostaje ją zamiast samej ikonki. */
  pluginId?: string;
}

interface ToolGroup {
  title: string;
  tools: Tool[];
}

// Grouped by what a tool actually manages, not by when it was added - flat
// alphabetical/chronological lists stop being readable somewhere around a
// dozen tiles, and grouping is what actually helps someone find the right
// one instead of scanning the whole grid every time.
const TOOL_GROUPS: ToolGroup[] = [
  {
    title: "Ekonomia i itemy",
    tools: [
      {
        to: "/items",
        title: "Kreator itemów sklepu",
        description: "Buduj pozycje sklepu (mainplugins-shop): materiał, slot, ceny, lore.",
        icon: Hammer,
      },
      {
        to: "/customitems",
        title: "Custom itemy",
        description: "Własne przedmioty z nazwą, opisem i enchantami — do sklepu, skrzynek, questów i nagród.",
        icon: Gem,
      },
      {
        to: "/crates",
        title: "Skrzynie (crates)",
        description: "Twoje skrzynki: wygląd, klucze (własne albo wspólne) i wygrane — pieniądze, itemy, klucze i więcej.",
        icon: Gift,
      },
      {
        to: "/evolvingtools",
        title: "Ewoluujące narzędzia",
        description: "Poziomy, enczanty, kamienie milowe z efektami i custom staty — na wzór Kilofa Niflheim, w pełni z YAML.",
        icon: Axe,
      },
      {
        to: "/generators",
        title: "Generatory (tier 2-4)",
        description: "Nowe tiery generatorów bruku/piasku — materiał, odnowa, tabela dropów z % szansy per surowiec.",
        icon: Boxes,
      },
      {
        to: "/redstone",
        title: "Redstone (przewody + sadzarka)",
        description: "Drony sadzące/zbierające zasilane redstonem, sadzarka, oraz golemy przenoszące itemy między połączonymi skrzynkami.",
        icon: Zap,
      },
      {
        to: "/spawners",
        title: "Customowe spawnery",
        description: "Typy spawnerów (encja, nazwy), limit na wyspę, promień aktywności, krzywe interwału/ilości na poziom.",
        icon: PawPrint,
      },
      {
        to: "/fishing",
        title: "Łowienie",
        description: "Gatunki ryb (waga losowania, rzadkość), trudność minigry paska, szansa na bonusową skrzynkę.",
        icon: Fish,
      },
      {
        to: "/farming",
        title: "Uprawy specjalne",
        description: "Ilość złotej marchewki ze zbioru dojrzałej rośliny.",
        icon: Sprout,
      },
    ],
  },
  {
    title: "Questy i progresja",
    tools: [
      {
        to: "/quests",
        title: "Questy",
        description: "Pełny, klikalny podgląd i edytor menu questów — dokładnie jak w grze.",
        icon: ScrollText,
      },
      {
        to: "/islands",
        title: "Wyspy (Skyblock)",
        description: "Układ GUI paneli wyspy (klikalny, jak w grze) i pełna konfiguracja: border, spawnery, sniffer.",
        icon: Palmtree,
      },
      {
        to: "/dungeons",
        title: "Loch i boss",
        description: "Proof-of-concept: rozmiar/materiały platform, skalowanie strażników per pokój, balans i progi fazowe bossa.",
        icon: Skull,
      },
    ],
  },
  {
    title: "Serwer i społeczność",
    tools: [
      {
        to: "/core",
        title: "Ustawienia serwera",
        description: "Język serwera (PL/EN), czyje pieniądze (nasze albo Vault) i nazwy komend dla graczy.",
        icon: Settings,
      },
      {
        to: "/announcements",
        title: "Announcer",
        description: "Cykliczne ogłoszenia na czacie - kolory, interwały, kolejność.",
        icon: Megaphone,
      },
      {
        to: "/spawn",
        title: "Spawn, warpy, obszary",
        description: "Punkt spawnu, warpy i chronione obszary — edycja bez wychodzenia z gry.",
        icon: Compass,
      },
      {
        to: "/menu",
        title: "Główne Menu Serwera",
        description: "Układ /menu — ikony, nazwy, opisy i komendy przycisków, klikalny podgląd jak w grze.",
        icon: LayoutGrid,
      },
      {
        to: "/chatfilter",
        title: "Filtr czatu",
        description: "Progi anty-spam/anty-caps/anty-reklama/długość/powtórzenia, wyjęte rangi per filtr.",
        icon: MessageSquare,
      },
      {
        to: "/ranks",
        title: "Rangi",
        description: "Prefiks i kolor nicku dla Gracza/VIP/Admina, plus szybkie nadanie rangi graczowi.",
        icon: Award,
      },
      {
        to: "/hud",
        title: "HUD i placeholdery",
        description: "Rotujące pro tipy stopki TAB, timing rotacji, fałszywe dane topek na świeżym serwerze.",
        icon: Tv,
      },
    ],
  },
  {
    title: "Zasoby i wdrożenie",
    tools: [
      {
        to: "/resourcepack",
        title: "Texture Pack",
        description: "Edytor resource packa: własne tekstury, usuwanie tła GUI, baza Vanilla.",
        icon: Palette,
      },
      {
        to: "/config",
        title: "Edytor configów",
        description: "Przeglądaj i edytuj pliki konfiguracyjne pluginów na serwerze.",
        icon: FileText,
      },
      {
        to: "/deploy",
        title: "Wdrożenie",
        description: "Build lokalny (mvn package) i wysyłka jarów z dist/ na serwer jednym przyciskiem.",
        icon: Rocket,
      },
    ],
  },
];

export default function ToolsHubPage() {
  return (
    <div className="page">
      <h1>Twoje pluginy</h1>
      <p className="muted">Wybierz plugin, żeby edytować jego zawartość i konfigurację.</p>

      {TOOL_GROUPS.map((group) => (
        <section key={group.title} className="tools-group">
          <h2 className="tools-group-title">{group.title}</h2>
          <div className="tools-grid">
            {group.tools.map((tool) => {
              const art = tool.pluginId ? PLUGIN_ART[tool.pluginId] : undefined;
              return (
                <Link key={tool.to} to={tool.to} className={art ? "tool-card has-art" : "tool-card"}>
                  {art && <img src={art} alt="" className="tool-card-art" />}
                  <div className={art ? "tool-card-body" : undefined}>
                    <div className="tool-card-head">
                      {!art && (
                        <span className="tool-card-icon">
                          <tool.icon size={20} strokeWidth={1.75} />
                        </span>
                      )}
                      <div className="tool-card-title">{tool.title}</div>
                    </div>
                    <div className="tool-card-desc">{tool.description}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
