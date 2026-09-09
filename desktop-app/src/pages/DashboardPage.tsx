import { KeyRound, Server, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PluginGraph from "../components/PluginGraph";
import { sftpListDir, shopMyLicenses } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import { useProfiles } from "../state/ProfilesContext";
import type { LicenseRecord } from "../lib/types";

type ConnState = "idle" | "checking" | "ok" | "error";

export default function DashboardPage() {
  const { customer } = useAuth();
  const { profiles, loading: profilesLoading } = useProfiles();
  const [licenses, setLicenses] = useState<LicenseRecord[] | null>(null);
  const [conn, setConn] = useState<Record<string, { state: ConnState; message?: string }>>({});

  useEffect(() => {
    shopMyLicenses()
      .then(setLicenses)
      .catch(() => setLicenses([]));
  }, []);

  async function testConnection(profileId: string, remotePluginsPath: string) {
    setConn((prev) => ({ ...prev, [profileId]: { state: "checking" } }));
    try {
      await sftpListDir(profileId, remotePluginsPath);
      setConn((prev) => ({ ...prev, [profileId]: { state: "ok" } }));
    } catch (e) {
      setConn((prev) => ({ ...prev, [profileId]: { state: "error", message: String(e) } }));
    }
  }

  const activeLicenses = licenses?.filter((l) => l.status === "active") ?? [];

  return (
    <div className="page">
      <div className="hero-banner">
        <h1>Witaj{customer ? `, ${customer.email}` : ""}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Skrót do tego, co najważniejsze - status serwerów i licencje.
        </p>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-tile-icon">
            <Server size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{profilesLoading ? "…" : profiles.length}</div>
            <div className="muted small">skonfigurowanych serwerów</div>
          </div>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon">
            <KeyRound size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">{licenses === null ? "…" : activeLicenses.length}</div>
            <div className="muted small">aktywnych licencji</div>
          </div>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon">
            <Wrench size={22} strokeWidth={1.75} />
          </span>
          <div>
            <div className="stat-tile-value">20</div>
            <div className="muted small">dostępnych edytorów</div>
          </div>
        </div>
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
                <div className="muted small">
                  {p.sftp_username}@{p.sftp_host}:{p.sftp_port}
                </div>
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
