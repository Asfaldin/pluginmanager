import {
  Award,
  Boxes,
  Coins,
  Compass,
  Fish,
  Gift,
  LayoutGrid,
  Megaphone,
  Palmtree,
  PawPrint,
  Puzzle,
  ScrollText,
  Skull,
  Sparkles,
  Store,
  Tv,
  Wrench,
  Zap,
  MessageSquare,
  Carrot,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FREE_PLUGIN_IDS } from "../lib/freePlugins";
import type { LicenseRecord } from "../lib/types";

interface GraphNode {
  id: string;
  label: string;
  icon: LucideIcon;
}

// Prawdziwa struktura zależności z repo Mainplugins (odczytana z pom.xml każdego
// modułu, nie zgadywana) - mainplugins-core to współdzielone API/serwisy (m.in.
// licencje, patrz LicenseManager), większość pluginów go wymaga i nie odpali się
// bez niego na serwerze. Kilka działa w pełni samodzielnie. Aktualizować ręcznie,
// jeśli w przyszłości ktoś doda pluginowi zależność od core albo ją usunie.
const CORE: GraphNode = { id: "core", label: "Core", icon: Puzzle };

const DEPENDENTS: GraphNode[] = [
  { id: "chatfilter", label: "Chat Filter", icon: MessageSquare },
  { id: "crates", label: "Crates", icon: Gift },
  { id: "dungeons", label: "Dungeons", icon: Skull },
  { id: "fishing", label: "Fishing", icon: Fish },
  { id: "generators", label: "Generators", icon: Boxes },
  { id: "hud", label: "HUD", icon: Tv },
  { id: "market", label: "Market", icon: Coins },
  { id: "quests", label: "Quests", icon: ScrollText },
  { id: "ranks", label: "Ranks", icon: Award },
  { id: "redstone", label: "Redstone", icon: Zap },
  { id: "shop", label: "Shop", icon: Store },
  { id: "skyblock", label: "Skyblock", icon: Palmtree },
  { id: "spawn", label: "Spawn", icon: Compass },
  { id: "spawners", label: "Spawners", icon: PawPrint },
  { id: "tools", label: "Tools", icon: Wrench },
];

const STANDALONE: GraphNode[] = [
  { id: "announcer", label: "Announcer", icon: Megaphone },
  { id: "farming", label: "Farming", icon: Carrot },
  { id: "menu", label: "Menu", icon: LayoutGrid },
  { id: "teleport", label: "Teleport", icon: Sparkles },
];

const ALL_IDS = [CORE.id, ...DEPENDENTS.map((n) => n.id), ...STANDALONE.map((n) => n.id)];

// Pluginy bez bramki licencyjnej w kodzie (patrz onEnable() w każdym module) - jedno
// źródło prawdy w lib/freePlugins.ts, współdzielone z DeployPage.
const ALWAYS_INCLUDED = FREE_PLUGIN_IDS;

/** Id pluginów, do których użytkownik ma dziś realny dostęp: zawsze dołączone za darmo
    (patrz ALWAYS_INCLUDED) plus wszystko pokryte jego aktywnymi licencjami (pojedynczy
    plugin, lista pakietu po przecinku, albo "*" - ta sama logika co licenseGrants w
    license-server/src/db.js). */
function computeOwnedIds(licenses: LicenseRecord[]): Set<string> {
  const owned = new Set(ALWAYS_INCLUDED);
  for (const l of licenses) {
    if (l.status !== "active") continue;
    if (l.plugin === "*") {
      ALL_IDS.forEach((id) => owned.add(id));
      continue;
    }
    l.plugin.split(",").forEach((id) => owned.add(id.trim()));
  }
  return owned;
}

const ORBIT_RADIUS = 38; // % promienia orbity wokół centrum, w układzie viewBox 0-100
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Wizualizacja "kto od kogo zależy" w Mainplugins - core na środku, reszta pluginów
    dookoła połączona liniami, plus osobna grupa pluginów, które core'a nie potrzebują.
    Pluginy, do których user ma dziś dostęp (za darmo albo z licencji), świecą kolorem
    sukcesu; reszta zostaje szara. Kółko scrolla lub przyciski +/- przybliżają/oddalają
    (przydatne przy 15 węzłach na orbicie - z bliska etykiety się nie zlewają). */
export default function PluginGraph({ licenses }: { licenses: LicenseRecord[] }) {
  const owned = computeOwnedIds(licenses);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);

  // Natywny listener zamiast onWheel z Reacta - React 17+ dopina wheel/touch na
  // rootcie jako pasywne dla wydajności scrolla, więc synthetic event.preventDefault()
  // tam nie zadziała i strona przewinie się pod spodem zamiast zoomować sam graf.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setZoom((z) => clamp(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), MIN_ZOOM, MAX_ZOOM));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Przesuwanie łapką myszy - offset (pan) siedzi w surowych pikselach i w transformie
  // jest dodawany PO scale(), więc 1px ruchu myszy to zawsze 1px przesunięcia na
  // ekranie, niezależnie od aktualnego przybliżenia (patrz kolejność funkcji w
  // transform niżej). setPointerCapture trzyma zdarzenia nawet gdy kursor na chwilę
  // wyjedzie poza viewport przy szybkim ruchu.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".plugin-graph-zoom-controls")) return;
    dragStartRef.current = { pointerX: e.clientX, pointerY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    setPan({ x: start.panX + (e.clientX - start.pointerX), y: start.panY + (e.clientY - start.pointerY) });
  }

  function endDrag() {
    dragStartRef.current = null;
    setDragging(false);
  }

  const n = DEPENDENTS.length;
  const points = DEPENDENTS.map((node, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2; // start od góry, zgodnie ze wskazówkami zegara
    const x = 50 + ORBIT_RADIUS * Math.cos(angle);
    const y = 50 + ORBIT_RADIUS * Math.sin(angle);
    return { ...node, x, y };
  });

  function nodeClass(base: string, id: string): string {
    return owned.has(id) ? `${base} is-owned` : base;
  }

  return (
    <div className="plugin-graph">
      <div
        className={dragging ? "plugin-graph-viewport is-dragging" : "plugin-graph-viewport"}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="plugin-graph-zoom-controls">
          <button type="button" onClick={() => setZoom((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} title="Oddal">
            −
          </button>
          <span className="plugin-graph-zoom-value">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} title="Przybliż">
            +
          </button>
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              title="Resetuj widok"
              className="plugin-graph-zoom-reset"
            >
              reset
            </button>
          )}
        </div>
        <div
          className="plugin-graph-ring"
          style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}
        >
          <svg viewBox="0 0 100 100" className="plugin-graph-lines" preserveAspectRatio="none">
            {points.map((p) => (
              <line key={p.id} x1={50} y1={50} x2={p.x} y2={p.y} />
            ))}
          </svg>
          <div className={nodeClass("plugin-graph-node plugin-graph-core", CORE.id)} style={{ left: "50%", top: "50%" }}>
            <span className="plugin-graph-dot">
              <CORE.icon size={22} strokeWidth={1.75} />
            </span>
            <span className="plugin-graph-label">{CORE.label}</span>
          </div>
          {points.map((p) => (
            <div key={p.id} className={nodeClass("plugin-graph-node", p.id)} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <span className="plugin-graph-dot">
                <p.icon size={16} strokeWidth={1.75} />
              </span>
              <span className="plugin-graph-label">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="plugin-graph-standalone">
        <div className="muted small" style={{ marginBottom: "0.4rem" }}>
          Niezależne - nie wymagają Core:
        </div>
        <div className="plugin-graph-standalone-row">
          {STANDALONE.map((node) => (
            <span key={node.id} className={owned.has(node.id) ? "plugin-graph-standalone-chip is-owned" : "plugin-graph-standalone-chip"}>
              <node.icon size={14} strokeWidth={1.75} aria-hidden="true" /> {node.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
