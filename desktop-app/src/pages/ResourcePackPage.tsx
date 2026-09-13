import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import PixelEditor from "../components/PixelEditor";
import TextureBrowser from "../components/TextureBrowser";
import {
  deleteTexturePack,
  listTexturePacks,
  rpDownloadPack,
  rpDownloadVanillaAssets,
  rpExportZip,
  rpImportTexture,
  rpListAllTextures,
  rpListMcVersions,
  rpMakeTransparent,
  rpReadMeta,
  rpResetTexture,
  rpTextureStatus,
  rpWriteMeta,
  saveTexturePack,
  sftpUploadLocalFile,
} from "../lib/api";
import type { McVersionSummary, PackMeta, TexturePackProject, TextureStatus } from "../lib/types";
import { useProfiles } from "../state/ProfilesContext";

type SubTab = "source" | "meta" | "gui" | "all" | "export";

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: "source", label: "Pobierz źródło" },
  { key: "meta", label: "Ustawienia paczki" },
  { key: "gui", label: "Tekstury GUI" },
  { key: "all", label: "Wszystkie tekstury" },
  { key: "export", label: "Eksport i wysyłka" },
];

interface GuiTexture {
  key: string;
  relPath: string;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
}

// Standardowe (vanilla) wymiary teł GUI kontenerów. Jeśli coś wygląda źle po
// wgraniu do gry, użyj "Wyczyść tło z pliku" na prawdziwej teksturze zamiast
// generować pustą - to gwarantuje poprawne wymiary.
const GUI_TEXTURES: GuiTexture[] = [
  {
    key: "generic",
    relPath: "assets/minecraft/textures/gui/container/generic_54.png",
    label: "Skrzynka / uniwersalne menu (9-54 sloty)",
    defaultWidth: 176,
    defaultHeight: 222,
  },
  {
    key: "hopper",
    relPath: "assets/minecraft/textures/gui/container/hopper.png",
    label: "Lejek (Hopper)",
    defaultWidth: 176,
    defaultHeight: 133,
  },
  {
    key: "shulker_box",
    relPath: "assets/minecraft/textures/gui/container/shulker_box.png",
    label: "Shulker Box",
    defaultWidth: 176,
    defaultHeight: 166,
  },
  {
    key: "furnace",
    relPath: "assets/minecraft/textures/gui/container/furnace.png",
    label: "Piec",
    defaultWidth: 176,
    defaultHeight: 166,
  },
  {
    key: "dispenser",
    relPath: "assets/minecraft/textures/gui/container/dispenser.png",
    label: "Dyspenser / Dropper",
    defaultWidth: 176,
    defaultHeight: 166,
  },
  {
    key: "anvil",
    relPath: "assets/minecraft/textures/gui/container/anvil.png",
    label: "Kowadło",
    defaultWidth: 176,
    defaultHeight: 166,
  },
  {
    key: "brewing_stand",
    relPath: "assets/minecraft/textures/gui/container/brewing_stand.png",
    label: "Warzelnia mikstur",
    defaultWidth: 176,
    defaultHeight: 166,
  },
  {
    key: "crafting_table",
    relPath: "assets/minecraft/textures/gui/container/crafting_table.png",
    label: "Stół rzemieślniczy",
    defaultWidth: 176,
    defaultHeight: 166,
  },
  {
    key: "enchanting_table",
    relPath: "assets/minecraft/textures/gui/container/enchanting_table.png",
    label: "Stół zaklęć",
    defaultWidth: 176,
    defaultHeight: 166,
  },
];

export default function ResourcePackPage() {
  const { profiles, activeProfileId: uploadProfileId, setActiveProfileId: setUploadProfileId } = useProfiles();
  const [packDir, setPackDir] = useState("");
  const [meta, setMeta] = useState<PackMeta>({ pack_format: 0, description: "" });
  const [statuses, setStatuses] = useState<Record<string, TextureStatus>>({});
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>(
    Object.fromEntries(GUI_TEXTURES.map((t) => [t.key, { w: t.defaultWidth, h: t.defaultHeight }]))
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<SubTab>("source");
  const [exportedZipPath, setExportedZipPath] = useState("");
  const [uploadRemotePath, setUploadRemotePath] = useState("");

  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadSha1, setDownloadSha1] = useState("");
  const [vanillaVersion, setVanillaVersion] = useState("");
  const [mcVersions, setMcVersions] = useState<McVersionSummary[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const [packProjects, setPackProjects] = useState<TexturePackProject[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [newPackName, setNewPackName] = useState("");

  const [allTextures, setAllTextures] = useState<string[]>([]);
  const [newTexturePath, setNewTexturePath] = useState("");
  const [newTextureW, setNewTextureW] = useState(16);
  const [newTextureH, setNewTextureH] = useState(16);

  const [editorTarget, setEditorTarget] = useState<{
    relPath: string;
    dataUrl: string | null;
    w: number;
    h: number;
  } | null>(null);

  async function refreshAll(dir: string) {
    setMeta(await rpReadMeta(dir));
    const next: Record<string, TextureStatus> = {};
    for (const t of GUI_TEXTURES) {
      next[t.key] = await rpTextureStatus(dir, t.relPath);
    }
    setStatuses(next);
    setAllTextures(await rpListAllTextures(dir));
  }

  async function downloadPack() {
    if (!packDir || !downloadUrl) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await rpDownloadPack(downloadUrl, downloadSha1, packDir);
      await refreshAll(packDir);
      setStatus(`Pobrano i rozpakowano ${result.files_extracted} plików (SHA1: ${result.sha1}).`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadVanilla() {
    if (!packDir) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await rpDownloadVanillaAssets(vanillaVersion, packDir);
      await refreshAll(packDir);
      setStatus(`Pobrano oficjalny klient Minecraft i rozpakowano ${result.files_extracted} plików z assets/ (SHA1: ${result.sha1}).`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openEditor(relPath: string, defaultW: number, defaultH: number) {
    if (!packDir) return;
    setBusy(true);
    setStatus(null);
    try {
      const st = await rpTextureStatus(packDir, relPath);
      setEditorTarget({
        relPath,
        dataUrl: st.preview_data_url,
        w: st.width ?? defaultW,
        h: st.height ?? defaultH,
      });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function afterEditorSaved() {
    if (!packDir || !editorTarget) return;
    const t = GUI_TEXTURES.find((g) => g.relPath === editorTarget.relPath);
    if (t) {
      const st = await rpTextureStatus(packDir, t.relPath);
      setStatuses((prev) => ({ ...prev, [t.key]: st }));
    }
    setAllTextures(await rpListAllTextures(packDir));
    setEditorTarget(null);
    setStatus(`Zapisano: ${editorTarget.relPath}`);
  }

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    setPackDir(selected);
    setSelectedPackId("");
    setStatus(null);
    setBusy(true);
    try {
      await refreshAll(selected);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    rpListMcVersions()
      .then(setMcVersions)
      .catch(() => {});
    listTexturePacks()
      .then(setPackProjects)
      .catch(() => {});
  }, []);

  async function openSavedPack(id: string) {
    const pack = packProjects.find((p) => p.id === id);
    if (!pack) return;
    setSelectedPackId(id);
    setPackDir(pack.local_path);
    setStatus(null);
    setBusy(true);
    try {
      await refreshAll(pack.local_path);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createNewPack() {
    if (!newPackName.trim()) {
      setStatus("Podaj nazwę nowej paczki.");
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    const pack: TexturePackProject = {
      id: crypto.randomUUID(),
      name: newPackName.trim(),
      local_path: selected,
      base_version: null,
    };
    setBusy(true);
    setStatus(null);
    try {
      await saveTexturePack(pack);
      setPackProjects(await listTexturePacks());
      setSelectedPackId(pack.id);
      setNewPackName("");
      setPackDir(selected);
      await refreshAll(selected);
      setStatus(`Utworzono paczkę "${pack.name}".`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeSavedPack(id: string) {
    setBusy(true);
    setStatus(null);
    try {
      await deleteTexturePack(id);
      setPackProjects(await listTexturePacks());
      if (selectedPackId === id) setSelectedPackId("");
      setStatus("Usunięto z listy (pliki na dysku zostały nietknięte).");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta() {
    if (!packDir) return;
    setBusy(true);
    setStatus(null);
    try {
      await rpWriteMeta(packDir, meta);
      setStatus("Zapisano pack.mcmeta.");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeTransparent(t: GuiTexture) {
    if (!packDir) return;
    const d = dims[t.key];
    setBusy(true);
    setStatus(null);
    try {
      await rpMakeTransparent(packDir, t.relPath, d.w, d.h);
      const st = await rpTextureStatus(packDir, t.relPath);
      setStatuses((prev) => ({ ...prev, [t.key]: st }));
      setAllTextures(await rpListAllTextures(packDir));
      setStatus(`Wyczyszczono tło: ${t.label}.`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importTexture(t: GuiTexture, stripAlpha: boolean) {
    if (!packDir) return;
    const selected = await open({ multiple: false, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (typeof selected !== "string") return;
    setBusy(true);
    setStatus(null);
    try {
      await rpImportTexture(packDir, t.relPath, selected, stripAlpha);
      const st = await rpTextureStatus(packDir, t.relPath);
      setStatuses((prev) => ({ ...prev, [t.key]: st }));
      setAllTextures(await rpListAllTextures(packDir));
      setStatus(`Wgrano teksturę: ${t.label}.`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetTexture(t: GuiTexture) {
    if (!packDir) return;
    setBusy(true);
    setStatus(null);
    try {
      await rpResetTexture(packDir, t.relPath);
      const st = await rpTextureStatus(packDir, t.relPath);
      setStatuses((prev) => ({ ...prev, [t.key]: st }));
      setAllTextures(await rpListAllTextures(packDir));
      setStatus(`Przywrócono domyślną teksturę: ${t.label}.`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addNewTextureBlank() {
    if (!packDir || !newTexturePath.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const relPath = newTexturePath.trim();
      await rpMakeTransparent(packDir, relPath, newTextureW, newTextureH);
      setAllTextures(await rpListAllTextures(packDir));
      const st = await rpTextureStatus(packDir, relPath);
      setEditorTarget({ relPath, dataUrl: st.preview_data_url, w: newTextureW, h: newTextureH });
      setStatus(`Dodano nową teksturę: ${relPath}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addNewTextureFromFile(stripAlpha: boolean) {
    if (!packDir || !newTexturePath.trim()) return;
    const selected = await open({ multiple: false, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (typeof selected !== "string") return;
    setBusy(true);
    setStatus(null);
    try {
      await rpImportTexture(packDir, newTexturePath.trim(), selected, stripAlpha);
      setAllTextures(await rpListAllTextures(packDir));
      setStatus(`Dodano nową teksturę: ${newTexturePath.trim()}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportZip() {
    if (!packDir) return;
    const activePack = packProjects.find((p) => p.id === selectedPackId);
    const output = await save({
      defaultPath: activePack ? `${activePack.name}.zip` : "resourcepack.zip",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!output) return;
    setBusy(true);
    setStatus(null);
    try {
      await rpExportZip(packDir, output);
      setExportedZipPath(output);
      setStatus(`Zbudowano paczkę: ${output}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadZip() {
    if (!uploadProfileId || !uploadRemotePath || !exportedZipPath) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpUploadLocalFile(uploadProfileId, exportedZipPath, uploadRemotePath);
      setStatus("Wysłano paczkę na serwer.");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (editorTarget) {
    return (
      <div className="page">
        <button type="button" className="back-link pixel-editor-back" onClick={() => setEditorTarget(null)}>
          ← Wróć do Resource Pack
        </button>
        <PixelEditor
          packDir={packDir}
          relPath={editorTarget.relPath}
          initialDataUrl={editorTarget.dataUrl}
          defaultWidth={editorTarget.w}
          defaultHeight={editorTarget.h}
          onClose={() => setEditorTarget(null)}
          onSaved={afterEditorSaved}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Texturepack Creator</h1>
      <p className="muted">
        Buduj resource packi na bazie oficjalnych tekstur Minecrafta (pobranych i zweryfikowanych z API Mojang) -
        edytuj, dodawaj własne tekstury, usuwaj tła GUI, eksportuj .zip i wysyłaj prosto na serwer.
      </p>

      <div className="card form">
        <div className="card-title">Moje paczki tekstur</div>
        <div className="row">
          <select value={selectedPackId} onChange={(e) => openSavedPack(e.target.value)} disabled={busy}>
            <option value="">Wybierz zapisaną paczkę...</option>
            {packProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => removeSavedPack(selectedPackId)} disabled={busy || !selectedPackId}>
            Usuń z listy
          </button>
        </div>
        <div className="row">
          <input
            placeholder="Nazwa nowej paczki, np. Serwer Główny"
            value={newPackName}
            onChange={(e) => setNewPackName(e.target.value)}
          />
          <button type="button" onClick={createNewPack} disabled={busy || !newPackName.trim()}>
            + Nowa paczka...
          </button>
        </div>
      </div>

      <div className="row">
        <input placeholder="Folder projektu resource packa" value={packDir} readOnly />
        <button onClick={pickFolder} disabled={busy}>
          Wybierz folder ręcznie (bez zapisywania na liście)...
        </button>
      </div>

      {packDir && (
        <>
          <div className="row rp-subtabs">
            {SUB_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={activeTab === t.key ? "active" : ""}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "source" && (
          <>
          <div className="card form">
            <div className="card-title">Baza: pełne tekstury Vanilla Minecraft (oficjalny klient Mojang)</div>
            <p className="muted">
              Pobiera oryginalny klient danej wersji z oficjalnego API Mojang (jak każdy launcher), weryfikuje sumę
              SHA1 publikowaną przez Mojang i wypakowuje cały folder assets/ jako bazę do edycji.
            </p>
            <div className="row">
              <select value={vanillaVersion} onChange={(e) => setVanillaVersion(e.target.value)}>
                <option value="">Najnowsza stabilna</option>
                {mcVersions
                  .filter((v) => showSnapshots || v.version_type === "release")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                      {v.version_type !== "release" ? ` (${v.version_type})` : ""}
                    </option>
                  ))}
              </select>
              <label className="checkbox">
                <input type="checkbox" checked={showSnapshots} onChange={(e) => setShowSnapshots(e.target.checked)} />
                Pokaż snapshoty
              </label>
              <button onClick={downloadVanilla} disabled={busy}>
                Pobierz bazę Vanilla
              </button>
            </div>
          </div>

          <div className="card form">
            <div className="card-title">Pobierz gotową paczkę (np. link z MCPacks)</div>
            <div className="row">
              <input
                placeholder="https://api.mc-packs.net/pack/xxxxx.zip"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
              />
              <input
                placeholder="SHA1 (opcjonalnie, do weryfikacji)"
                value={downloadSha1}
                onChange={(e) => setDownloadSha1(e.target.value)}
                style={{ maxWidth: 260 }}
              />
              <button onClick={downloadPack} disabled={busy || !downloadUrl}>
                Pobierz i rozpakuj
              </button>
            </div>
          </div>
          </>
          )}

          {activeTab === "meta" && (
          <div className="card form">
            <label>
              pack_format
              <input
                type="number"
                min={0}
                value={meta.pack_format}
                onChange={(e) => setMeta({ ...meta, pack_format: Number(e.target.value) })}
              />
            </label>
            <label>
              Opis paczki
              <input
                value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                placeholder="Mój resource pack"
              />
            </label>
            <div className="row">
              <button onClick={saveMeta} disabled={busy}>
                Zapisz pack.mcmeta
              </button>
            </div>
          </div>
          )}

          {activeTab === "gui" && (
          <fieldset className="card">
            <legend>Tekstury GUI kontenerów</legend>
            {GUI_TEXTURES.map((t) => {
              const st = statuses[t.key];
              const d = dims[t.key];
              return (
                <div key={t.key} className="rp-texture-row">
                  <div className="rp-texture-preview">
                    {st?.preview_data_url ? (
                      <img src={st.preview_data_url} alt={t.label} />
                    ) : (
                      <span className="muted">brak</span>
                    )}
                  </div>
                  <div className="rp-texture-info">
                    <div>
                      <b>{t.label}</b>{" "}
                      <span className={st?.overridden ? "badge badge-on" : "badge"}>
                        {st?.overridden ? `Nadpisana (${st.width}x${st.height})` : "Domyślna (vanilla)"}
                      </span>
                    </div>
                    <div className="row">
                      <label className="checkbox">
                        Szer.
                        <input
                          type="number"
                          min={1}
                          style={{ width: 70 }}
                          value={d.w}
                          onChange={(e) =>
                            setDims((prev) => ({ ...prev, [t.key]: { ...prev[t.key], w: Number(e.target.value) } }))
                          }
                        />
                      </label>
                      <label className="checkbox">
                        Wys.
                        <input
                          type="number"
                          min={1}
                          style={{ width: 70 }}
                          value={d.h}
                          onChange={(e) =>
                            setDims((prev) => ({ ...prev, [t.key]: { ...prev[t.key], h: Number(e.target.value) } }))
                          }
                        />
                      </label>
                      <button type="button" onClick={() => makeTransparent(t)} disabled={busy}>
                        Usuń tło
                      </button>
                      <button type="button" onClick={() => importTexture(t, true)} disabled={busy}>
                        Wgraj i wyczyść tło...
                      </button>
                      <button type="button" onClick={() => importTexture(t, false)} disabled={busy}>
                        Wgraj bez zmian...
                      </button>
                      <button type="button" onClick={() => resetTexture(t)} disabled={busy || !st?.overridden}>
                        Przywróć domyślną
                      </button>
                      <button type="button" onClick={() => openEditor(t.relPath, d.w, d.h)} disabled={busy}>
                        Edytuj (kolory/gumka)...
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </fieldset>
          )}

          {activeTab === "all" && (
          <>
          <fieldset className="card">
            <legend>Wszystkie tekstury w paczce ({allTextures.length})</legend>
            <TextureBrowser packDir={packDir} textures={allTextures} onEdit={(p) => openEditor(p, 16, 16)} />
          </fieldset>

          <fieldset className="card">
            <legend>Dodaj nową teksturę (nowa ścieżka, nie nadpisuje)</legend>
            <div className="row">
              <input
                placeholder="assets/minecraft/textures/item/moj_item.png"
                value={newTexturePath}
                onChange={(e) => setNewTexturePath(e.target.value)}
              />
              <label className="checkbox">
                Szer.
                <input
                  type="number"
                  min={1}
                  style={{ width: 70 }}
                  value={newTextureW}
                  onChange={(e) => setNewTextureW(Number(e.target.value))}
                />
              </label>
              <label className="checkbox">
                Wys.
                <input
                  type="number"
                  min={1}
                  style={{ width: 70 }}
                  value={newTextureH}
                  onChange={(e) => setNewTextureH(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="row">
              <button type="button" onClick={addNewTextureBlank} disabled={busy || !newTexturePath.trim()}>
                Utwórz pustą i otwórz w edytorze
              </button>
              <button type="button" onClick={() => addNewTextureFromFile(true)} disabled={busy || !newTexturePath.trim()}>
                Wgraj plik i wyczyść tło...
              </button>
              <button type="button" onClick={() => addNewTextureFromFile(false)} disabled={busy || !newTexturePath.trim()}>
                Wgraj plik bez zmian...
              </button>
            </div>
          </fieldset>
          </>
          )}

          {activeTab === "export" && (
          <div className="card form">
            <div className="row">
              <button onClick={exportZip} disabled={busy}>
                Zbuduj .zip
              </button>
              {exportedZipPath && <span className="muted">{exportedZipPath}</span>}
            </div>

            <div className="row">
              <select value={uploadProfileId} onChange={(e) => setUploadProfileId(e.target.value)}>
                <option value="">Wybierz serwer...</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                placeholder="/resourcepack.zip"
                value={uploadRemotePath}
                onChange={(e) => setUploadRemotePath(e.target.value)}
              />
              <button onClick={uploadZip} disabled={busy || !exportedZipPath || !uploadProfileId || !uploadRemotePath}>
                Wyślij na serwer
              </button>
            </div>
          </div>
          )}
        </>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
