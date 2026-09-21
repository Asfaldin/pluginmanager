import { Lock, X } from "lucide-react";
import { useState } from "react";
import { FREE_PLUGIN_IDS } from "../lib/freePlugins";
import { PLUGIN_LINKS, RING_IDS, STANDALONE_IDS } from "../lib/pluginEcosystem";
import { PLUGIN_ICONS, PLUGIN_LABELS } from "../lib/pluginIcons";
import type { LicenseRecord } from "../lib/types";

const ALL_PLUGIN_IDS = [...RING_IDS, ...STANDALONE_IDS];

/** Ta sama logika co licenseGrants w license-server/src/db.js (plugin="*", albo lista
    po przecinku) - plus pluginy zawsze darmowe (patrz freePlugins.ts). */
function computeOwnedIds(licenses: LicenseRecord[]): Set<string> {
  const owned = new Set(FREE_PLUGIN_IDS);
  for (const l of licenses) {
    if (l.status !== "active") continue;
    if (l.plugin === "*") {
      ALL_PLUGIN_IDS.forEach((id) => owned.add(id));
      continue;
    }
    l.plugin.split(",").forEach((id) => owned.add(id.trim()));
  }
  return owned;
}

/** Krótka nazwa bez dopisku w nawiasie (np. "Sklep (ekonomia)" -> "Sklep"). */
function shortLabel(id: string): string {
  return (PLUGIN_LABELS[id] ?? id).split(" (")[0];
}

// Kto z kim jest połączony, licząc w obie strony (patrz PLUGIN_LINKS - tam kierunek
// "kto kogo woła" ma znaczenie dla dokumentacji kodu, ale na diagramie po kliknięciu
// węzła chcemy pokazać połączenie niezależnie od tego, z której strony ktoś klika).
// Budowane raz przy starcie modułu, nie przy każdym renderze - dane są stałe.
const ADJACENCY: Map<string, Set<string>> = (() => {
  const adj = new Map<string, Set<string>>();
  function link(a: string, b: string) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  for (const id of RING_IDS) link(id, "core");
  for (const [a, targets] of Object.entries(PLUGIN_LINKS)) {
    for (const b of targets) link(a, b);
  }
  return adj;
})();

// Węzły rozłożone pełnym kołem wokół Core na środku - viewBox kwadratowy (0-100 x 0-100),
// pierwszy węzeł u góry (kierunek zegara), reszta co 360°/n stopni dalej.
const CORE_X = 50;
const CORE_Y = 50;
const RING_RADIUS = 40;

interface RingPoint {
  id: string;
  x: number;
  y: number;
}

const RING_POINTS: RingPoint[] = RING_IDS.map((id, i) => {
  const deg = -90 + (i / RING_IDS.length) * 360; // start od góry, zgodnie ze wskazówkami zegara
  const rad = (deg * Math.PI) / 180;
  return { id, x: CORE_X + RING_RADIUS * Math.cos(rad), y: CORE_Y + RING_RADIUS * Math.sin(rad) };
});

const RING_POINT_BY_ID = new Map(RING_POINTS.map((p) => [p.id, p]));

// Cięciwy między konkretnymi węzłami pierścienia (patrz PLUGIN_LINKS) - jedna para na
// krawędź, nie dwie (a->b i b->a), stąd budowane raz tutaj zamiast w renderze.
const CROSS_EDGES: Array<{ fromId: string; toId: string; from: RingPoint; to: RingPoint }> = [];
for (const [fromId, targets] of Object.entries(PLUGIN_LINKS)) {
  const from = RING_POINT_BY_ID.get(fromId);
  if (!from) continue;
  for (const toId of targets) {
    const to = RING_POINT_BY_ID.get(toId);
    if (to) CROSS_EDGES.push({ fromId, toId, from, to });
  }
}

/** Punkt kontrolny łuku (cięciwy) - lekko wygięty w stronę Core, żeby nie nakładał się
    na prosty promień i wizualnie różnił się od "szprych" do Core. */
function chordPath(from: RingPoint, to: RingPoint): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const ctrlX = midX + (CORE_X - midX) * 0.35;
  const ctrlY = midY + (CORE_Y - midY) * 0.35;
  return `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`;
}

function NodeIcon({
  id,
  owned,
  size,
  focused,
  onClick,
}: {
  id: string;
  owned: boolean;
  size: number;
  focused?: boolean;
  onClick?: () => void;
}) {
  const Icon = PLUGIN_ICONS[id];
  const cls = ["eco-node", owned && "is-owned", focused && "is-focused"].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} style={{ width: size, height: size }} onClick={onClick} title={PLUGIN_LABELS[id] ?? id}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.6} />
      {!owned && (
        <span className="eco-node-lock">
          <Lock size={10} strokeWidth={2.25} />
        </span>
      )}
    </button>
  );
}

/** Ekosystem pluginów na Dashboardzie - Core jako hub na środku, reszta pełnym kołem
    dookoła (szprychy = prawdziwa zależność w pom.xml), plus cięciwy między konkretnymi
    pluginami tam, gdzie jeden realnie woła serwis drugiego w czasie działania (patrz
    pluginEcosystem.ts - dane wyciągnięte z kodu, nie zgadywane). Statyczny układ, bez
    zoom/pan. Klik na węzeł włącza "tryb ogniskowania": jego własne połączenia zostają
    pełne i podświetlone, reszta przygasa, a podpis nad diagramem wypisuje je słownie -
    samo przyciemnienie linii nie zawsze wystarczy, żeby było oczywiste, o co chodzi. */
export default function PluginEcosystem({ licenses }: { licenses: LicenseRecord[] }) {
  const owned = computeOwnedIds(licenses);
  const coreOwned = owned.has("core");
  const [selected, setSelected] = useState<string | null>(null);

  const related = selected ? new Set([selected, ...(ADJACENCY.get(selected) ?? [])]) : null;

  function toggleSelect(id: string) {
    setSelected((prev) => (prev === id ? null : id));
  }

  function nodeDimClass(id: string): string {
    return related && !related.has(id) ? "eco-node-wrap is-dimmed" : "eco-node-wrap";
  }

  const connectionLabel = selected
    ? [...(ADJACENCY.get(selected) ?? [])]
        .map((id) => shortLabel(id))
        .sort((a, b) => a.localeCompare(b))
        .join(", ")
    : "";

  return (
    <div className="plugin-ecosystem">
      <div className="eco-focus-bar">
        {selected ? (
          <>
            <span>
              <strong>{shortLabel(selected)}</strong>
              {connectionLabel ? ` łączy się z: ${connectionLabel}` : " nie łączy się z żadnym innym pluginem"}
            </span>
            <button type="button" className="eco-focus-clear" onClick={() => setSelected(null)}>
              <X size={13} strokeWidth={2} /> Wyczyść
            </button>
          </>
        ) : (
          <span className="muted small">Kliknij plugin, żeby zobaczyć jego połączenia.</span>
        )}
      </div>

      <div className="eco-diagram">
        <svg viewBox="0 0 100 100" className="eco-lines" preserveAspectRatio="none">
          {RING_POINTS.map((p) => {
            const inFocus = selected != null && (selected === "core" || selected === p.id);
            const dimmed = selected != null && !inFocus;
            const lit = coreOwned && owned.has(p.id);
            return (
              <line
                key={`spoke-${p.id}`}
                x1={CORE_X}
                y1={CORE_Y}
                x2={p.x}
                y2={p.y}
                className={[
                  "eco-spoke",
                  lit && !dimmed && "is-lit",
                  inFocus && "is-focus-active",
                  dimmed && "is-dimmed",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          })}
          {CROSS_EDGES.map((e, i) => {
            const inFocus = selected != null && (selected === e.fromId || selected === e.toId);
            const dimmed = selected != null && !inFocus;
            const lit = owned.has(e.fromId) && owned.has(e.toId);
            return (
              <path
                key={`chord-${i}`}
                d={chordPath(e.from, e.to)}
                className={["eco-chord", lit && !dimmed && "is-lit", inFocus && "is-focus-active", dimmed && "is-dimmed"]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          })}
        </svg>

        <div className={nodeDimClass("core")} style={{ left: `${CORE_X}%`, top: `${CORE_Y}%` }}>
          <NodeIcon id="core" owned={coreOwned} size={64} focused={selected === "core"} onClick={() => toggleSelect("core")} />
          <span className="eco-node-label eco-node-label-core">Core</span>
        </div>

        {RING_POINTS.map((p) => (
          <div key={p.id} className={nodeDimClass(p.id)} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <NodeIcon id={p.id} owned={owned.has(p.id)} size={46} focused={selected === p.id} onClick={() => toggleSelect(p.id)} />
            <span className="eco-node-label">{shortLabel(p.id)}</span>
          </div>
        ))}
      </div>

      <div className="eco-standalone">
        <div className="eco-group-title">Niezależne - nie potrzebują żadnego innego pluginu</div>
        <div className="eco-standalone-row">
          {STANDALONE_IDS.map((id) => (
            <div key={id} className={related && !related.has(id) ? "eco-standalone-item is-dimmed" : "eco-standalone-item"}>
              <NodeIcon id={id} owned={owned.has(id)} size={40} focused={selected === id} onClick={() => toggleSelect(id)} />
              <span className="eco-node-label">{shortLabel(id)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
