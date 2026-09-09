import { useEffect, useMemo, useRef, useState } from "react";
import { rpTextureStatus } from "../lib/api";

interface Props {
  packDir: string;
  textures: string[];
  onEdit: (relPath: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  block: "Bloki",
  item: "Itemy",
  gui: "GUI",
  entity: "Byty i moby",
  particle: "Cząsteczki",
  environment: "Środowisko",
  painting: "Obrazy",
  font: "Czcionka",
  misc: "Różne",
  models: "Modele (zbroje itd.)",
  colormap: "Mapy kolorów",
  map: "Mapy",
  effect: "Efekty",
  trims: "Zdobienia zbroi",
};

const PAGE_SIZE = 120;

function categorizeTexture(relPath: string): string {
  const match = relPath.match(/\/textures\/([^/]+)\//);
  return match ? match[1] : "inne";
}

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

function fileName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

function TextureThumbnail({ packDir, relPath, onEdit }: { packDir: string; relPath: string; onEdit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [triedLoad, setTriedLoad] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTriedLoad(true);
          rpTextureStatus(packDir, relPath)
            .then((st) => setPreview(st.preview_data_url))
            .catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packDir, relPath]);

  return (
    <div ref={ref} className="texture-tile" onClick={onEdit} title={relPath}>
      <div className="texture-tile-preview">
        {preview ? <img src={preview} alt={fileName(relPath)} /> : <span className="muted small">{triedLoad ? "brak" : "…"}</span>}
      </div>
      <div className="texture-tile-name">{fileName(relPath)}</div>
    </div>
  );
}

export default function TextureBrowser({ packDir, textures, onEdit }: Props) {
  const [category, setCategory] = useState<string>("wszystkie");
  const [filterText, setFilterText] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of textures) {
      const c = categorizeTexture(t);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [textures]);

  const filtered = useMemo(() => {
    let list = category === "wszystkie" ? textures : textures.filter((t) => categorizeTexture(t) === category);
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((t) => t.toLowerCase().includes(q));
    }
    return list;
  }, [textures, category, filterText]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, filterText]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="texture-browser">
      <div className="row texture-browser-categories">
        <button type="button" className={category === "wszystkie" ? "active" : ""} onClick={() => setCategory("wszystkie")}>
          Wszystkie ({textures.length})
        </button>
        {categories.map(([key, count]) => (
          <button key={key} type="button" className={category === key ? "active" : ""} onClick={() => setCategory(key)}>
            {categoryLabel(key)} ({count})
          </button>
        ))}
      </div>

      <input
        placeholder="Szukaj po nazwie lub ścieżce..."
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        className="texture-browser-search"
      />

      {filtered.length === 0 ? (
        <p className="muted">Brak tekstur w tej kategorii (lub żadna nie pasuje do wyszukiwania).</p>
      ) : (
        <>
          <div className="texture-grid">
            {visible.map((t) => (
              <TextureThumbnail key={t} packDir={packDir} relPath={t} onEdit={() => onEdit(t)} />
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
