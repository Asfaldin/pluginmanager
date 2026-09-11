import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { deleteProfile, saveProfile } from "../lib/api";
import { useProfiles } from "../state/ProfilesContext";
import { profileWhere, type AuthMethod, type ProfileKind, type ServerProfile } from "../lib/types";

const EMPTY_FORM = {
  id: "",
  name: "",
  kind: "Remote" as ProfileKind,
  local_path: "",
  sftp_host: "",
  sftp_port: 22,
  sftp_username: "",
  auth_method: "Password" as AuthMethod,
  private_key_path: "",
  remote_plugins_path: "/plugins",
  rcon_host: "",
  rcon_port: 25575,
  sftp_secret: "",
  rcon_secret: "",
};

/** Folder serwera z Windowsa ("C:\...\Serwer") w postaci, której używają zakładki ("C:/.../Serwer"). */
function toAppPath(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/\/+$/, "");
}

export default function ServersPage() {
  const { profiles, refresh, loading } = useProfiles();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = form.kind === "Local";

  function edit(profile: ServerProfile) {
    setForm({
      ...profile,
      kind: profile.kind ?? "Remote",
      local_path: profile.local_path ?? "",
      private_key_path: profile.private_key_path ?? "",
      sftp_secret: "",
      rcon_secret: "",
    });
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, id: uuidv4() });
  }

  async function pickFolder() {
    const sel = await open({ directory: true, multiple: false, title: "Wybierz folder serwera (ten z plikiem server.properties)" });
    if (typeof sel === "string") setForm({ ...form, local_path: toAppPath(sel) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (local && !form.local_path) {
      setError("Wybierz folder serwera.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profile: ServerProfile = {
        id: form.id || uuidv4(),
        name: form.name,
        kind: form.kind,
        local_path: local ? form.local_path : null,
        sftp_host: local ? "" : form.sftp_host,
        sftp_port: Number(form.sftp_port),
        sftp_username: local ? "" : form.sftp_username,
        auth_method: form.auth_method,
        private_key_path: !local && form.auth_method === "PrivateKey" ? form.private_key_path || null : null,
        remote_plugins_path: local ? `${form.local_path}/plugins` : form.remote_plugins_path,
        rcon_host: form.rcon_host,
        rcon_port: Number(form.rcon_port),
      };
      await saveProfile(
        profile,
        !local && form.sftp_secret ? form.sftp_secret : undefined,
        form.rcon_secret ? form.rcon_secret : undefined
      );
      await refresh();
      resetForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await deleteProfile(id);
    await refresh();
  }

  return (
    <div className="page">
      <h1>Serwery</h1>
      <p className="muted">
        Serwer w internecie (SFTP do wysyłki configów, RCON do przeładowania pluginu) albo serwer na tym komputerze
        (appka zapisuje pliki prosto w jego folderze).
      </p>

      <div className="two-col">
        <form onSubmit={submit} className="card form">
          <h2>{form.id ? "Edytuj profil" : "Nowy profil"}</h2>

          <label>
            Nazwa
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          <label>
            Gdzie jest serwer?
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProfileKind })}>
              <option value="Remote">W internecie (SFTP)</option>
              <option value="Local">Na tym komputerze (folder)</option>
            </select>
          </label>

          {local ? (
            <fieldset>
              <legend>Folder serwera</legend>
              <div className="row">
                <input readOnly value={form.local_path} placeholder="np. C:/Users/.../Desktop/Serwer" style={{ flex: 1 }} />
                <button type="button" onClick={pickFolder}>
                  Wybierz folder
                </button>
              </div>
              <p className="muted small">
                Wskaż folder, w którym jest plik server.properties. Pluginy i ich configi są w jego podfolderze plugins.
              </p>
            </fieldset>
          ) : (
            <fieldset>
              <legend>SFTP</legend>
              <label>
                Host
                <input
                  required
                  value={form.sftp_host}
                  onChange={(e) => setForm({ ...form, sftp_host: e.target.value })}
                />
              </label>
              <label>
                Port
                <input
                  type="number"
                  value={form.sftp_port}
                  onChange={(e) => setForm({ ...form, sftp_port: Number(e.target.value) })}
                />
              </label>
              <label>
                Użytkownik
                <input
                  required
                  value={form.sftp_username}
                  onChange={(e) => setForm({ ...form, sftp_username: e.target.value })}
                />
              </label>
              <label>
                Metoda logowania
                <select
                  value={form.auth_method}
                  onChange={(e) => setForm({ ...form, auth_method: e.target.value as AuthMethod })}
                >
                  <option value="Password">Hasło</option>
                  <option value="PrivateKey">Klucz prywatny</option>
                </select>
              </label>
              {form.auth_method === "Password" ? (
                <label>
                  Hasło {form.id && "(zostaw puste, aby nie zmieniać)"}
                  <input
                    type="password"
                    value={form.sftp_secret}
                    onChange={(e) => setForm({ ...form, sftp_secret: e.target.value })}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Ścieżka do klucza prywatnego
                    <input
                      value={form.private_key_path}
                      onChange={(e) => setForm({ ...form, private_key_path: e.target.value })}
                    />
                  </label>
                  <label>
                    Hasło klucza (opcjonalne)
                    <input
                      type="password"
                      value={form.sftp_secret}
                      onChange={(e) => setForm({ ...form, sftp_secret: e.target.value })}
                    />
                  </label>
                </>
              )}
              <label>
                Zdalna ścieżka do folderu plugins
                <input
                  required
                  value={form.remote_plugins_path}
                  onChange={(e) => setForm({ ...form, remote_plugins_path: e.target.value })}
                />
              </label>
            </fieldset>
          )}

          <fieldset>
            <legend>RCON {local && "(opcjonalne)"}</legend>
            {local && (
              <p className="muted small">
                Bez RCON przyciski „przeładuj” podpowiedzą komendę do wpisania w konsoli serwera.
              </p>
            )}
            <label>
              Host
              <input
                value={form.rcon_host}
                placeholder={local ? "np. 127.0.0.1" : undefined}
                onChange={(e) => setForm({ ...form, rcon_host: e.target.value })}
              />
            </label>
            <label>
              Port
              <input
                type="number"
                value={form.rcon_port}
                onChange={(e) => setForm({ ...form, rcon_port: Number(e.target.value) })}
              />
            </label>
            <label>
              Hasło {form.id && "(zostaw puste, aby nie zmieniać)"}
              <input
                type="password"
                value={form.rcon_secret}
                onChange={(e) => setForm({ ...form, rcon_secret: e.target.value })}
              />
            </label>
          </fieldset>

          {error && <p className="error">{error}</p>}

          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? "Zapisuję..." : "Zapisz profil"}
            </button>
            {form.id && (
              <button type="button" onClick={resetForm}>
                Anuluj edycję
              </button>
            )}
          </div>
        </form>

        <div>
          <h2>Zapisane profile</h2>
          {loading && <p className="muted">Ładowanie...</p>}
          <div className="card-grid">
            {profiles.map((p) => (
              <div key={p.id} className="card">
                <div className="card-title">{p.name}</div>
                <div className="muted small">{profileWhere(p)}</div>
                {p.rcon_host && (
                  <div className="muted small">
                    RCON: {p.rcon_host}:{p.rcon_port}
                  </div>
                )}
                <div className="row">
                  <button onClick={() => edit(p)}>Edytuj</button>
                  <button onClick={() => remove(p.id)}>Usuń</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
