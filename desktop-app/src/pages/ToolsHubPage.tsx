import {
  Award,
  Axe,
  Boxes,
  Coins,
  Compass,
  FileText,
  Fish,
  Gem,
  Gift,
  Hammer,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Palmtree,
  PawPrint,
  Rocket,
  ScrollText,
  Skull,
  Sprout,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { shopMyLicenses } from "../lib/api";
import { FREE_PLUGIN_IDS } from "../lib/freePlugins";
import { ownsPluginId } from "../lib/licenses";
import { PLUGIN_ART } from "../lib/pluginArt";
import { useAuth } from "../state/AuthContext";
import type { LicenseRecord } from "../lib/types";

interface Tool {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Klucz do PLUGIN_ART (ten sam co w Sklepie) - jeśli jest grafika, karta dostaje ją zamiast samej ikonki.
      Też do plakietki "posiadasz"/kłódki - jeśli brak, karta jest zawsze bez plakietki (np. Edytor configów,
      Wdrożenie - to narzędzia appki, nie jeden konkretny plugin). */
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
        title: "Sklep serwerowy",
        description: "Kategorie i przedmioty sklepu serwerowego: ceny kupna i skupu, stacki, rotacja, ceny dynamiczne, wygląd menu. Szablony Mały i Duży.",
        icon: Hammer,
        pluginId: "shop",
      },
      {
        to: "/market",
        title: "Targ graczy",
        description: "Gracze wystawiają przedmioty za swoją cenę: limity ofert, wygasanie, skrzynka „Do odebrania”, podatek, wygląd menu.",
        icon: Coins,
        pluginId: "market",
      },
      {
        to: "/customitems",
        title: "Custom itemy",
        description: "Własne przedmioty z nazwą, opisem i enchantami - do sklepu, skrzynek, questów i nagród.",
        icon: Gem,
        pluginId: "tools",
      },
      {
        to: "/crates",
        title: "Skrzynie (crates)",
        description: "Twoje skrzynki: wygląd, klucze (własne albo wspólne) i wygrane - pieniądze, itemy, klucze i więcej.",
        icon: Gift,
        pluginId: "crates",
      },
      {
        to: "/evolvingtools",
        title: "Ewoluujące narzędzia",
        description: "Poziomy, enczanty, kamienie milowe z efektami i custom staty - na wzór Kilofa Niflheim, w pełni z YAML.",
        icon: Axe,
        pluginId: "tools",
      },
      {
        to: "/generators",
        title: "Generatory (tier 2-4)",
        description: "Nowe tiery generatorów bruku/piasku - materiał, odnowa, tabela dropów z % szansy per surowiec.",
        icon: Boxes,
        pluginId: "generators",
      },
      {
        to: "/redstone",
        title: "Redstone (przewody + sadzarka)",
        description: "Drony sadzące/zbierające zasilane redstonem, sadzarka, oraz golemy przenoszące itemy między połączonymi skrzynkami.",
        icon: Zap,
        pluginId: "redstone",
      },
      {
        to: "/spawners",
        title: "Customowe spawnery",
        description: "Typy spawnerów (encja, nazwy), limit na wyspę, promień aktywności, krzywe interwału/ilości na poziom.",
        icon: PawPrint,
        pluginId: "spawners",
      },
      {
        to: "/fishing",
        title: "Łowienie",
        description: "Gatunki ryb (waga losowania, rzadkość), trudność minigry paska, szansa na bonusową skrzynkę.",
        icon: Fish,
        pluginId: "fishing",
      },
      {
        to: "/farming",
        title: "Uprawy specjalne",
        description: "Ilość złotej marchewki ze zbioru dojrzałej rośliny.",
        icon: Sprout,
        pluginId: "farming",
      },
    ],
  },
  {
    title: "Questy i progresja",
    tools: [
      {
        to: "/quests",
        title: "Questy",
        description: "Kategorie i zadania: co gracz musi zrobić i co za to dostaje. Gotowe szablony (mały EN/PL, duży PL).",
        icon: ScrollText,
        pluginId: "quests",
      },
      {
        to: "/islands",
        title: "Wyspy (Skyblock)",
        description: "Układ GUI paneli wyspy (klikalny, jak w grze) i pełna konfiguracja: border, spawnery, sniffer.",
        icon: Palmtree,
        pluginId: "skyblock",
      },
      {
        to: "/dungeons",
        title: "Loch i boss",
        description: "Proof-of-concept: rozmiar/materiały platform, skalowanie strażników per pokój, balans i progi fazowe bossa.",
        icon: Skull,
        pluginId: "dungeons",
      },
    ],
  },
  {
    title: "Serwer i społeczność",
    tools: [
      {
        to: "/announcements",
        title: "Announcer",
        description: "Cykliczne ogłoszenia na czacie - kolory, interwały, kolejność.",
        icon: Megaphone,
        pluginId: "announcer",
      },
      {
        to: "/spawn",
        title: "Spawn, warpy, obszary",
        description: "Punkt spawnu, warpy i chronione obszary - edycja bez wychodzenia z gry.",
        icon: Compass,
        pluginId: "spawn",
      },
      {
        to: "/menu",
        title: "Główne Menu Serwera",
        description: "Układ /menu - ikony, nazwy, opisy i komendy przycisków, klikalny podgląd jak w grze.",
        icon: LayoutGrid,
        pluginId: "menu",
      },
      {
        to: "/chatfilter",
        title: "Filtr czatu",
        description: "Progi anty-spam/anty-caps/anty-reklama/długość/powtórzenia, wyjęte rangi per filtr.",
        icon: MessageSquare,
        pluginId: "chatfilter",
      },
      {
        to: "/ranks",
        title: "Rangi",
        description: "Prefiks i kolor nicku dla Gracza/VIP/Admina, plus szybkie nadanie rangi graczowi.",
        icon: Award,
        pluginId: "ranks",
      },
      {
        to: "/hud",
        title: "HUD i placeholdery",
        description: "Rotujące pro tipy stopki TAB, timing rotacji, fałszywe dane topek na świeżym serwerze.",
        icon: Tv,
        pluginId: "hud",
      },
    ],
  },
  {
    title: "Zasoby i wdrożenie",
    tools: [
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
  const { customer } = useAuth();
  const [licenses, setLicenses] = useState<LicenseRecord[] | null>(null);
  const [search, setSearch] = useState("");

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TOOL_GROUPS;
    return TOOL_GROUPS.map((group) => ({
      ...group,
      tools: group.tools.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    })).filter((group) => group.tools.length > 0);
  }, [search]);

  useEffect(() => {
    if (!customer) return;
    shopMyLicenses()
      .then(setLicenses)
      .catch(() => setLicenses([]));
  }, [customer]);

  // Logowanie jest dziś wymuszone globalnie na poziomie Layout.tsx (patrz app-gate-wrap
  // tam) - ta strona nie musi już sama blokować się bez konta, robi to appka wcześniej.
  return (
    <div className="page">
      <h1>Twoje pluginy</h1>
      <p className="muted">Wybierz plugin, żeby edytować jego zawartość i konfigurację.</p>

      <div className="shop-search" style={{ marginBottom: "1.2rem" }}>
        <Search size={16} strokeWidth={1.75} />
        <input
          placeholder="Szukaj pluginu po nazwie albo opisie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {visibleGroups.length === 0 && <p className="muted">Brak wyników dla tego wyszukiwania.</p>}

      {visibleGroups.map((group) => (
        <section key={group.title} className="tools-group">
          <h2 className="tools-group-title">{group.title}</h2>
          <div className="tools-grid">
            {group.tools.map((tool) => {
              const art = tool.pluginId ? PLUGIN_ART[tool.pluginId] : undefined;
              const owned =
                tool.pluginId != null &&
                (FREE_PLUGIN_IDS.has(tool.pluginId) || (licenses != null && ownsPluginId(licenses, tool.pluginId)));
              const locked = tool.pluginId != null && customer != null && licenses != null && !owned;
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
                      {customer && owned && <span className="tool-card-badge tool-card-badge-owned">Posiadasz</span>}
                      {locked && (
                        <span className="tool-card-badge tool-card-badge-locked">
                          <Lock size={12} strokeWidth={2} /> Brak licencji
                        </span>
                      )}
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
