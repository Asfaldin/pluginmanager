import { KeyRound, Server, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PluginEcosystem from "../components/PluginEcosystem";
import { getHasConfigured, getHasDeployed, getHasTestedConnection, setHasTestedConnection } from "../lib/appSettings";
import { listEmbeddedJars, sftpListDir, shopMyLicenses } from "../lib/api";
import { FREE_PLUGIN_IDS } from "../lib/freePlugins";
import { useT, type StringKey } from "../lib/i18n";
import { useAuth } from "../state/AuthContext";
import { useProfiles } from "../state/ProfilesContext";
import { profileWhere, type LicenseRecord } from "../lib/types";

type ConnState = "idle" | "checking" | "ok" | "error";

export default function DashboardPage() {
  const t = useT();
  const { customer } = useAuth();
  const { profiles, loading: profilesLoading } = useProfiles();
  const [licenses, setLicenses] = useState<LicenseRecord[] | null>(null);
  const [conn, setConn] = useState<Record<string, { state: ConnState; message?: string }>>({});
  const [editorCount, setEditorCount] = useState<number | null>(null);
  const [hasDeployed, setHasDeployedState] = useState(getHasDeployed);
  const [hasTestedConnection, setHasTestedConnectionState] = useState(getHasTestedConnection);
  const [hasConfigured, setHasConfiguredState] = useState(getHasConfigured);

  useEffect(() => {
    shopMyLicenses()
      .then(setLicenses)
      .catch(() => setLicenses([]));
    // Liczba wbudowanych jarów zamiast zaszytej na sztywno liczby - realny stan appki,
    // nie coś do ręcznego pilnowania przy każdej zmianie liczby pluginów.
    listEmbeddedJars()
      .then((jars) => setEditorCount(jars.length))
      .catch(() => setEditorCount(null));
    // hasDeployed to localStorage ustawiane w DeployPage.tsx - odświeżamy przy powrocie
    // na Dashboard (np. po wysłaniu pluginów i nawigacji z powrotem), nie tylko przy
    // pierwszym montowaniu, żeby checklista poniżej zniknęła od razu.
    setHasDeployedState(getHasDeployed());
    setHasConfiguredState(getHasConfigured());
  }, []);

  async function testConnection(profileId: string, remotePluginsPath: string) {
    setConn((prev) => ({ ...prev, [profileId]: { state: "checking" } }));
    try {
      await sftpListDir(profileId, remotePluginsPath);
      setConn((prev) => ({ ...prev, [profileId]: { state: "ok" } }));
      setHasTestedConnection();
      setHasTestedConnectionState(true);
    } catch (e) {
      setConn((prev) => ({ ...prev, [profileId]: { state: "error", message: String(e) } }));
    }
  }

  const activeLicenses = licenses?.filter((l) => l.status === "active") ?? [];

  // "Pierwsze kroki" - checklista widoczna DOPIERO po zalogowaniu (decyzja: pokaż
  // dopiero po zalogowaniu, patrz rozmowa) - stąd "Załóż konto" nie jest tu osobnym
  // krokiem, bo sama widoczność checklisty już to zakłada. Znika sama, gdy reszta
  // zrobiona. `to: null` = krok robi się na tej samej stronie (patrz "Serwery" niżej),
  // więc nie jest linkiem, tylko zwykłym wierszem. hasConfigured ustawiane wspólnie
  // dla wszystkich edytorów w sftpWriteFile (patrz api.ts) - nie trzeba było dotykać
  // każdego edytora osobno.
  const onboardingSteps: Array<{ done: boolean; labelKey: StringKey; to: string | null }> = [
    { done: profiles.length > 0, labelKey: "dashboard.step.connectServer", to: "/servers" },
    { done: hasTestedConnection, labelKey: "dashboard.step.testConnection", to: null },
    { done: hasConfigured, labelKey: "dashboard.step.configureFirstPlugin", to: "/tools" },
    { done: hasDeployed, labelKey: "dashboard.step.deploy", to: "/deploy" },
  ];
  const showOnboarding = !!customer && !profilesLoading && onboardingSteps.some((s) => !s.done);

  return (
    <div className="page">
      <div className="hero-banner">
        <h1>
          {t("dashboard.welcome")}
          {customer ? `, ${customer.email}` : ""}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {t("dashboard.subtitle")}
        </p>
      </div>

      {showOnboarding && (
        <div className="card onboarding-checklist">
          <div className="card-title" style={{ marginBottom: "0.5rem" }}>
            {t("dashboard.firstSteps")}
          </div>
          {onboardingSteps.map((step, i) => {
            const next = onboardingSteps[i + 1];
            const lineDone = step.done && next?.done;
            const rowContent = step.to ? (
              <Link to={step.to} className={step.done ? "onboarding-row-content done" : "onboarding-row-content"}>
                {t(step.labelKey)}
              </Link>
            ) : (
              <div className={step.done ? "onboarding-row-content done" : "onboarding-row-content"}>{t(step.labelKey)}</div>
            );
            return (
              <div className="onboarding-row" key={step.labelKey}>
                <div className="onboarding-rail">
                  <span className={step.done ? "onboarding-dot done" : "onboarding-dot"} />
                  {next && <span className={lineDone ? "onboarding-line done" : "onboarding-line"} />}
                </div>
                {rowContent}
              </div>
            );
          })}
        </div>
      )}

      {/* Checklista wyżej kończy się bez żadnej wzmianki o Sklepie - klient mógł przejść
          cały onboarding, korzystając wyłącznie z darmowych pluginów, i nie ma jak się
          dowiedzieć, że jest więcej do odblokowania. Osobna, nieznikająca-po-zakupie
          podpowiedź zamiast dorzucania tego jako krok checklisty (checklista ma sens
          tylko dopóki znika po ukończeniu - zakup nie jest "obowiązkowym pierwszym krokiem"). */}
      {!!customer && licenses !== null && activeLicenses.length === 0 && (
        <p className="muted small">
          {t("dashboard.freePluginsOnly")} <Link to="/shop">{t("dashboard.checkShop")}</Link>
        </p>
      )}

      <div className="stat-tiles">
        <Link to="/servers" className="stat-tile">
          <span className="stat-tile-icon">
            <Server size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{profilesLoading ? "…" : profiles.length}</div>
            <div className="muted small">{t("dashboard.configuredServers")}</div>
          </div>
        </Link>
        <Link to="/account" className="stat-tile">
          <span className="stat-tile-icon">
            <KeyRound size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{licenses === null ? "…" : activeLicenses.length}</div>
            <div className="muted small">
              {t("dashboard.activeLicenses")}{" "}
              {activeLicenses.length === 0 && `(+${FREE_PLUGIN_IDS.size} ${t("dashboard.freeAlwaysAvailable")})`}
            </div>
          </div>
        </Link>
        <Link to="/tools" className="stat-tile">
          <span className="stat-tile-icon">
            <Wrench size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{editorCount ?? "…"}</div>
            <div className="muted small">{t("dashboard.availableEditors")}</div>
          </div>
        </Link>
      </div>

      <h2>{t("dashboard.servers")}</h2>
      <div className="card">
        {profilesLoading && <p className="muted">{t("dashboard.loading")}</p>}
        {!profilesLoading && profiles.length === 0 && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              {t("dashboard.noServerYet")}
            </p>
            <Link to="/servers">
              <button type="button">{t("dashboard.addServer")}</button>
            </Link>
          </div>
        )}
        {profiles.map((p, i) => {
          const state = conn[p.id]?.state ?? "idle";
          return (
            <div
              key={p.id}
              className="row"
              style={{ justifyContent: "space-between", borderTop: i > 0 ? "1px solid var(--border)" : undefined, paddingTop: i > 0 ? "0.6rem" : undefined }}
            >
              <div>
                <div className="card-title">
                  <span className={`status-dot ${state === "checking" ? "idle" : state}`} />
                  {p.name}
                </div>
                <div className="muted small">{profileWhere(p)}</div>
                {state === "error" && <div className="error small">{conn[p.id]?.message}</div>}
              </div>
              <button type="button" onClick={() => testConnection(p.id, p.remote_plugins_path)} disabled={state === "checking"}>
                {state === "checking" ? t("dashboard.testing") : t("dashboard.testConnection")}
              </button>
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>{t("dashboard.ecosystem")}</h2>
      <p className="muted small" style={{ marginTop: "-0.3rem" }}>
        {t("dashboard.ecosystemSubtitle")}
      </p>
      <div className="card">
        <PluginEcosystem licenses={licenses ?? []} />
      </div>
    </div>
  );
}
