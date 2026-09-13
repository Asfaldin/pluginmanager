import { KeyRound, Server, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PluginGraph from "../components/PluginGraph";
import { getHasConfigured, getHasDeployed, getHasTestedConnection, setHasTestedConnection } from "../lib/appSettings";
import { listEmbeddedJars, sftpListDir, shopMyLicenses } from "../lib/api";
import { FREE_PLUGIN_IDS } from "../lib/freePlugins";
import { useAuth } from "../state/AuthContext";
import { useProfiles } from "../state/ProfilesContext";
import { profileWhere, type LicenseRecord } from "../lib/types";

type ConnState = "idle" | "checking" | "ok" | "error";

export default function DashboardPage() {
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
  const onboardingSteps: Array<{ done: boolean; label: string; to: string | null }> = [
    { done: profiles.length > 0, label: "Połącz serwer", to: "/servers" },
    { done: hasTestedConnection, label: "Przetestuj połączenie", to: null },
    { done: hasConfigured, label: "Skonfiguruj pierwszy plugin", to: "/tools" },
    { done: hasDeployed, label: "Wrzuć na serwer", to: "/deploy" },
  ];
  const showOnboarding = !!customer && !profilesLoading && onboardingSteps.some((s) => !s.done);

  return (
    <div className="page">
      <div className="hero-banner">
        <h1>Witaj{customer ? `, ${customer.email}` : ""}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Skrót do tego, co najważniejsze - status serwerów i licencje.
        </p>
      </div>

      {showOnboarding && (
        <div className="card onboarding-checklist">
          <div className="card-title" style={{ marginBottom: "0.5rem" }}>
            Pierwsze kroki
          </div>
          {onboardingSteps.map((step, i) => {
            const next = onboardingSteps[i + 1];
            const lineDone = step.done && next?.done;
            const rowContent = step.to ? (
              <Link to={step.to} className={step.done ? "onboarding-row-content done" : "onboarding-row-content"}>
                {step.label}
              </Link>
            ) : (
              <div className={step.done ? "onboarding-row-content done" : "onboarding-row-content"}>{step.label}</div>
            );
            return (
              <div className="onboarding-row" key={step.label}>
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

      <div className="stat-tiles">
        <Link to="/servers" className="stat-tile">
          <span className="stat-tile-icon">
            <Server size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{profilesLoading ? "…" : profiles.length}</div>
            <div className="muted small">skonfigurowanych serwerów</div>
          </div>
        </Link>
        <Link to="/account" className="stat-tile">
          <span className="stat-tile-icon">
            <KeyRound size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{licenses === null ? "…" : activeLicenses.length}</div>
            <div className="muted small">
              aktywnych licencji {activeLicenses.length === 0 && `(+${FREE_PLUGIN_IDS.size} darmowych zawsze dostępnych)`}
            </div>
          </div>
        </Link>
        <Link to="/tools" className="stat-tile">
          <span className="stat-tile-icon">
            <Wrench size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{editorCount ?? "…"}</div>
            <div className="muted small">dostępnych edytorów</div>
          </div>
        </Link>
      </div>

      <h2>Serwery</h2>
      <div className="card">
        {profilesLoading && <p className="muted">Ładowanie...</p>}
        {!profilesLoading && profiles.length === 0 && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              Nie masz jeszcze skonfigurowanego serwera.
            </p>
            <Link to="/servers">
              <button type="button">Dodaj serwer</button>
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
                {state === "checking" ? "Sprawdzam..." : "Testuj połączenie"}
              </button>
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Ekosystem pluginów</h2>
      <p className="muted small" style={{ marginTop: "-0.3rem" }}>
        Który plugin od którego zależy - większość wymaga Core (współdzielone API i licencje), kilka działa samodzielnie.
      </p>
      <div className="card">
        <PluginGraph licenses={licenses ?? []} />
      </div>
    </div>
  );
}
