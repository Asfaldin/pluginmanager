import { openUrl } from "@tauri-apps/plugin-opener";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { shopCatalog, shopCheckoutUrl, shopMyLicenses } from "../lib/api";
import { FREE_PLUGINS } from "../lib/freePlugins";
import { PLUGIN_ART } from "../lib/pluginArt";
import type { Catalog, CatalogPlugin, LicenseRecord } from "../lib/types";

type SortMode = "name" | "price-asc" | "price-desc";

function formatPrice(price: number | null, suffix = ""): string {
  if (price == null) return "Cena wkrótce";
  return `${price} zł${suffix}`;
}

/** Karta pluginu/pakietu - z ilustracją na górze, jeśli jest zdefiniowana w PLUGIN_ART,
    inaczej zwykła karta tekstowa. Tytuł (i zdjęcie, gdy jest) to link do dedykowanej
    strony (patrz PluginDetailPage.tsx) - reszta karty (opis, cena, przyciski) zostaje
    bez zmian, żeby "Kup" dalej działało od razu z karty. */
function PluginCard({
  id,
  label,
  description,
  price,
  actions,
  detailTo,
  large,
}: {
  id: string;
  label: string;
  description?: string;
  price?: ReactNode;
  actions?: ReactNode;
  detailTo: string;
  /** Pakiety w wyróżnionym rzędzie na górze - trochę większa, spokojniejsza karta niż w gęstej siatce pojedynczych pluginów. */
  large?: boolean;
}) {
  const art = PLUGIN_ART[id];
  return (
    <div className={art ? "card plugin-card has-art" : large ? "card plugin-card plugin-card-large" : "card plugin-card"}>
      {art && (
        <Link to={detailTo}>
          <img src={art} alt="" className="plugin-card-art" />
        </Link>
      )}
      <div className={art ? "plugin-card-body" : undefined}>
        <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
          <Link to={detailTo} className="plugin-card-title-link">
            <div className="card-title">{label}</div>
          </Link>
          {price}
        </div>
        {description && <div className="muted small">{description}</div>}
        {actions && <div className="row">{actions}</div>}
      </div>
    </div>
  );
}

// Logowanie jest już zdjęte z tej strony (patrz App.tsx/Gate) - jeśli to się renderuje,
// użytkownik jest zalogowany. Ta strona tylko przegląda katalog i "moje licencje".
export default function ShopPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingVariant, setBuyingVariant] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [cat, myLicenses] = await Promise.all([shopCatalog(), shopMyLicenses()]);
      setCatalog(cat);
      setLicenses(myLicenses);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function buy(variantId: string | null) {
    setBuyingVariant(variantId);
    setError(null);
    try {
      const url = await shopCheckoutUrl(variantId ?? "");
      await openUrl(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setBuyingVariant(null);
    }
  }

  const pluginLabel = useMemo(() => {
    const map = new Map(catalog?.individualPlugins.map((p) => [p.id, p.label]) ?? []);
    return (id: string) => map.get(id) ?? id;
  }, [catalog]);

  const visiblePlugins = useMemo(() => {
    let list: CatalogPlugin[] = catalog?.individualPlugins ?? [];
    if (activeCategory) list = list.filter((p) => p.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    const sorted = [...list];
    if (sortMode === "name") sorted.sort((a, b) => a.label.localeCompare(b.label));
    if (sortMode === "price-asc") sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sortMode === "price-desc") sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    return sorted;
  }, [catalog, activeCategory, sortMode, search]);

  return (
    <div className="page">
      <div className="shop-hero">
        <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
          <div>
            <h1 style={{ margin: 0 }}>Sklep</h1>
            <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
              Pakiety z korzyścią cenową albo pojedyncze pluginy - kup to, czego naprawdę potrzebujesz.
            </p>
          </div>
          <button onClick={refresh}>Odśwież</button>
        </div>
        <div className="shop-search">
          <Search size={16} strokeWidth={1.75} />
          <input
            placeholder="Szukaj pluginu po nazwie albo opisie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Ładowanie...</p>}

      <h2>Pakiety</h2>
      <div className="shop-packages-row">
        {catalog?.packages.map((pkg) => (
          <PluginCard
            key={pkg.id}
            id={pkg.id}
            label={pkg.label}
            description={pkg.description}
            detailTo={`/shop/package/${pkg.id}`}
            large
            price={<span className="card-title">{formatPrice(pkg.price)}</span>}
            actions={
              <div style={{ width: "100%" }}>
                <div className="muted small" style={{ marginBottom: "0.5rem" }}>
                  Zawiera: {pkg.plugins === "*" ? "wszystkie pluginy (obecne i przyszłe)" : pkg.plugins.map(pluginLabel).join(", ")}
                </div>
                <div className="row">
                  <button disabled={buyingVariant === pkg.variantId} onClick={() => buy(pkg.variantId)}>
                    Kup
                  </button>
                  {pkg.subscriptionPrice != null && (
                    <button disabled={buyingVariant === pkg.subscriptionVariantId} onClick={() => buy(pkg.subscriptionVariantId)}>
                      Subskrybuj ({formatPrice(pkg.subscriptionPrice, "/mies.")})
                    </button>
                  )}
                </div>
              </div>
            }
          />
        ))}
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: "2rem" }}>
        <h2 style={{ margin: 0 }}>
          Pojedyncze pluginy <span className="muted small">({visiblePlugins.length})</span>
        </h2>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
          <option value="name">Sortuj: nazwa A-Z</option>
          <option value="price-asc">Sortuj: cena rosnąco</option>
          <option value="price-desc">Sortuj: cena malejąco</option>
        </select>
      </div>
      <div className="row">
        <button className={activeCategory === null ? "active" : undefined} onClick={() => setActiveCategory(null)}>
          Wszystkie
        </button>
        {catalog?.categories.map((c) => (
          <button key={c.id} className={activeCategory === c.id ? "active" : undefined} onClick={() => setActiveCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="card-grid">
        {visiblePlugins.map((p) => (
          <PluginCard
            key={p.id}
            id={p.id}
            label={p.label}
            description={p.description}
            detailTo={`/shop/plugin/${p.id}`}
            price={<span className="card-title">{formatPrice(p.price)}</span>}
            actions={
              <button disabled={buyingVariant === p.variantId} onClick={() => buy(p.variantId)}>
                Kup
              </button>
            }
          />
        ))}
        {!loading && visiblePlugins.length === 0 && <p className="muted">Brak wyników dla tego wyszukiwania/kategorii.</p>}
      </div>

      <h2 style={{ marginTop: "2rem" }}>Darmowe</h2>
      <div className="card-grid">
        {FREE_PLUGINS.map((p) => (
          <PluginCard
            key={p.id}
            id={p.id}
            label={p.label}
            description={p.description}
            detailTo={`/shop/free/${p.id}`}
            actions={<span className="badge badge-on">dołączony za darmo</span>}
          />
        ))}
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Moje licencje</h2>
      {!loading && licenses.length === 0 && <p className="muted">Nie masz jeszcze żadnej licencji.</p>}
      <div className="card-grid">
        {licenses.map((l) => (
          <div key={l.key} className="card">
            <div className="card-title">{l.plugin === "*" ? "Wszystko (Ultimate)" : l.plugin}</div>
            <div className="muted small">Klucz: <code>{l.key}</code></div>
            <div className="muted small">{l.billingType === "subscription" ? "Subskrypcja" : "Zakup jednorazowy"}</div>
            <div className="row">
              <span className={l.status === "active" ? "badge badge-on" : "badge"}>
                {l.status === "active" ? "aktywna" : "nieaktywna"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
