import { Save, ScrollText, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CommandTip, CopyRow, Fold, LoreEditor } from "../components/EditorBits";
import ItemRefPicker from "../components/ItemRefPicker";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import { showPrompt } from "../components/PromptModal";
import RewardEditor from "../components/RewardEditor";
import SlotGrid, { type SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { readSetting } from "../lib/coreSettings";
import { idFromName, parseCratesYaml } from "../lib/cratesYaml";
import { loadItemCatalog } from "../lib/itemCatalogRemote";
import type { ItemRef } from "../lib/itemRef";
import { conventionalRoleIcon } from "../lib/materialIcons";
import { QUEST_TEMPLATES, templateFor } from "../lib/questTemplates";
import {
  addCategory,
  defaultRequirement,
  emptyQuest,
  nextQuestId,
  parseQuestsYaml,
  plain,
  removeCategory,
  REQUIREMENT_TYPES,
  serializeQuestsYaml,
  validateQuests,
  type CategoryDef,
  type QuestDef,
  type QuestSettings,
  type QuestsFile,
  type Requirement,
  type SlotEntry,
  type SlotRole,
} from "../lib/questsYaml";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

const EMPTY: QuestsFile = parseQuestsYaml("");
// Wymogi zadań mogą przekraczać stack - do 36 stacków (cały ekwipunek).
const MAX_REQUIRED = 36 * 64;

type View =
  | { kind: "category"; id: string; quest: number | "settings" }
  | { kind: "menu" }
  | { kind: "titles" }
  | { kind: "look" };

const NAV_LABEL: Record<string, string> = { NAV_PREV: "Wstecz", NAV_BACK: "Powrót", NAV_NEXT: "Dalej" };
const PAGE_ROLES: { role: SlotRole; label: string }[] = [
  { role: "QUEST_SLOT", label: "Miejsce na zadanie" },
  { role: "NAV_BACK", label: "Przycisk: powrót" },
  { role: "NAV_PREV", label: "Przycisk: poprzednia strona" },
  { role: "NAV_NEXT", label: "Przycisk: następna strona" },
  { role: "FILLER", label: "Tło (inny kolor)" },
];
const MENU_ROLES: { role: SlotRole; label: string }[] = [
  { role: "CATEGORY_SLOT", label: "Miejsce na kategorię" },
  { role: "FILLER", label: "Tło (inny kolor)" },
];

function questsPath(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsQuests/quests.yml`;
}

function QuestCommandsModal({ file, onClose }: { file: QuestsFile; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Komendy questów</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="muted small">
          Gracz: /quests (albo /zadania). Admin (uprawnienie mainplugins.quests.admin) - w konsoli bez „/” na początku.
        </p>
        <div className="ci-protip">
          <CopyRow cmd="/@quests reload" what="wczytuje questy od nowa (aplikacja robi to sama po „Wyślij na serwer”)" />
          <CopyRow cmd="/@quests list" what="lista kategorii i liczba zadań" />
          <CopyRow cmd="/@quests reset <gracz>" what="zeruje graczowi cały postęp (też tytuły)" />
          <CopyRow cmd="/@unlock give <gracz> <nazwa>" what="daje graczowi odblokowanie (np. do kategorii z „Wymaga odblokowania”)" />
          <CopyRow cmd="/@unlock list <gracz>" what="odblokowania gracza" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Twoje kategorie
        </div>
        <div className="ci-protip">
          {file.categories.length === 0 && <span className="muted small">Brak kategorii.</span>}
          {file.categories.map((c) => (
            <CopyRow key={c.id} cmd={`/@quests reset <gracz> ${c.id}`} what={<MinecraftTextPreview text={c.name} emptyLabel={c.id} />} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function QuestsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  // file = to, co widać i edytujesz; saved = zapisane w aplikacji („Zapisz”); serverFile = stan na serwerze.
  const [file, setFile] = useState<QuestsFile>(EMPTY);
  const [saved, setSaved] = useState<QuestsFile>(EMPTY);
  const [serverFile, setServerFile] = useState<QuestsFile>(EMPTY);
  const [view, setView] = useState<View | null>(null);
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [crateIds, setCrateIds] = useState<string[]>([]);
  const [keyIds, setKeyIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState<string | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [layoutEdit, setLayoutEdit] = useState(false);
  const [addRole, setAddRole] = useState<SlotRole>("QUEST_SLOT");
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  const unsaved = useMemo(() => serializeQuestsYaml(file) !== serializeQuestsYaml(saved), [file, saved]);
  const notSent = useMemo(() => serializeQuestsYaml(saved) !== serializeQuestsYaml(serverFile), [saved, serverFile]);
  useDirtyTracking(unsaved || notSent);
  const category = view?.kind === "category" ? (file.categories.find((c) => c.id === view.id) ?? null) : null;
  useEffect(() => {
    setConfirmDelete(false);
    setLayoutEdit(false);
  }, [view]);

  async function load(pid: string, path: string) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    const base = path.replace(/\/+$/, "");
    let language = "en";
    try {
      language = readSetting(await sftpReadFile(pid, `${base}/MainpluginsCore/config.yml`), "language") ?? "en";
    } catch {
      // brak configu core - zostaje angielski
    }
    try {
      const parsed = parseQuestsYaml(await sftpReadFile(pid, questsPath(path)));
      setFile(parsed);
      setSaved(parsed);
      setServerFile(parsed);
      setView(parsed.categories[0] ? { kind: "category", id: parsed.categories[0].id, quest: "settings" } : { kind: "menu" });
    } catch {
      // Na serwerze nie ma jeszcze quests.yml - pokazujemy domyślne questy (jak plugin przy pierwszym starcie).
      const def = parseQuestsYaml(templateFor(language));
      setFile(def);
      setSaved(def);
      setServerFile(EMPTY);
      setView({ kind: "category", id: def.categories[0].id, quest: "settings" });
      setStatus(`Na serwerze nie ma jeszcze quests.yml - wczytano domyślne questy (język: ${language}). Kliknij „Wyślij na serwer”, żeby je tam zapisać.`);
    } finally {
      setBusy(false);
    }
    loadItemCatalog(pid, path)
      .then((c) => setCustomIds(c.items.map((it) => it.id)))
      .catch(() => setCustomIds([]));
    // Skrzynki są opcjonalne - bez nich listy podpowiedzi są po prostu puste.
    sftpReadFile(pid, `${base}/MainpluginsCrates/crates.yml`)
      .then((t) => {
        const crates = parseCratesYaml(t);
        setCrateIds(crates.crates.map((c) => c.id));
        setKeyIds(crates.keys.map((k) => k.id));
      })
      .catch(() => {
        setCrateIds([]);
        setKeyIds([]);
      });
  }

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setPluginsPath(p.remote_plugins_path);
    load(id, p.remote_plugins_path);
  }

  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) selectProfile(profileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  function save() {
    setSaved(file);
    setStatus("Zapisano w aplikacji. Kliknij „Wyślij na serwer” u góry, żeby zmiany trafiły na serwer.");
  }

  async function publish() {
    if (!profileId || !pluginsPath) return;
    let toSend = saved;
    if (unsaved) {
      if (!window.confirm("Masz niezapisane zmiany. Zapisać je i wysłać razem?")) return;
      toSend = file;
      setSaved(file);
    }
    const warnings = validateQuests(toSend);
    if (warnings.length && !window.confirm(`Uwaga:\n- ${warnings.join("\n- ")}\n\nWysłać mimo to?`)) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, questsPath(pluginsPath), serializeQuestsYaml(toSend));
      setServerFile(toSend);
      let msg = "Wysłano na serwer.";
      try {
        const r = await rconSendCommand(profileId, "@quests reload");
        msg += ` Przeładowano (RCON: ${r || "OK"}).`;
      } catch (e) {
        msg += ` ${String(e)}`;
      }
      setStatus(msg);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function loadTemplate(id: string) {
    const t = QUEST_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm(`Wczytać szablon „${t.label}”? Questy w edytorze zostaną zastąpione (na serwerze nic się nie zmieni, dopóki nie wyślesz).`)) return;
    const f = parseQuestsYaml(t.text);
    setFile(f);
    setView(f.categories[0] ? { kind: "category", id: f.categories[0].id, quest: "settings" } : { kind: "menu" });
    setStatus(`Wczytano szablon „${t.label}”. Kliknij „Zapisz”, a potem „Wyślij na serwer”.`);
  }

  // ---- Zmiany w pliku ----

  function updateCategory(id: string, patch: Partial<CategoryDef>) {
    setFile({ ...file, categories: file.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function setMainPath(id: string, on: boolean) {
    setFile({ ...file, categories: file.categories.map((c) => ({ ...c, mainPath: c.id === id ? on : on ? false : c.mainPath })) });
  }

  async function newCategory() {
    const name = (await showPrompt("Nazwa nowej kategorii (może mieć spacje, np. Kowalstwo):"))?.trim();
    if (!name) return;
    const id = idFromName(name, file.categories.map((c) => c.id));
    setFile(addCategory(file, id, name));
    setView({ kind: "category", id, quest: "settings" });
    setStatus(`Dodano kategorię „${name}” (ID: ${id}). Pamiętaj, żeby w „Menu główne” było dla niej miejsce.`);
  }

  async function newTitle() {
    const name = (await showPrompt("Nazwa tytułu (np. Weteran):"))?.trim();
    if (!name) return;
    const id = idFromName(name, Object.keys(file.titles));
    setFile({ ...file, titles: { ...file.titles, [id]: `&7&l[${name}] ` } });
  }

  function doRemoveCategory(id: string) {
    setFile(removeCategory(file, id));
    if (view?.kind === "category" && view.id === id) setView({ kind: "menu" });
  }

  function doRemoveQuest(c: CategoryDef, i: number) {
    updateCategory(c.id, { quests: c.quests.filter((_, qi) => qi !== i) });
    if (view?.kind === "category" && typeof view.quest === "number") {
      if (view.quest === i) setView({ kind: "category", id: c.id, quest: "settings" });
      else if (view.quest > i) setView({ kind: "category", id: c.id, quest: view.quest - 1 });
    }
  }

  // ---- Siatka menu ----

  function layoutEditor(layout: SlotEntry[], onChange: (l: SlotEntry[]) => void, mode: "menu" | "page", c?: CategoryDef) {
    const content: Record<number, SlotContent> = {};
    let n = 0;
    for (const e of layout) {
      if (e.role === "CATEGORY_SLOT") {
        const cat = file.categories[n++];
        content[e.slot] = { label: cat ? plain(cat.name) : "(wolne)", kind: "category", material: cat?.icon.item, dim: !cat };
      } else if (e.role === "QUEST_SLOT") {
        const q = c?.quests[n++];
        content[e.slot] = {
          label: q ? `#${q.id}` : "(wolne)",
          sublabel: q ? plain(q.title) : undefined,
          kind: "quest",
          material: file.settings.icons.available.item,
          dim: !q,
        };
      } else if (e.role === "FILLER") {
        content[e.slot] = { label: "", kind: "filler", material: e.item };
      } else {
        content[e.slot] = { label: NAV_LABEL[e.role] ?? e.role, kind: "nav", material: conventionalRoleIcon(e.role) };
      }
    }
    const roles = mode === "menu" ? MENU_ROLES : PAGE_ROLES;
    return (
      <>
        <SlotGrid
          content={content}
          editable={layoutEdit}
          iconPackDir={iconPackDir}
          onMoveSlot={(from, to) =>
            onChange(layout.map((e) => (e.slot === from ? { ...e, slot: to } : e.slot === to ? { ...e, slot: from } : e)))
          }
          onAddSlot={(slot) => onChange([...layout, addRole === "FILLER" ? { slot, role: addRole, item: "GRAY_STAINED_GLASS_PANE" } : { slot, role: addRole }])}
          onRemoveSlot={(slot) => onChange(layout.filter((e) => e.slot !== slot))}
        />
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <label className="checkbox">
            <input type="checkbox" checked={layoutEdit} onChange={(e) => setLayoutEdit(e.target.checked)} />
            Zmieniam układ (kliknij pole, żeby je przenieść; puste pole = dodaj)
          </label>
          {layoutEdit && (
            <select value={roles.some((r) => r.role === addRole) ? addRole : roles[0].role} onChange={(e) => setAddRole(e.target.value as SlotRole)}>
              {roles.map((r) => (
                <option key={r.role} value={r.role}>
                  Dodawane: {r.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="muted small">
          {mode === "menu"
            ? "Kategorie trafiają na „Miejsca na kategorię” po kolei - tak jak na liście po lewej."
            : "Zadania trafiają na „Miejsca na zadanie” po kolei. Gdy zadań jest więcej niż miejsc, gra robi kolejne strony (przyciski strzałek)."}
        </p>
      </>
    );
  }

  // ---- Prawy panel ----

  function renderCategorySettings(c: CategoryDef) {
    const others = file.categories.filter((x) => x.id !== c.id);
    const afterCat = c.after ? file.categories.find((x) => x.id === c.after!.category) : undefined;
    return (
      <>
        <h2>
          <MinecraftTextPreview text={c.name} emptyLabel={c.id} />{" "}
          <span className="muted small" title="ID używane w komendach">
            ID: {c.id}
          </span>
        </h2>
        <CommandTip commands={[{ cmd: `/@quests reset <gracz> ${c.id}`, what: "zeruje graczowi postęp w tej kategorii" }]} />
        <Fold title="Nazwa i wygląd" open>
          <label>
            Nazwa
            <MinecraftTextInput value={c.name} onChange={(v) => updateCategory(c.id, { name: v })} placeholder="Nazwa kategorii" />
          </label>
          <label>
            Opis (pod nazwą w menu)
            <MinecraftTextInput value={c.description} onChange={(v) => updateCategory(c.id, { description: v })} placeholder="Krótki opis" />
          </label>
          <div className="ci-section-title">Ikona</div>
          <ItemRefPicker value={c.icon} onChange={(r) => updateCategory(c.id, { icon: r })} materials={allMaterials} customIds={customIds} />
          <label className="checkbox">
            <input type="checkbox" checked={c.mainPath} onChange={(e) => setMainPath(c.id, e.target.checked)} />
            Główna Ścieżka (powitanie po pierwszym zadaniu i przypomnienie po wejściu na serwer)
          </label>
        </Fold>
        <Fold title="Zasady">
          <label className="checkbox">
            <input type="checkbox" checked={c.sequential} onChange={(e) => updateCategory(c.id, { sequential: e.target.checked })} />
            Zadania po kolei (następne czeka, aż gracz zrobi poprzednie)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={c.after != null}
              disabled={others.length === 0}
              onChange={(e) =>
                updateCategory(c.id, {
                  after: e.target.checked ? { category: others[0].id, quest: others[0].quests[0]?.id ?? 1 } : null,
                })
              }
            />
            Odblokowana po zadaniu z innej kategorii
          </label>
          {c.after && (
            <div className="row">
              <select
                value={c.after.category}
                onChange={(e) => {
                  const cat = file.categories.find((x) => x.id === e.target.value);
                  updateCategory(c.id, { after: { category: e.target.value, quest: cat?.quests[0]?.id ?? 1 } });
                }}
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {plain(o.name) || o.id}
                  </option>
                ))}
              </select>
              <select value={c.after.quest} onChange={(e) => updateCategory(c.id, { after: { ...c.after!, quest: Number(e.target.value) } })}>
                {(afterCat?.quests ?? []).map((q) => (
                  <option key={q.id} value={q.id}>
                    #{q.id} {plain(q.title)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={c.requiresUnlock != null}
              onChange={(e) => updateCategory(c.id, { requiresUnlock: e.target.checked ? "" : null })}
            />
            Wymaga odblokowania
          </label>
          {c.requiresUnlock != null && (
            <label>
              Nazwa odblokowania
              <input
                value={c.requiresUnlock}
                placeholder="np. nether"
                onChange={(e) => updateCategory(c.id, { requiresUnlock: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              />
            </label>
          )}
          <p className="muted small">
            Odblokowanie daje dowolny plugin nagrodą „Odblokowanie” (np. inne zadanie, osiągnięcie) albo admin komendą /@unlock give
            &lt;gracz&gt; &lt;nazwa&gt;.
          </p>
        </Fold>
        <Fold title="Wygląd strony w grze">{layoutEditor(c.pageLayout, (l) => updateCategory(c.id, { pageLayout: l }), "page", c)}</Fold>
      </>
    );
  }

  function requirementEditor(r: Requirement, onChange: (r: Requirement) => void) {
    return (
      <>
        <select value={r.type} onChange={(e) => onChange(defaultRequirement(e.target.value as Requirement["type"]))}>
          {REQUIREMENT_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        {r.type === "free" && <p className="muted small">Gracz klika zadanie i od razu dostaje nagrody.</p>}
        {r.type === "money" && (
          <label>
            Kwota
            <input type="number" min={1} value={r.amount} onChange={(e) => onChange({ type: "money", amount: Math.max(1, Number(e.target.value)) })} />
          </label>
        )}
        {r.type === "have-item" && (
          <>
            <p className="muted small">Gracz musi mieć ten przedmiot przy sobie. Przedmiot zostaje u niego.</p>
            <ItemRefPicker
              value={r.item}
              onChange={(it) => onChange({ type: "have-item", item: it })}
              materials={allMaterials}
              customIds={customIds}
              showAmount
              maxAmount={MAX_REQUIRED}
            />
          </>
        )}
        {r.type === "items" && (
          <>
            <p className="muted small">Gracz oddaje te przedmioty - znikają z ekwipunku.</p>
            {r.items.map((it, ii) => (
              <div key={ii} className="row">
                <ItemRefPicker
                  value={{ ...it, amount: it.amount ?? 1 }}
                  onChange={(n) => onChange({ type: "items", items: r.items.map((x, xi) => (xi === ii ? n : x)) })}
                  materials={allMaterials}
                  customIds={customIds}
                  showAmount
                  maxAmount={MAX_REQUIRED}
                />
                <button type="button" disabled={r.items.length <= 1} onClick={() => onChange({ type: "items", items: r.items.filter((_, xi) => xi !== ii) })}>
                  Usuń
                </button>
              </div>
            ))}
            <button type="button" onClick={() => onChange({ type: "items", items: [...r.items, { item: "STONE", amount: 1 }] })}>
              + Dodaj przedmiot
            </button>
          </>
        )}
      </>
    );
  }

  function renderQuest(c: CategoryDef, i: number) {
    const q = c.quests[i];
    const setQuest = (patch: Partial<QuestDef>) => updateCategory(c.id, { quests: c.quests.map((x, xi) => (xi === i ? { ...x, ...patch } : x)) });
    return (
      <>
        <h2>
          #{q.id} <MinecraftTextPreview text={q.title} emptyLabel="(bez tytułu)" />
        </h2>
        <CommandTip commands={[{ cmd: `/@quests complete <gracz> ${c.id} ${q.id}`, what: "zalicza graczowi to zadanie i daje nagrody (do testów)" }]} />
        <Fold title="Tytuł i opis" open>
          <label>
            Tytuł
            <MinecraftTextInput value={q.title} onChange={(v) => setQuest({ title: v })} placeholder="Nazwa zadania" />
          </label>
          <div className="ci-section-title">Opis</div>
          <LoreEditor value={q.description} onChange={(l) => setQuest({ description: l })} />
        </Fold>
        <Fold title="Co trzeba zrobić" open>
          {requirementEditor(q.requirement, (r) => setQuest({ requirement: r }))}
        </Fold>
        <Fold title="Nagrody" open>
          <RewardEditor
            value={q.rewards}
            onChange={(l) => setQuest({ rewards: l })}
            materials={allMaterials}
            customIds={customIds}
            crateIds={crateIds}
            keyIds={keyIds}
            titleIds={Object.keys(file.titles)}
          />
          <label>
            Własny opis nagrody w menu (puste = składany z nagród)
            <MinecraftTextInput value={q.rewardLabel ?? ""} onChange={(v) => setQuest({ rewardLabel: v || undefined })} placeholder="np. &e1x Kilof" />
          </label>
        </Fold>
      </>
    );
  }

  function renderTitles() {
    const ids = Object.keys(file.titles);
    return (
      <>
        <h2>Tytuły na czacie</h2>
        <p className="muted small">
          Tytuł gracz dostaje nagrodą „Tytuł” w zadaniu. Na czacie pokazuje go plugin Rang (jeśli jest zainstalowany).
        </p>
        {ids.length === 0 && <p className="muted small">Brak tytułów.</p>}
        {ids.map((id) => (
          <div key={id} className="mc-message-row">
            <span className="muted small" style={{ minWidth: "8rem" }}>
              {id}
            </span>
            <MinecraftTextInput value={file.titles[id]} onChange={(v) => setFile({ ...file, titles: { ...file.titles, [id]: v } })} placeholder="&7[Tytuł] " />
            <button
              type="button"
              onClick={() => {
                const t = { ...file.titles };
                delete t[id];
                setFile({ ...file, titles: t });
              }}
            >
              Usuń
            </button>
          </div>
        ))}
        <button type="button" onClick={newTitle}>
          + Nowy tytuł
        </button>
      </>
    );
  }

  function renderLook() {
    const s = file.settings;
    const setS = (patch: Partial<QuestSettings>) => setFile({ ...file, settings: { ...s, ...patch } });
    const pick = (label: string, value: ItemRef, onChange: (r: ItemRef) => void) => (
      <div key={label}>
        <div className="ci-section-title">{label}</div>
        <ItemRefPicker value={value} onChange={onChange} materials={allMaterials} customIds={customIds} />
      </div>
    );
    return (
      <>
        <h2>Wygląd i zachowanie</h2>
        <Fold title="Ikonki zadań i kategorii" open>
          {pick("Zadanie do zrobienia", s.icons.available, (r) => setS({ icons: { ...s.icons, available: r } }))}
          {pick("Zadanie zrobione", s.icons.completed, (r) => setS({ icons: { ...s.icons, completed: r } }))}
          {pick("Zadanie zablokowane", s.icons.locked, (r) => setS({ icons: { ...s.icons, locked: r } }))}
          {pick("Kategoria zablokowana", s.icons.categoryLocked, (r) => setS({ icons: { ...s.icons, categoryLocked: r } }))}
          {pick("Kategoria bez zadań", s.icons.categoryEmpty, (r) => setS({ icons: { ...s.icons, categoryEmpty: r } }))}
        </Fold>
        <Fold title="Przyciski i tło">
          {pick("Powrót", s.buttons.back, (r) => setS({ buttons: { ...s.buttons, back: r } }))}
          {pick("Poprzednia strona", s.buttons.prev, (r) => setS({ buttons: { ...s.buttons, prev: r } }))}
          {pick("Następna strona", s.buttons.next, (r) => setS({ buttons: { ...s.buttons, next: r } }))}
          {pick("Tło (wypełniacz)", s.filler, (r) => setS({ filler: r }))}
        </Fold>
        <Fold title="Zachowanie">
          <label className="checkbox">
            <input type="checkbox" checked={s.joinReminder} onChange={(e) => setS({ joinReminder: e.target.checked })} />
            Pasek z przypomnieniem po wejściu na serwer (gdy w Głównej Ścieżce czeka zadanie)
          </label>
          <label>
            Dźwięk po pierwszym zadaniu Głównej Ścieżki (puste = bez dźwięku)
            <input value={s.welcomeSound} onChange={(e) => setS({ welcomeSound: e.target.value })} placeholder="np. minecraft:ui.toast.challenge_complete" />
          </label>
          <p className="muted small">Teksty w menu (np. „Kliknij, aby zdać”) są w plikach językowych pluginu: plugins/MainpluginsQuests/lang/</p>
        </Fold>
      </>
    );
  }

  // ---- Usuwanie ----

  function confirmRow(question: string, onYes: () => void) {
    return (
      <div className="ci-cat-row ci-cat-confirm">
        <span title={question}>{question}</span>
        <button
          type="button"
          className="ci-danger"
          onClick={() => {
            onYes();
            setTrashConfirm(null);
          }}
        >
          Tak
        </button>
        <button type="button" onClick={() => setTrashConfirm(null)}>
          Nie
        </button>
      </div>
    );
  }

  function trashButton(id: string, title: string) {
    return (
      <button type="button" className="ci-trash" title={title} onClick={() => setTrashConfirm(id)}>
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    );
  }

  function deleteAction(): { label: string; question: string; run: () => void } | null {
    if (category && view?.kind === "category" && view.quest === "settings") {
      const c = category;
      return { label: "Usuń kategorię", question: `Usunąć kategorię ${c.id} razem z zadaniami?`, run: () => doRemoveCategory(c.id) };
    }
    if (category && view?.kind === "category" && typeof view.quest === "number" && category.quests[view.quest]) {
      const c = category;
      const i = view.quest;
      return { label: "Usuń zadanie", question: `Na pewno usunąć zadanie #${c.quests[i].id}?`, run: () => doRemoveQuest(c, i) };
    }
    return null;
  }
  const del = deleteAction();

  const iconOf = (r: ItemRef) => (r.item ? <MaterialIcon material={r.item} iconPackDir={iconPackDir} /> : <span className="ci-badge">custom</span>);

  const generalButton = (kind: "menu" | "titles" | "look", label: string) => (
    <button type="button" className={`ci-cat${view?.kind === kind ? " active" : ""}`} onClick={() => setView({ kind })}>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="page">
      <Link to="/tools" className="back-link">
        ← Twoje pluginy
      </Link>
      <h1>Questy</h1>
      <p className="muted">
        Kategorie i zadania: co gracz musi zrobić (przynieść przedmioty, zapłacić, pokazać przedmiot albo nic) i co za to dostaje.
      </p>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setShowCommands(true)} disabled={!profileId}>
          <Terminal size={14} strokeWidth={1.75} /> Komendy
        </button>
        <select value="" onChange={(e) => loadTemplate(e.target.value)} disabled={!profileId} title="Gotowe zestawy questów">
          <option value="">Wczytaj szablon...</option>
          {QUEST_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        {notSent && !unsaved && <span className="muted small">zapisane, jeszcze niewysłane</span>}
        <button
          type="button"
          onClick={() => {
            setFile(serverFile);
            setSaved(serverFile);
          }}
          disabled={!unsaved && !notSent}
        >
          ↶ Cofnij do stanu z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || (!unsaved && !notSent) || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>
      {status && <p className="status">{status}</p>}
      {showCommands && <QuestCommandsModal file={file} onClose={() => setShowCommands(false)} />}

      <div className="ci-layout ci-layout-crates ci-layout-quests">
        <aside className="card ci-cats">
          <div className="ci-section-title">Kategorie</div>
          {file.categories.map((c) =>
            trashConfirm === `cat:${c.id}` ? (
              <div key={c.id}>{confirmRow(`Usunąć kategorię ${c.id}?`, () => doRemoveCategory(c.id))}</div>
            ) : (
              <div key={c.id} className="ci-cat-row">
                <button
                  type="button"
                  className={`ci-cat${view?.kind === "category" && view.id === c.id ? " active" : ""}`}
                  onClick={() => setView({ kind: "category", id: c.id, quest: "settings" })}
                >
                  <span className="ci-item-name">
                    <MinecraftTextPreview text={c.name} emptyLabel={c.id} />
                  </span>
                  <span className="ci-prize-count" title={`${c.quests.length} zadań`}>
                    <ScrollText size={12} strokeWidth={2} /> {c.quests.length}
                  </span>
                </button>
                {trashButton(`cat:${c.id}`, `Usuń kategorię ${c.id}`)}
              </div>
            )
          )}
          <button type="button" onClick={newCategory} disabled={!profileId}>
            + Nowa kategoria
          </button>
          <div className="ci-section-title" style={{ marginTop: "1rem" }}>
            Ogólne
          </div>
          {generalButton("menu", "Menu główne")}
          {generalButton("titles", "Tytuły na czacie")}
          {generalButton("look", "Wygląd i zachowanie")}
        </aside>

        <section className="card ci-list">
          {view?.kind === "category" && category && (
            <>
              <button
                type="button"
                className={`ci-item${view.quest === "settings" ? " active" : ""}`}
                onClick={() => setView({ ...view, quest: "settings" })}
              >
                {iconOf(category.icon)}
                {/* Jak ikonka kategorii w grze: złota pogrubiona nazwa, szary opis. */}
                <span className="ci-item-text" title="Ustawienia kategorii: nazwa, zasady, wygląd strony">
                  <span className="ci-item-name">
                    <MinecraftTextPreview text={`&6&l${category.name}`} emptyLabel={category.id} />
                  </span>
                  {category.description.trim() !== "" && (
                    <span className="small">
                      <MinecraftTextPreview text={`&7${category.description}`} />
                    </span>
                  )}
                </span>
              </button>
              <div className="ci-group">Zadania ({category.quests.length})</div>
              {category.quests.map((q, i) =>
                trashConfirm === `quest:${category.id}:${i}` ? (
                  <div key={`${q.id}-${i}`}>{confirmRow(`Usunąć zadanie #${q.id}?`, () => doRemoveQuest(category, i))}</div>
                ) : (
                  <div key={`${q.id}-${i}`} className="ci-cat-row">
                    <button type="button" className={`ci-item${view.quest === i ? " active" : ""}`} onClick={() => setView({ ...view, quest: i })}>
                      <span className="ci-badge">#{q.id}</span>
                      <span className="ci-item-text">
                        <span className="ci-item-name">
                          <MinecraftTextPreview text={q.title} emptyLabel="(bez tytułu)" />
                        </span>
                        <span className="ci-badges">
                          <span className="ci-badge">{REQUIREMENT_TYPES.find((t) => t.type === q.requirement.type)?.label.split(" (")[0]}</span>
                          {q.rewards.length === 0 && <span className="ci-badge warn">brak nagród</span>}
                        </span>
                      </span>
                    </button>
                    {trashButton(`quest:${category.id}:${i}`, `Usuń zadanie #${q.id}`)}
                  </div>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  updateCategory(category.id, { quests: [...category.quests, emptyQuest(nextQuestId(category))] });
                  setView({ ...view, quest: category.quests.length });
                }}
              >
                + Dodaj zadanie
              </button>
            </>
          )}
          {view && view.kind !== "category" && (
            <p className="muted small">Ustawienia wspólne dla wszystkich kategorii - edytujesz je po prawej.</p>
          )}
          {!view && <p className="muted">{profileId ? "Brak kategorii - dodaj pierwszą albo wczytaj szablon." : "Wybierz serwer, żeby wczytać questy."}</p>}
        </section>

        <section className="card form ci-editor">
          {category && view?.kind === "category" && view.quest === "settings" && renderCategorySettings(category)}
          {category && view?.kind === "category" && typeof view.quest === "number" && category.quests[view.quest] && renderQuest(category, view.quest)}
          {view?.kind === "menu" && (
            <>
              <h2>Menu główne (/quests)</h2>
              {layoutEditor(file.mainMenu, (l) => setFile({ ...file, mainMenu: l }), "menu")}
            </>
          )}
          {view?.kind === "titles" && renderTitles()}
          {view?.kind === "look" && renderLook()}
          {(view || unsaved) && (
            <div className="ci-actions">
              {confirmDelete && del ? (
                <>
                  <span className="ci-actions-question">{del.question}</span>
                  <button
                    type="button"
                    className="ci-danger"
                    onClick={() => {
                      del.run();
                      setConfirmDelete(false);
                    }}
                  >
                    Tak, usuń
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>
                    Anuluj
                  </button>
                </>
              ) : (
                <>
                  <button className="ci-publish" type="button" onClick={save} disabled={!unsaved}>
                    <Save size={16} strokeWidth={1.75} /> Zapisz
                  </button>
                  <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
                    Cofnij niezapisane
                  </button>
                  {del && (
                    <button type="button" onClick={() => setConfirmDelete(true)}>
                      {del.label}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {unsaved && !confirmDelete && <p className="muted small">masz niezapisane zmiany</p>}
        </section>
      </div>
    </div>
  );
}
