import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronDown, Palmtree, Pickaxe, Search, Swords, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ImagePlaceholder from "../components/ImagePlaceholder";
import { StatusBar } from "../components/EditorBits";
import { shopCatalog, shopCheckoutUrl, shopDevGrant, shopMyLicenses } from "../lib/api";
import { FREE_PLUGIN_IDS, FREE_PLUGINS } from "../lib/freePlugins";
import { ownsPackage, ownsPluginId, packagePluginsField } from "../lib/licenses";
import { PLUGIN_ART } from "../lib/pluginArt";
import { PACKAGE_ICON, PLUGIN_ICONS } from "../lib/pluginIcons";
import { useAuth } from "../state/AuthContext";
import { useSidebar } from "../state/SidebarContext";
import type { Catalog, CatalogPackage, CatalogPlugin, LicenseRecord } from "../lib/types";

// Ikony pakietów pod tryb gry (patrz "mode: true" w catalog.js) - po id pakietu, nie po
// id pluginu jak PLUGIN_ICONS, bo pakiet nie jest jednym konkretnym pluginem. Bez wpisu
// tu pakiet dostaje domyślną PACKAGE_ICON, tak jak Starter/Pro/Ultimate.
const MODE_PACKAGE_ICONS: Record<string, LucideIcon> = {
  "mode-skyblock": Palmtree,
  "mode-prison": Pickaxe,
  "mode-adventure": Swords,
};

type SortMode = "name" | "price-asc" | "price-desc";

function formatPrice(price: number | null, suffix = ""): string {
  if (price == null) return "Cena wkrótce";
  return `${price} zł${suffix}`;
}

/** Czy dany pakiet (Starter/Pro/Ultimate) zawiera ten plugin - "*" (Ultimate) zawiera
    wszystko, patrz packagePluginsField/PACKAGES w catalog.js. Do tabeli porównawczej
    (patrz render niżej) - osobna funkcja od ownsPackage/ownsPluginId w licenses.ts, bo te
    sprawdzają, co klient FAKTYCZNIE KUPIŁ, nie co dany pakiet w katalogu zawiera. */
function packageIncludesPlugin(pkg: CatalogPackage, pluginId: string): boolean {
  return pkg.plugins === "*" || pkg.plugins.includes(pluginId);
}

/** Karta pluginu/pakietu - ZAWSZE z obszarem obrazka na górze: prawdziwym (PLUGIN_ART),
    a dopóki go nie ma - placeholderem z ikoną pluginu (patrz ImagePlaceholder.tsx). Bez
    tego karty bez PLUGIN_ART (dziś wszystkie) wyglądały jak gołe wiersze tekstu, nie jak
    siatka produktów. Tytuł i obrazek to link do dedykowanej strony (PluginDetailPage.tsx).
    `owned` dokłada plakietkę i wyróżnia ramkę - klient od razu widzi, co już ma, bez
    zgadywania. `featured` to wizualny akcent na jednym pakiecie ("Polecane"). */
function PluginCard({
  id,
  label,
  description,
  price,
  priceFree,
  actions,
  detailTo,
  large,
  isPackage,
  owned,
  featured,
  icon,
}: {
  id: string;
  label: string;
  description?: string;
  /** Plakietka na obrazku, w prawym dolnym rogu - jak metka produktu (nie w rzędzie
      obok tytułu, żeby nie "pływała" zależnie od długości nazwy między kartami). */
  price?: string;
  /** Zielona zamiast neutralnej - dla "Za darmo". */
  priceFree?: boolean;
  actions?: ReactNode;
  detailTo: string;
  /** Pakiety w wyróżnionym rzędzie na górze - trochę większa, spokojniejsza karta niż w gęstej siatce pojedynczych pluginów. */
  large?: boolean;
  isPackage?: boolean;
  owned?: boolean;
  featured?: boolean;
  /** Nadpisuje domyślną ikonę (PLUGIN_ICONS/PACKAGE_ICON) - używane przez pakiety pod tryb gry. */
  icon?: LucideIcon;
}) {
  const art = PLUGIN_ART[id];
  const Icon = icon ?? (isPackage ? PACKAGE_ICON : PLUGIN_ICONS[id]);
  const classNames = [
    "card",
    "plugin-card",
    "has-art",
    large && "plugin-card-large",
    owned && "plugin-card-owned",
    featured && "plugin-card-featured",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classNames}>
      {featured && <div className="plugin-card-featured-ribbon">Najczęściej wybierany</div>}
      <Link to={detailTo} className="plugin-card-media">
        {art ? (
          <img src={art} alt="" className="plugin-card-art" />
        ) : (
          <ImagePlaceholder className="plugin-card-art" icon={Icon} />
        )}
        {price && <span className={priceFree ? "plugin-card-price free" : "plugin-card-price"}>{price}</span>}
      </Link>
      <div className="plugin-card-body">
        <Link to={detailTo} className="plugin-card-title-link">
          <div className="card-title">{label}</div>
        </Link>
        {description && <div className="muted small">{description}</div>}
        {owned && <span className="badge badge-on">posiadasz</span>}
        {actions && <div className="row">{actions}</div>}
      </div>
    </div>
  );
}

/** Karta pakietu pod tryb gry - ten sam wizualny styl co PluginCard (zdjęcie/placeholder
    16:9 + tytuł pod spodem), tylko w rozmiarze zwykłej karty siatki (.card-grid, jak
    "Pojedyncze pluginy"), nie w wyróżnionym, dużym rzędzie głównych pakietów. Bez opisu,
    ceny i przycisku "Kup" na karcie - to ma być spis do przejrzenia jednym rzutem oka,
    cała reszta (co zawiera, cena, zakup) jest dopiero na stronie pakietu po kliknięciu. */
function ModePackageTile({ id, label, detailTo, icon, owned }: { id: string; label: string; detailTo: string; icon?: LucideIcon; owned?: boolean }) {
  return <PluginCard id={id} label={label} detailTo={detailTo} icon={icon} owned={owned} isPackage />;
}

// Appka nie wymaga logowania na wejściu (patrz App.tsx) - Sklep więc musi sam obsłużyć
// stan "niezalogowany": katalog jest publiczny i ładuje się zawsze, ale "moje licencje"
// i "Kup" wymagają konta (patrz /account), więc te dwie rzeczy mają osobną
// obsługę błędu zamiast wywalać całą stronę.
export default function ShopPage() {
  const { customer } = useAuth();
  const { collapsed } = useSidebar();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingVariant, setBuyingVariant] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Pływający przycisk "Pluginy" na dole ekranu, widoczny tylko na samej górze strony -
  // wskazuje, że niżej jest jeszcze cała siatka pojedynczych pluginów, nie tylko pakiety.
  // .content (patrz Layout.tsx) jest faktycznym scrollującym się kontenerem, nie window -
  // stąd nasłuch na nim wprost, nie na window.scroll.
  const [atTop, setAtTop] = useState(true);
  const pluginsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".content");
    if (!el) return;
    const onScroll = () => setAtTop(el.scrollTop < 40);
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToPlugins() {
    pluginsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stopLicensePolling() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Po "Kup" appka otwiera przeglądarkę i appka sama nie wie, kiedy (ani czy) zakup się
  // dokończył - LemonSqueezy nie ma jak "wrócić" do appki desktopowej. Zamiast zostawiać
  // klienta z tym samym stanem po powrocie (dawny "ślepy zaułek"), odpytujemy licencje
  // co kilka sekund przez ~2 minuty i sami wykrywamy nową aktywną licencję.
  function startLicensePolling(baselineActiveCount: number) {
    stopLicensePolling();
    let tries = 0;
    pollRef.current = window.setInterval(async () => {
      tries++;
      try {
        const fresh = await shopMyLicenses();
        setLicenses(fresh);
        if (fresh.filter((l) => l.status === "active").length > baselineActiveCount) {
          setStatus("Nowa licencja aktywna - dzięki za zakup!");
          stopLicensePolling();
          return;
        }
      } catch {
        // cicho - kolejna próba za chwilę, nie zasypujemy błędami sieci w tle
      }
      if (tries >= 24) stopLicensePolling();
    }, 5000);
  }

  useEffect(() => stopLicensePolling, []);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    setStatus(null);
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
    setStatus(null);
    try {
      const url = await shopCheckoutUrl(variantId ?? "");
      await openUrl(url);
      setStatus("Otworzyliśmy przeglądarkę - dokończ zakup, a potem wróć tutaj. Sprawdzimy Twoje licencje automatycznie.");
      startLicensePolling(activeLicenses.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setBuyingVariant(null);
    }
  }

  // Testowe "kup" bez prawdziwej płatności - działa tylko gdy operator włączył
  // DEV_LICENSE_GRANTS=1 na license-serverze (inaczej dostaje 404, patrz shop.rs);
  // sam przycisk pokazuje się tylko w import.meta.env.DEV (poniżej, przy renderze),
  // więc zbudowana wersja dla klienta nie ma z czego tego wywołać.
  async function buyTest(pluginField: string) {
    if (!customer) {
      setError("Zaloguj się najpierw, żeby kupić.");
      return;
    }
    setBuyingVariant(pluginField);
    setError(null);
    setStatus(null);
    try {
      await shopDevGrant(pluginField);
      setLicenses(await shopMyLicenses());
      setStatus("Licencja testowa nadana.");
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

  // Darmowe pluginy dołączone do tej samej listy co płatne (nie osobna sekcja "Darmowe")
  // - uczestniczą w tym samym wyszukiwaniu/filtrze kategorii/sortowaniu, tylko dostają
  // plakietkę "za darmo" zamiast ceny/przycisku "Kup" (patrz FREE_PLUGIN_IDS niżej, przy renderze).
  const allPlugins: CatalogPlugin[] = useMemo(() => {
    const paid = catalog?.individualPlugins ?? [];
    const free: CatalogPlugin[] = FREE_PLUGINS.map((f) => ({
      id: f.id,
      label: f.label,
      description: f.description,
      category: null,
      price: null,
      variantId: null,
    }));
    return [...paid, ...free];
  }, [catalog]);

  const visiblePlugins = useMemo(() => {
    let list: CatalogPlugin[] = allPlugins;
    if (activeCategory) list = list.filter((p) => p.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    const sorted = [...list];
    if (sortMode === "name") sorted.sort((a, b) => a.label.localeCompare(b.label));
    if (sortMode === "price-asc") sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sortMode === "price-desc") sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    return sorted;
  }, [allPlugins, activeCategory, sortMode, search]);

  // Liczba pluginów per kategoria - do plakietek przy filtrach (patrz render niżej),
  // liczone z pełnej listy (nie z visiblePlugins), żeby wyszukiwanie tekstowe nie
  // zmieniało liczb przy każdym wpisanym znaku - to ma być stały spis kategorii, nie
  // licznik "ile aktualnie widać".
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allPlugins) {
      if (!p.category) continue;
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return counts;
  }, [allPlugins]);

  const activeLicenses = licenses.filter((l) => l.status === "active");

  // Dwa różne wymiary pakietów (patrz komentarz przy PACKAGES w catalog.js): "tier" to
  // skumulowana drabinka cenowa Starter/Pro/Ultimate, "mode" to dobór pod konkretny typ
  // serwera (Skyblock/Prison/RPG) - osobna sekcja, osobne karty, nie mieszają się w jednym rzędzie.
  const tierPackages = useMemo(() => (catalog?.packages ?? []).filter((p) => !p.mode), [catalog]);
  const modePackages = useMemo(() => (catalog?.packages ?? []).filter((p) => p.mode), [catalog]);

  // Środkowy cenowo pakiet ("Pro" w typowej drabince Starter/Pro/Ultimate) jest tym, na
  // który klasycznie podbija się uwagę - stąd "Najczęściej wybierany" na nim, wyliczone
  // z danych (po cenie, tylko wśród "tier", żeby nie wylądowało przypadkiem na pakiecie
  // pod tryb gry), nie z zaszytego na sztywno id, żeby nie rozjechać się z katalogiem.
  // NIE zależy od tego, czy klient go już kupił (patrz featured w renderPackageCard) -
  // to fakt o katalogu ("ten pakiet zwykle wybierają"), nie o koncie klienta, więc
  // podświetlenie ma zostać nawet gdy pakiet jest już na koncie.
  const featuredPackageId = useMemo(() => {
    if (tierPackages.length < 3) return null;
    const sorted = [...tierPackages].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return sorted[Math.floor(sorted.length / 2)].id;
  }, [tierPackages]);

  // Renderer karty pakietu cenowego (Starter/Pro/Ultimate) - pełna karta z opisem, ceną
  // i przyciskiem "Kup" wprost na niej. Pakiety pod tryb gry mają own, dużo skromniejszy
  // render - patrz ModePackageTile.
  function renderPackageCard(pkg: CatalogPackage) {
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
        featured={pkg.id === featuredPackageId}
        price={formatPrice(pkg.price)}
        actions={
          <div style={{ width: "100%" }}>
            <div className="muted small" style={{ marginBottom: "0.5rem" }}>
              Zawiera: {pkg.plugins === "*" ? "wszystkie pluginy (obecne i przyszłe)" : pkg.plugins.map(pluginLabel).join(", ")}
            </div>
            {!owned && (
              <div className="row">
                {pkg.price != null && pkg.variantId != null ? (
                  <button disabled={buyingVariant === pkg.variantId} onClick={() => buy(pkg.variantId)}>
                    {buyingVariant === pkg.variantId ? "Otwieram przeglądarkę..." : "Kup"}
                  </button>
                ) : (
                  <span className="muted small">Cena wkrótce - jeszcze nie można kupić.</span>
                )}
                {pkg.subscriptionPrice != null && pkg.subscriptionVariantId != null && (
                  <button disabled={buyingVariant === pkg.subscriptionVariantId} onClick={() => buy(pkg.subscriptionVariantId)}>
                    {buyingVariant === pkg.subscriptionVariantId
                      ? "Otwieram przeglądarkę..."
                      : `Subskrybuj (${formatPrice(pkg.subscriptionPrice, "/mies.")})`}
                  </button>
                )}
                {import.meta.env.DEV && (
                  <button
                    disabled={buyingVariant === packagePluginsField(pkg.plugins)}
                    onClick={() => buyTest(packagePluginsField(pkg.plugins))}
                    title="Nadaje licencję bez prawdziwej płatności - tylko lokalnie, do testów"
                  >
                    Kup (TEST)
                  </button>
                )}
              </div>
            )}
          </div>
        }
      />
    );
  }

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

      {error && <StatusBar text={error} tone="error" onClose={() => setError(null)} />}
      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      {loading && <p className="muted">Ładowanie...</p>}

      <h2 style={{ marginTop: "2rem", textAlign: "center" }}>Pakiety</h2>
      <div className="shop-packages-row">{tierPackages.map((pkg) => renderPackageCard(pkg))}</div>

      {tierPackages.length > 1 && (catalog?.individualPlugins.length ?? 0) > 0 && (
        <div className="shop-compare-wrap">
          <table className="shop-compare-table">
            <thead>
              <tr>
                <th></th>
                {tierPackages.map((pkg) => (
                  <th key={pkg.id} className={pkg.id === featuredPackageId ? "featured" : undefined}>
                    {pkg.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog?.individualPlugins.map((plugin) => (
                <tr key={plugin.id}>
                  <td className="shop-compare-row-label">{plugin.label}</td>
                  {tierPackages.map((pkg) => (
                    <td key={pkg.id} className={pkg.id === featuredPackageId ? "featured" : undefined}>
                      {packageIncludesPlugin(pkg, plugin.id) ? (
                        <Check size={16} strokeWidth={2.5} className="shop-compare-yes" />
                      ) : (
                        <span className="shop-compare-no">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modePackages.length > 0 && (
        <>
          <h2 style={{ marginTop: "2rem" }}>Pakiety pod tryb gry</h2>
          <p className="muted small" style={{ marginTop: "-0.3rem" }}>
            Dobrane pluginy pod konkretny typ serwera, nie kolejny szczebel cenowej drabinki.
          </p>
          <div className="card-grid">
            {modePackages.map((pkg) => {
              const owned = ownsPackage(licenses, packagePluginsField(pkg.plugins));
              return (
                <ModePackageTile
                  key={pkg.id}
                  id={pkg.id}
                  label={pkg.label}
                  detailTo={`/shop/package/${pkg.id}`}
                  icon={MODE_PACKAGE_ICONS[pkg.id]}
                  owned={owned}
                />
              );
            })}
          </div>
        </>
      )}

      <div ref={pluginsRef} className="row" style={{ justifyContent: "space-between", marginTop: "2rem" }}>
        <h2 style={{ margin: 0 }}>
          Pojedyncze pluginy <span className="muted small">({visiblePlugins.length})</span>
        </h2>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
          <option value="name">Sortuj: nazwa A-Z</option>
          <option value="price-asc">Sortuj: cena rosnąco</option>
          <option value="price-desc">Sortuj: cena malejąco</option>
        </select>
      </div>
      <div className="shop-browse-by">Przeglądaj wg kategorii</div>
      <div className="shop-category-pills">
        <button
          type="button"
          className={activeCategory === null ? "shop-category-pill active" : "shop-category-pill"}
          onClick={() => setActiveCategory(null)}
        >
          Wszystkie
          <span className="shop-category-pill-count">{allPlugins.length}</span>
        </button>
        {catalog?.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={activeCategory === c.id ? "shop-category-pill active" : "shop-category-pill"}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.label}
            <span className="shop-category-pill-count">{categoryCounts.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="card-grid">
        {visiblePlugins.map((p) => {
          const free = FREE_PLUGIN_IDS.has(p.id);
          const owned = !free && ownsPluginId(licenses, p.id);
          return (
            <PluginCard
              key={p.id}
              id={p.id}
              label={p.label}
              description={p.description}
              detailTo={free ? `/shop/free/${p.id}` : `/shop/plugin/${p.id}`}
              owned={owned}
              price={free ? "Za darmo" : formatPrice(p.price)}
              priceFree={free}
              actions={
                !free &&
                !owned && (
                  <div className="row" style={{ margin: 0 }}>
                    {p.price != null && p.variantId != null ? (
                      <button disabled={buyingVariant === p.variantId} onClick={() => buy(p.variantId)}>
                        {buyingVariant === p.variantId ? "Otwieram przeglądarkę..." : "Kup"}
                      </button>
                    ) : (
                      <span className="muted small">Cena wkrótce</span>
                    )}
                    {import.meta.env.DEV && (
                      <button
                        disabled={buyingVariant === p.id}
                        onClick={() => buyTest(p.id)}
                        title="Nadaje licencję bez prawdziwej płatności - tylko lokalnie, do testów"
                      >
                        Kup (TEST)
                      </button>
                    )}
                  </div>
                )
              }
            />
          );
        })}
        {!loading && visiblePlugins.length === 0 && <p className="muted">Brak wyników dla tego wyszukiwania/kategorii.</p>}
      </div>

      {atTop && (
        <button
          type="button"
          className="shop-scroll-cta"
          style={{ left: `calc(50% + ${(collapsed ? 56 : 220) / 2}px)` }}
          onClick={scrollToPlugins}
        >
          Pluginy
          <ChevronDown size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
