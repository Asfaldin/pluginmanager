import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import ImagePlaceholder from "../components/ImagePlaceholder";
import { StatusBar } from "../components/EditorBits";
import { shopCatalog, shopCheckoutUrl, shopMyLicenses } from "../lib/api";
import { FREE_PLUGINS } from "../lib/freePlugins";
import { ownsPackage, ownsPluginId, packagePluginsField } from "../lib/licenses";
import { PLUGIN_ART } from "../lib/pluginArt";
import { PLUGIN_BANNERS } from "../lib/pluginBanners";
import { PLUGIN_FEATURES } from "../lib/pluginFeatures";
import { PACKAGE_ICON, PLUGIN_ICONS } from "../lib/pluginIcons";
import { useAuth } from "../state/AuthContext";
import type { Catalog, LicenseRecord } from "../lib/types";

/** Ikona nagłówka - kwadrat po lewej obok tytułu, w stylu strony projektu na Modrinth
    (ikona + tytuł + tagi w jednym rzędzie na górze). Pakiety dostają generyczną ikonę
    (patrz PACKAGE_ICON) - nie są same w sobie "pluginem" z PLUGIN_ICONS. */
function HeaderIcon({ id, isPackage }: { id: string; isPackage?: boolean }) {
  const Icon = isPackage ? PACKAGE_ICON : PLUGIN_ICONS[id] ?? PACKAGE_ICON;
  return (
    <div className="plugin-detail-icon">
      <Icon size={34} strokeWidth={1.5} />
    </div>
  );
}

/** Logo/wordmark pluginu (patrz PLUGIN_BANNERS) - TYLKO na tej stronie, nie na karcie
    w Sklepie/Twoje pluginy. object-fit: contain w panelu zamiast przycięcia jak przy
    PLUGIN_ART - to grafika ze słowem/logo, nie zdjęcie/screenshot do kadrowania. */
function PluginBanner({ id }: { id: string }) {
  const banner = PLUGIN_BANNERS[id];
  if (!banner) return null;
  return (
    <div className="plugin-detail-banner-wrap">
      <img src={banner} alt="" />
    </div>
  );
}

/** Duże zdjęcie produktu pod nagłówkiem - prawdziwe (PLUGIN_ART), a dopóki go nie ma,
    placeholder z ikoną pluginu - strona produktu ma zawsze miejsce na główną grafikę,
    nie tylko wtedy, gdy akurat istnieje. */
function HeroArt({ id, isPackage }: { id: string; isPackage?: boolean }) {
  const art = PLUGIN_ART[id];
  const Icon = isPackage ? PACKAGE_ICON : PLUGIN_ICONS[id];
  return art ? (
    <img src={art} alt="" className="plugin-detail-art" />
  ) : (
    <ImagePlaceholder className="plugin-detail-art" icon={Icon} label="Zdjęcie produktu" />
  );
}

/** Rozbicie opisu na kilka konkretnych kroków (patrz PLUGIN_FEATURES) - każdy krok ma
    zdjęcie (prawdziwe albo placeholder) na przemian z lewej/prawej strony (zigzag), tak
    jak na stronach produktowych profesjonalnych aplikacji, zamiast jednego bloku tekstu
    albo gęstej siatki kart. Bez wpisu w PLUGIN_FEATURES sekcja się nie pokazuje - nie
    zmyślamy kroków, których treść jeszcze nie powstała. */
function PluginSteps({ id }: { id: string }) {
  const features = PLUGIN_FEATURES[id];
  if (!features || features.length === 0) return null;
  return (
    <>
      <h2 style={{ marginTop: "1.5rem" }}>Co robi</h2>
      <div className="plugin-steps">
        {features.map((f, i) => (
          <div key={f.title} className="plugin-step">
            <div className="plugin-step-media">{f.image ? <img src={f.image} alt="" /> : <ImagePlaceholder />}</div>
            <div className="plugin-step-text">
              <div className="plugin-step-number">Krok {i + 1}</div>
              <div className="card-title">{f.title}</div>
              <p className="muted small">{f.description}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

type Kind = "free" | "plugin" | "package";

function formatPrice(price: number | null, suffix = ""): string {
  if (price == null) return "Cena wkrótce";
  return `${price} zł${suffix}`;
}

/** Dedykowana strona jednego pluginu/pakietu w Sklepie, w układzie inspirowanym stroną
    projektu na Modrinth: nagłówek (ikona + tytuł + tagi) na górze, potem dwie kolumny -
    szeroka z opisem/cechami po lewej, wąski panel z ceną/przyciskiem "Kup" i szczegółami
    po prawej. To samo źródło danych (katalog + moje licencje) co ShopPage. */
export default function PluginDetailPage() {
  const { customer } = useAuth();
  const { kind, id } = useParams<{ kind: Kind; id: string }>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [buyingVariant, setBuyingVariant] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  function stopLicensePolling() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Ten sam mechanizm co w ShopPage.tsx - appka nie ma jak wiedzieć, kiedy klient
  // dokończy zakup w przeglądarce, więc odpytujemy licencje w tle zamiast zostawiać go
  // z tym samym ekranem po powrocie.
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
        // cicho - kolejna próba za chwilę
      }
      if (tries >= 24) stopLicensePolling();
    }, 5000);
  }

  useEffect(() => stopLicensePolling, []);

  // Katalog jest publiczny i musi się załadować niezależnie od tego, czy ktoś jest
  // zalogowany - brak konta blokuje tylko "moje licencje" (patrz ShopPage.tsx, ten sam
  // wzorzec), nie całą stronę pluginu.
  useEffect(() => {
    setLoading(true);
    setError(null);
    shopCatalog()
      .then(setCatalog)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    shopMyLicenses()
      .then(setLicenses)
      .catch(() => setLicenses([]));
  }, []);

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
      setStatus("Otworzyliśmy przeglądarkę - dokończ zakup, a potem wróć tutaj. Sprawdzimy Twoją licencję automatycznie.");
      startLicensePolling(licenses.filter((l) => l.status === "active").length);
    } catch (e) {
      setError(String(e));
    } finally {
      setBuyingVariant(null);
    }
  }

  const backLink = (
    <Link to="/shop" className="back-link">
      ← Sklep
    </Link>
  );

  if (loading) {
    return (
      <div className="page">
        {backLink}
        <p className="muted">Ładowanie...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        {backLink}
        <StatusBar text={error} tone="error" onClose={() => setError(null)} />
      </div>
    );
  }

  if (kind === "free") {
    const item = FREE_PLUGINS.find((p) => p.id === id);
    if (!item) return <NotFound backLink={backLink} />;
    return (
      <div className="page">
        {backLink}
        <div className="plugin-detail-header">
          <HeaderIcon id={item.id} />
          <div>
            <h1 style={{ margin: 0 }}>{item.label}</h1>
            <div className="row" style={{ margin: "0.3rem 0 0" }}>
              <span className="badge badge-on">dołączony za darmo</span>
            </div>
          </div>
        </div>
        <PluginBanner id={item.id} />
        <HeroArt id={item.id} />
        <div className="plugin-detail-layout">
          <div className="plugin-detail-main">
            <p>{item.description}</p>
            <PluginSteps id={item.id} />
          </div>
          <div className="plugin-detail-sidebar">
            <div className="plugin-detail-sidebar-card">
              <div className="muted small">Dostępność</div>
              <div className="card-title">Za darmo</div>
              <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Dołączony do każdej instalacji, nie wymaga licencji.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "plugin") {
    const item = catalog?.individualPlugins.find((p) => p.id === id);
    if (!item) return <NotFound backLink={backLink} />;
    const category = catalog?.categories.find((c) => c.id === item.category);
    const owned = ownsPluginId(licenses, item.id);
    return (
      <div className="page">
        {backLink}
        {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
        <div className="plugin-detail-header">
          <HeaderIcon id={item.id} />
          <div>
            <h1 style={{ margin: 0 }}>{item.label}</h1>
            <div className="row" style={{ margin: "0.3rem 0 0" }}>
              {category && <span className="badge">{category.label}</span>}
              {owned && <span className="badge badge-on">masz licencję</span>}
            </div>
          </div>
        </div>
        <PluginBanner id={item.id} />
        <HeroArt id={item.id} />
        <div className="plugin-detail-layout">
          <div className="plugin-detail-main">
            <p>{item.description}</p>
            <PluginSteps id={item.id} />
          </div>
          <div className="plugin-detail-sidebar">
            <div className="plugin-detail-sidebar-card">
              <div className="muted small">Cena</div>
              <div className="card-title" style={{ fontSize: "1.3rem" }}>
                {formatPrice(item.price)}
              </div>
              {owned ? (
                <p className="muted small" style={{ marginTop: "0.5rem" }}>Masz aktywną licencję na ten plugin.</p>
              ) : item.price != null && item.variantId != null ? (
                <button
                  style={{ width: "100%", marginTop: "0.75rem" }}
                  disabled={buyingVariant === item.variantId}
                  onClick={() => buy(item.variantId)}
                >
                  {buyingVariant === item.variantId ? "Otwieram przeglądarkę..." : "Kup"}
                </button>
              ) : (
                <p className="muted small" style={{ marginTop: "0.5rem" }}>Cena wkrótce - jeszcze nie można kupić.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // kind === "package"
  const pkg = catalog?.packages.find((p) => p.id === id);
  if (!pkg) return <NotFound backLink={backLink} />;
  const pluginsField = packagePluginsField(pkg.plugins);
  const owned = ownsPackage(licenses, pluginsField);
  const containedPlugins = pkg.plugins === "*" ? null : catalog?.individualPlugins.filter((p) => (pkg.plugins as string[]).includes(p.id)) ?? [];

  return (
    <div className="page">
      {backLink}
      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      <div className="plugin-detail-header">
        <HeaderIcon id={pkg.id} isPackage />
        <div>
          <h1 style={{ margin: 0 }}>{pkg.label}</h1>
          {owned && (
            <div className="row" style={{ margin: "0.3rem 0 0" }}>
              <span className="badge badge-on">masz licencję</span>
            </div>
          )}
        </div>
      </div>
      <PluginBanner id={pkg.id} />
      <HeroArt id={pkg.id} isPackage />
      <div className="plugin-detail-layout">
        <div className="plugin-detail-main">
          <p>{pkg.description}</p>

          <h2 style={{ marginTop: "1.5rem" }}>Zawiera</h2>
          {containedPlugins === null ? (
            <p className="muted">Wszystkie pluginy - obecne i przyszłe.</p>
          ) : (
            <ul>
              {containedPlugins.map((p) => (
                <li key={p.id}>
                  <Link to={`/shop/plugin/${p.id}`}>{p.label}</Link> - <span className="muted small">{p.description}</span>
                </li>
              ))}
            </ul>
          )}

          <PluginSteps id={pkg.id} />
        </div>
        <div className="plugin-detail-sidebar">
          <div className="plugin-detail-sidebar-card">
            <div className="muted small">Cena</div>
            <div className="card-title" style={{ fontSize: "1.3rem" }}>
              {formatPrice(pkg.price)}
            </div>
            {owned ? (
              <p className="muted small" style={{ marginTop: "0.5rem" }}>Masz aktywną licencję z tego pakietu.</p>
            ) : pkg.price != null && pkg.variantId != null ? (
              <button
                style={{ width: "100%", marginTop: "0.75rem" }}
                disabled={buyingVariant === pkg.variantId}
                onClick={() => buy(pkg.variantId)}
              >
                {buyingVariant === pkg.variantId ? "Otwieram przeglądarkę..." : "Kup"}
              </button>
            ) : (
              <p className="muted small" style={{ marginTop: "0.5rem" }}>Cena wkrótce - jeszcze nie można kupić.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFound({ backLink }: { backLink: ReactNode }) {
  return (
    <div className="page">
      {backLink}
      <p className="error">Nie znaleziono tej pozycji w katalogu.</p>
    </div>
  );
}
