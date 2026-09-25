import { useEffect, useMemo, useState } from "react";
import { ALL_ITEMS } from "../lib/minecraftItems";
import MaterialIcon from "./MaterialIcon";

interface Props {
  packDir: string;
  onEdit: (material: string) => void;
}

const PAGE_SIZE = 120;

function displayName(material: string): string {
  return material
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Siatka wszystkich przedmiotów Minecrafta (ta sama lista co w pozostałych edytorach) -
 * ikonki czyta live z aktualnej paczki, więc od razu widać Twoje zmiany. Kliknięcie
 * otwiera edytor tekstury tego przedmiotu (patrz openItemEditor w ResourcePackPage). */
export default function ItemTextureBrowser({ packDir, onEdit }: Props) {
  const [filterText, setFilterText] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return ALL_ITEMS;
    return ALL_ITEMS.filter((m) => m.toLowerCase().includes(q) || displayName(m).toLowerCase().includes(q));
  }, [filterText]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterText]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="texture-browser">
      <input
        placeholder="Szukaj przedmiotu, np. Diamond Sword..."
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        className="texture-browser-search"
      />

      {filtered.length === 0 ? (
        <p className="muted">Brak przedmiotów pasujących do wyszukiwania.</p>
      ) : (
        <>
          <div className="texture-grid">
            {visible.map((m) => (
              <div key={m} className="texture-tile" onClick={() => onEdit(m)} title={m}>
                <div className="texture-tile-preview">
                  <MaterialIcon material={m} iconPackDir={packDir} className="item-grid-icon" />
                </div>
                <div className="texture-tile-name">{displayName(m)}</div>
              </div>
            ))}
          </div>
          {filtered.length > visibleCount && (
            <div className="row">
              <button type="button" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                Pokaż więcej ({filtered.length - visibleCount} pozostało)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
