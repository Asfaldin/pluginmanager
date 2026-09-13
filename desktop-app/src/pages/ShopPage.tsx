import { openUrl } from "@tauri-apps/plugin-opener";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { shopCatalog, shopCheckoutUrl, shopMyLicenses } from "../lib/api";
import { FREE_PLUGINS } from "../lib/freePlugins";
import { ownsPackage, ownsPluginId, packagePluginsField } from "../lib/licenses";
import { PLUGIN_ART } from "../lib/pluginArt";
import { PACKAGE_ICON, PLUGIN_ICONS } from "../lib/pluginIcons";
import { useAuth } from "../state/AuthContext";
import type { Catalog, CatalogPlugin, LicenseRecord } from "../lib/types";

type SortMode = "name" | "price-asc" | "price-desc";

function formatPrice(price: number | null, suffix = ""): string {
  if (price == null) return "Cena wkrótce";
  return `${price} zł${suffix}`;
}

/** Karta pluginu/pakietu - z ilustracją na górze, jeśli jest zdefiniowana w PLUGIN_ART,
    inaczej ikona (PLUGIN_ICONS/PACKAGE_ICON) obok tytułu - PLUGIN_ART jest dziś puste,
    więc bez tego karty byłyby gołym tekstem. Tytuł (i zdjęcie, gdy jest) to link do
    dedykowanej strony (patrz PluginDetailPage.tsx). `owned` dokłada plakietkę i
    wyróżnia ramkę - klient od razu widzi, co już ma, bez zgadywania. `featured`
    to wizualny akcent na jednym pakiecie ("Polecane"). */
function PluginCard({
  id,
  label,
  description,
  price,
  actions,
  detailTo,
  large,
  isPackage,
  owned,
  featured,
}: {
  id: string;
  label: string;
  description?: string;
  price?: ReactNode;
  actions?: ReactNode;
  detailTo: string;
  /** Pakiety w wyróżnionym rzędzie na górze - trochę większa, spokojniejsza karta niż w gęstej siatce pojedynczych pluginów. */
  large?: boolean;
  isPackage?: boolean;
  owned?: boolean;
  featured?: boolean;
}) {
  const art = PLUGIN_ART[id];
  const Icon = isPackage ? PACKAGE_ICON : PLUGIN_ICONS[id];
  const classNames = [
    "card",
    "plugin-card",
    art && "has-art",
    !art && large && "plugin-card-large",
    owned && "plugin-card-owned",
    featured && "plugin-card-featured",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classNames}>
      {featured && <div className="plugin-card-featured-ribbon">Polecane</div>}
      {art && (
        <Link to={detailTo}>
          <img src={art} alt="" className="plugin-card-art" />
        </Link>
      )}
      <div className={art ? "plugin-card-body" : undefined}>
        <div className="row" style={{ justifyContent: "space-between", margin: 0, alignItems: "flex-start" }}>
          <Link to={detailTo} className="plugin-card-title-link">
            <div className="row" style={{ margin: 0, gap: "0.6rem" }}>
              {!art && Icon && (
                <span className="plugin-card-icon">
                  <Icon size={20} strokeWidth={1.5} />
                </span>
              )}
              <div className="card-title">{label}</div>
            </div>
          </Link>
          {price}
        </div>
        {description && <div className="muted small">{description}</div>}
        {owned && <span className="badge badge-on">posiadasz</span>}
        {actions && <div className="row">{actions}</div>}
      </div>
    </div>
  );
}

// Appka nie wymaga logowania na wejściu (patrz App.tsx) - Sklep więc musi sam obsłużyć
// stan "niezalogowany": katalog jest publiczny i ładuje się zawsze, ale "moje licencje"
// i "Kup" wymagają konta (patrz /account), więc te dwie rzeczy mają osobną
// obsługę błędu zamiast wywalać całą stronę.
export default function ShopPage() {
  const { customer } = useAuth();
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
      setCatalog(await shopCatalog());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    // Osobno - brak konta nie może zablokować widoku katalogu, tylko sekcję "moje licencje".
    shopMyLicenses()
      .then(setLicenses)
      .catch(() => setLicenses([]));
  }

  async function buy(variantId: string | null) {
    if (!customer) {
      setError("Zaloguj się najpierw, żeby kupić.");
      return;
    }
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

  const activeLicenses = licenses.filter((l) => l.status === "active");

  // Środkowy cenowo pakiet ("Pro" w typowej drabince Starter/Pro/Ultimate) jest tym, na
  // który klasycznie podbija się uwagę - stąd "Polecane" na nim, wyliczone z danych
  // (po cenie), nie z zaszytego na sztywno id, żeby nie rozjechać się z katalogiem.
  const featuredPackageId = useMemo(() => {
    const pkgs = catalog?.packages ?? [];
    if (pkgs.length < 3) return null;
    const sorted = [...pkgs].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return sorted[Math.floor(sorted.length / 2)].id;
  }, [catalog]);

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

      <h2>Moje licencje</h2>
      {!customer && (
        <p className="muted">
          <Link to="/account">Zaloguj się</Link>, żeby zobaczyć swoje licencje i kupować.
        </p>
      )}
      {customer && !loading && activeLicenses.length === 0 && <p className="muted">Nie masz jeszcze żadnej licencji.</p>}
      {activeLicenses.length > 0 && (
        <div className="card-grid">
          {activeLicenses.map((l) => (
            <div key={l.key} className="card">
              <div className="card-title">{l.plugin === "*" ? "Wszystko (Ultimate)" : l.plugin}</div>
              <div className="muted small">
                Klucz: <code>{l.key}</code>
              </div>
              <div className="muted small">{l.billingType === "subscription" ? "Subskrypcja" : "Zakup jednorazowy"}</div>
              <div className="row">
                <span className="badge badge-on">aktywna</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: "2rem" }}>Pakiety</h2>
      <div className="shop-packages-row">
        {catalog?.packages.map((pkg) => {
          const owned = ownsPackage(licenses, packagePluginsField(pkg.plugins));
          return (
            <PluginCard
              key={pkg.id}
              id={pkg.id}
              label={pkg.label}
              description={pkg.description}
              detailTo={`/shop/package/${pkg.id}`}
              large
              isPackage
              owned={owned}
              featured={!owned && pkg.id === featuredPackageId}
              price={<span className="card-title">{formatPrice(pkg.price)}</span>}
              actions={
                <div style={{ width: "100%" }}>
                  <div className="muted small" style={{ marginBottom: "0.5rem" }}>
                    Zawiera: {pkg.plugins === "*" ? "wszystkie pluginy (obecne i przyszłe)" : pkg.plugins.map(pluginLabel).join(", ")}
                  </div>
                  {!owned && (
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
                  )}
                </div>
              }
            />
          );
        })}
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
        {visiblePlugins.map((p) => {
          const owned = ownsPluginId(licenses, p.id);
          return (
            <PluginCard
              key={p.id}
              id={p.id}
              label={p.label}
              description={p.description}
              detailTo={`/shop/plugin/${p.id}`}
              owned={owned}
              price={<span className="card-title">{formatPrice(p.price)}</span>}
              actions={
                !owned && (
                  <button disabled={buyingVariant === p.variantId} onClick={() => buy(p.variantId)}>
                    Kup
                  </button>
                )
              }
            />
          );
        })}
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
    </div>
  );
}
