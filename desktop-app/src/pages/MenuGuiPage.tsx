import { useDirtyTracking } from "../state/DirtyContext";
import { RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MaterialField from "../components/MaterialField";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import SlotGrid from "../components/SlotGrid";
import type { SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { DEFAULT_MENU_GUI } from "../lib/menuDefaults";
import { parseMenuGuiContent, serializeMenuGuiContent } from "../lib/menuYaml";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { MenuButton, MenuGuiContent } from "../lib/types";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "menu";

const EMPTY_BUTTON: MenuButton = { slot: 0, material: "STONE", nazwa: "", lore: [], komenda: "" };

export default function MenuGuiPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [content, setContent] = useState<MenuGuiContent | null>(null);
  const [serverContent, setServerContent] = useState<MenuGuiContent | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [editing, setEditing] = useState<MenuButton>(EMPTY_BUTTON);
  const [pickedUpSlot, setPickedUpSlot] = useState<number | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadmenu");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  const { iconPackDir, allMaterials } = useIconPack(setStatus);
  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<MenuGuiContent>("menu");

  function pathFor(base: string): string {
    return `${base.replace(/\/+$/, "")}/MainpluginsMenu/menu-gui.yml`;
  }

  // If mainplugins-menu hasn't run on this server yet, menu-gui.yml doesn't
  // exist - bootstrap it with the plugin's real bundled default (same idea
  // as IslandsPage.loadAll) instead of requiring someone to start the plugin
  // first or hand-copy the file over.
  async function loadAll(pid: string, path: string) {
    setBusy(true);
    setStatus(null);
    try {
      try {
        const text = await sftpReadFile(pid, path);
        const parsed = parseMenuGuiContent(text);
        setContent(parsed);
        setServerContent(parsed);
      } catch {
        await sftpWriteFile(pid, path, serializeMenuGuiContent(DEFAULT_MENU_GUI));
        setContent(DEFAULT_MENU_GUI);
        setServerContent(DEFAULT_MENU_GUI);
        setStatus("menu-gui.yml nie istniało — wgrano domyślną wersję. Serwer użyje jej po /@reloadmenu albo restarcie.");
      }
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    setProfileId(id);
    setEditingSlot(null);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = pathFor(p.remote_plugins_path);
    setRemotePath(path);
    loadPresets(id);
    loadAll(id, path);
  }

  // Serwer aktywny GLOBALNIE (pasek boczny) ma pierwszeństwo - dopiero gdy nic tam
  // jeszcze nie wybrano, sięgamy do starego zapisu specyficznego dla tej strony albo,
  // przy dokładnie jednym profilu, wybieramy go automatycznie.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) {
      selectProfile(profileId);
      return;
    }
    const last = getLastUsed(LAST_USED_KEY);
    const fallback = profiles.length === 1 ? profiles[0] : undefined;
    const pid = last && profiles.some((p) => p.id === last.profileId) ? last.profileId : fallback?.id;
    if (!pid) return;
    selectProfile(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  // Edits only touch local state - nothing reaches the server until "Wyślij
  // na serwer" is clicked, and "Cofnij do stanu z serwera" throws away local
  // changes and goes back to serverContent (set on load and after a
  // successful publish).
  const dirty = content !== serverContent;
  useDirtyTracking(dirty);

  function update(patch: Partial<MenuGuiContent>) {
    if (!content) return;
    setContent({ ...content, ...patch });
  }

  function upsertButton(button: MenuButton) {
    if (!content) return;
    const withoutSlot = content.przyciski.filter((b) => b.slot !== button.slot);
    update({ przyciski: [...withoutSlot, button] });
  }

  function removeButtonAt(slot: number) {
    if (!content) return;
    update({ przyciski: content.przyciski.filter((b) => b.slot !== slot) });
    if (editingSlot === slot) closeEditor();
  }

  function moveOrSwapSlot(fromSlot: number, toSlot: number) {
    if (!content) return;
    const next = content.przyciski.map((b) => {
      if (b.slot === fromSlot) return { ...b, slot: toSlot };
      if (b.slot === toSlot) return { ...b, slot: fromSlot };
      return b;
    });
    update({ przyciski: next });
  }

  function pickUpOrMoveSlot(slot: number) {
    if (pickedUpSlot === null) {
      setPickedUpSlot(slot);
      return;
    }
    if (pickedUpSlot === slot) {
      setPickedUpSlot(null);
      return;
    }
    moveOrSwapSlot(pickedUpSlot, slot);
    setPickedUpSlot(null);
  }

  function openEditorFor(button: MenuButton) {
    setEditing(button);
    setEditingSlot(button.slot);
    setEditingIsNew(false);
  }

  function openNewButtonAt(slot: number) {
    setEditing({ ...EMPTY_BUTTON, slot });
    setEditingSlot(slot);
    setEditingIsNew(true);
  }

  function closeEditor() {
    setEditingSlot(null);
    setEditingIsNew(false);
  }

  function saveEditor() {
    if (!editing.komenda.trim()) {
      setStatus("Podaj komendę wywoływaną po kliknięciu.");
      return;
    }
    upsertButton(editing);
    closeEditor();
  }

  // Writing the file over SFTP does NOT make the running plugin pick it up -
  // it still has the old menu cached in memory until told to reload, so
  // publish also sends the RCON reload command right after a successful
  // write.
  async function publish() {
    if (!profileId || !remotePath || !content) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeMenuGuiContent(content));
      setServerContent(content);
      let statusMsg = "Wysłano układ menu na serwer.";
      if (reloadCommand) {
        try {
          const result = await rconSendCommand(profileId, reloadCommand);
          statusMsg += ` Przeładowano (RCON: ${result || "OK"}).`;
        } catch (e) {
          statusMsg += ` Uwaga: przeładowanie nie powiodło się (${String(e)}) - zmiany są zapisane, ale serwer może jeszcze pokazywać stare dane do ręcznego "Wyślij RCON".`;
        }
      }
      setStatus(statusMsg);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function revertToServer() {
    setContent(serverContent);
    closeEditor();
    setPickedUpSlot(null);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
  }

  async function saveCurrentPresetAs() {
    if (!content || !profileId) return;
    const name = await showPrompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(profileId, name, content);
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    setContent(found);
    setStatus(`Wczytano preset „${name}" do edycji — kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function refetchFromServer() {
    if (!profileId || !remotePath) return;
    loadAll(profileId, remotePath);
  }

  async function reload() {
    if (!reloadCommand || !profileId) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, reloadCommand);
      setStatus(`RCON: ${result || "(brak odpowiedzi)"}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function gridContent(): Record<number, SlotContent> {
    if (!content) return {};
    const out: Record<number, SlotContent> = {};
    for (const b of content.przyciski) {
      out[b.slot] = {
        label: b.nazwa.replace(/&./g, "") || "(bez nazwy)",
        kind: "nav",
        material: b.material,
        highlighted: pickedUpSlot === b.slot,
        onClick: pickedUpSlot !== null ? () => pickUpOrMoveSlot(b.slot) : () => openEditorFor(b),
        onPickUp: () => pickUpOrMoveSlot(b.slot),
        onEdit: () => openEditorFor(b),
      };
    }
    for (let i = 0; i < content.size; i++) {
      if (out[i]) continue;
      out[i] = {
        label: pickedUpSlot !== null ? "" : "+",
        kind: "filler",
        dim: true,
        onClick: () => (pickedUpSlot !== null ? pickUpOrMoveSlot(i) : openNewButtonAt(i)),
      };
    }
    return out;
  }

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Główne Menu Serwera</h1>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
        <button type="button" onClick={revertToServer} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        {dirty && <span className="muted small">masz niezapisane zmiany</span>}
      </div>

      <datalist id="materials">
        {allMaterials.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <ToolbarMore>
        <PresetBar
          presets={presetList}
          selectedName={selectedPresetName}
          onSelectName={setSelectedPresetName}
          onSaveAs={saveCurrentPresetAs}
          onLoad={loadPresetIntoDraft}
          onDelete={(name) => deletePreset(profileId, name)}
          disabled={!profileId}
        />
        <div className="row">
          <button type="button" onClick={refetchFromServer} disabled={busy || !profileId}>
            <RefreshCw size={14} strokeWidth={1.75} /> Pobierz aktualny z serwera
          </button>
        </div>
      </ToolbarMore>

      {content && (
        <>
          <p className="muted small">
            Kliknij przycisk, żeby go edytować (ikona/nazwa/opis/komenda), ikona przesunięcia w rogu — żeby przenieść na inny slot. "+"
            na pustym polu dodaje nowy przycisk. Każdy przycisk woła dowolną komendę Bukkita po kliknięciu — to
            jedyny sposób, w jaki menu łączy się z resztą pluginów (żaden na stałe wpisany w serwer, w przeciwieństwie
            do np. wysp).
          </p>

          <div className="row">
            <label>
              Rozmiar (9–54)
              <input
                type="number"
                min={9}
                max={54}
                step={9}
                value={content.size}
                onChange={(e) => update({ size: Number(e.target.value) })}
              />
            </label>
            <label>
              Tło (materiał pustych slotów)
              <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={content.tlo} onChange={(v) => update({ tlo: v })} />
            </label>
          </div>

          <div className="two-col two-col-grid-wide">
            <div className="card">
              <h2>Menu główne</h2>
              <SlotGrid content={gridContent()} size={content.size} iconPackDir={iconPackDir} />
            </div>

            <div className="card form">
              {editingSlot !== null ? (
                <>
                  <h2>{editingIsNew ? "Nowy przycisk" : editing.nazwa.replace(/&./g, "") || "(bez nazwy)"}</h2>
                  <p className="muted small">Slot {editing.slot}</p>
                  <label>
                    Nazwa
                    <MinecraftTextInput value={editing.nazwa} onChange={(v) => setEditing({ ...editing, nazwa: v })} placeholder="&aNazwa przycisku" />
                  </label>
                  <label>
                    Ikona (materiał)
                    <MaterialField datalistId="materials" iconPackDir={iconPackDir} value={editing.material} onChange={(v) => setEditing({ ...editing, material: v })} />
                  </label>
                  <fieldset>
                    <legend>Opis (lore)</legend>
                    {editing.lore.map((line, i) => (
                      <div key={i} className="mc-message-row">
                        <MinecraftTextInput
                          value={line}
                          onChange={(v) => {
                            const next = [...editing.lore];
                            next[i] = v;
                            setEditing({ ...editing, lore: next });
                          }}
                          placeholder="&7Linijka opisu"
                        />
                        <button type="button" onClick={() => setEditing({ ...editing, lore: editing.lore.filter((_, li) => li !== i) })}>
                          Usuń
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setEditing({ ...editing, lore: [...editing.lore, ""] })}>
                      + Dodaj linijkę
                    </button>
                  </fieldset>
                  <label>
                    Komenda (bez ukośnika, wywołana jako gracz po kliknięciu)
                    <input value={editing.komenda} onChange={(e) => setEditing({ ...editing, komenda: e.target.value })} placeholder="np. sklep zmenu" />
                  </label>
                  <p className="muted small">
                    "zmenu" na końcu to konwencja z MenuBridge (mainplugins-core) — mówi docelowej komendzie, że
                    otwarto ją z /menu (np. żeby wiedziała pokazać przycisk powrotu).
                  </p>
                  <div className="row">
                    <button type="button" onClick={saveEditor}>
                      Zapisz przycisk (lokalnie — pamiętaj o "Wyślij na serwer")
                    </button>
                    {!editingIsNew && (
                      <button type="button" onClick={() => removeButtonAt(editing.slot)}>
                        Usuń przycisk
                      </button>
                    )}
                    <button type="button" onClick={closeEditor}>
                      Zamknij
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">Kliknij przycisk w siatce, żeby go edytować, albo puste pole, żeby dodać nowy.</p>
              )}
            </div>
          </div>
        </>
      )}

      {!content && profileId && <p className="muted">Wczytywanie...</p>}

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadmenu" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
