import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MaterialField from "../components/MaterialField";
import PresetBar from "../components/PresetBar";
import SlotGrid from "../components/SlotGrid";
import ToolbarMore from "../components/ToolbarMore";
import type { SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpReadFile, sftpWriteFile } from "../lib/api";
import { loadItemCatalog } from "../lib/itemCatalogRemote";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { conventionalRoleIcon, getVanillaCacheDir } from "../lib/materialIcons";
import { parseQuestsContent, serializeQuestsContent } from "../lib/questsYaml";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import type { QuestCategory, QuestEntry, QuestsContent, Requirement, RewardEntry } from "../lib/types";
import { useProfiles } from "../state/ProfilesContext";
import { showPrompt } from "../components/PromptModal";

const LAST_USED_KEY = "quests";
const QUEST_SLOTS_PER_PAGE = 29;

const REQUIREMENT_TYPES: Array<{ value: Requirement["type"]; label: string }> = [
  { value: "ITEM", label: "Przedmioty" },
  { value: "FREE", label: "Za darmo (klik = zdaj)" },
  { value: "MONEY", label: "Monety" },
  { value: "TOOL_POSSESS", label: "Posiadanie narzędzia" },
  { value: "TOOL_LEVEL", label: "Poziom narzędzia" },
  { value: "MARKET_OFFER", label: "Oferta na Targu (stan bieżący)" },
  { value: "BUY_ITEM", label: "Kup w sklepie (licznik)" },
  { value: "SELL_ITEM", label: "Sprzedaj w sklepie (licznik)" },
  { value: "MARKET_LISTINGS", label: "Wystaw na Targu N razy (licznik)" },
];

const REWARD_TYPES: Array<{ value: RewardEntry["type"]; label: string }> = [
  { value: "ITEM", label: "Przedmiot" },
  { value: "CUSTOM_ITEM", label: "Custom item" },
  { value: "MONEY", label: "Monety" },
  { value: "CRATE", label: "Skrzynia" },
  { value: "TOOL", label: "Ewoluujące narzędzie" },
  { value: "TITLE", label: "Tytuł na czacie" },
];

const TOOL_LEVEL_TOOLS = ["PICKAXE", "AXE", "SWORD"];
const TOOL_REWARD_TOOLS = ["PICKAXE", "AXE", "HOE", "SWORD", "SHOVEL"];

const EMPTY_CONTENT: QuestsContent = { mainMenuLayout: [], categoryOrder: [], titles: {}, categories: {} };

function defaultRequirement(type: Requirement["type"]): Requirement {
  switch (type) {
    case "ITEM":
      return { type: "ITEM", materials: [{ material: "STONE", amount: 1 }] };
    case "MONEY":
      return { type: "MONEY", amount: 100 };
    case "TOOL_POSSESS":
      return { type: "TOOL_POSSESS", material: "STONE_HOE" };
    case "TOOL_LEVEL":
      return { type: "TOOL_LEVEL", tool: "PICKAXE", level: 1 };
    case "MARKET_OFFER":
      return { type: "MARKET_OFFER" };
    case "BUY_ITEM":
      return { type: "BUY_ITEM", material: { material: "STONE", amount: 1 } };
    case "SELL_ITEM":
      return { type: "SELL_ITEM", material: { material: "STONE", amount: 1 } };
    case "MARKET_LISTINGS":
      return { type: "MARKET_LISTINGS", amount: 1 };
    default:
      return { type: "FREE" };
  }
}

function defaultReward(type: RewardEntry["type"]): RewardEntry {
  switch (type) {
    case "CUSTOM_ITEM":
      return { type: "CUSTOM_ITEM", id: "", amount: 1 };
    case "MONEY":
      return { type: "MONEY", amount: 100 };
    case "CRATE":
      return { type: "CRATE", tier: 1 };
    case "TOOL":
      return { type: "TOOL", tool: "PICKAXE" };
    case "TITLE":
      return { type: "TITLE", id: "" };
    default:
      return { type: "ITEM", material: "STONE", amount: 1 };
  }
}

function emptyQuest(nextId: number): QuestEntry {
  return { id: nextId, title: "", description: [], requirement: { type: "FREE" }, rewards: [], rewardLabel: undefined };
}

export default function QuestsPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [remotePath, setRemotePath] = useState("");
  const [content, setContent] = useState<QuestsContent>(EMPTY_CONTENT);
  const [serverContent, setServerContent] = useState<QuestsContent>(EMPTY_CONTENT);
  const [customItemIds, setCustomItemIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<string>("MENU");
  const [page, setPage] = useState(0);
  const [editingQuest, setEditingQuest] = useState<QuestEntry | null>(null);
  const [pickedUpCategorySlot, setPickedUpCategorySlot] = useState<number | null>(null);
  const [pickedUpQuestIndex, setPickedUpQuestIndex] = useState<number | null>(null);
  const [quickEditCategoryId, setQuickEditCategoryId] = useState<string | null>(null);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [addRole, setAddRole] = useState<"QUEST_SLOT" | "NAV_PREV" | "NAV_BACK" | "NAV_NEXT">("QUEST_SLOT");
  const [reloadCommand, setReloadCommand] = useState("@reloadquesty");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoLoadedRef = useRef(false);

  function selectProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const path = `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsQuests/quests-content.yml`;
    setRemotePath(path);
    setLastUsed(LAST_USED_KEY, { profileId: id, remotePath: path });
    loadPresets(id);
    load(id, path);
    // CUSTOM_ITEM reward/requirement id-y - dwa NIEZALEŻNE rejestry, ale z perspektywy
    // questa to jedna wspólna lista (QuestManager#stworzCustomItem szuka w obu po kolei).
    const evolvingToolsPath = `${p.remote_plugins_path.replace(/\/+$/, "")}/MainpluginsTools/ewoluujace-narzedzia.yml`;
    Promise.allSettled([loadItemCatalog(id, p.remote_plugins_path), sftpReadFile(id, evolvingToolsPath)]).then(([catalog, evolvingTools]) => {
      const ids: string[] = [];
      if (catalog.status === "fulfilled") {
        ids.push(...catalog.value.items.map((it) => it.id));
      }
      if (evolvingTools.status === "fulfilled") {
        const raw = (yaml.load(evolvingTools.value) ?? {}) as any;
        ids.push(...Object.keys(raw.narzedzia ?? {}));
      }
      setCustomItemIds(ids);
    });
  }

  async function load(profileIdOverride?: string, remotePathOverride?: string) {
    const pid = profileIdOverride ?? profileId;
    const path = remotePathOverride ?? remotePath;
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await sftpReadFile(pid, path);
      const parsed = parseQuestsContent(text);
      setContent(parsed);
      setServerContent(parsed);
      setActiveView("MENU");
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  const { iconPackDir, allMaterials, packProjects, selectIconPack, refreshVanillaBase: refreshVanillaBaseRaw } =
    useIconPack(setStatus);
  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<QuestsContent>("quests");

  async function refreshVanillaBase() {
    setBusy(true);
    try {
      await refreshVanillaBaseRaw();
    } finally {
      setBusy(false);
    }
  }

  // Serwer aktywny GLOBALNIE (pasek boczny) ma pierwszeństwo - dopiero gdy nic tam
  // jeszcze nie wybrano, sięgamy do starego zapisu specyficznego dla tej strony.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (profileId && profiles.some((p) => p.id === profileId)) {
      selectProfile(profileId);
      return;
    }
    const last = getLastUsed(LAST_USED_KEY);
    if (last && profiles.some((p) => p.id === last.profileId)) {
      selectProfile(last.profileId);
      if (last.remotePath) {
        setRemotePath(last.remotePath);
        load(last.profileId, last.remotePath);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  // Edits only touch local state - nothing reaches the server until
  // "Wyślij na serwer" is clicked, and "Cofnij do stanu z serwera" throws
  // away local changes and goes back to serverContent (set on load and
  // after a successful publish).
  const dirty = content !== serverContent;
  useDirtyTracking(dirty);

  function save(next: QuestsContent) {
    setContent(next);
  }

  // Writing the file over SFTP does NOT make the running plugin pick it up -
  // it still has its old config cached in memory until told to reload, so
  // publish also sends the RCON reload command right after a successful
  // write. Otherwise "Wyślij na serwer" would silently do nothing visible
  // in-game until someone separately remembered to click "Wyślij RCON".
  async function publish() {
    if (!profileId || !remotePath) return;
    setBusy(true);
    setStatus(null);
    try {
      await sftpWriteFile(profileId, remotePath, serializeQuestsContent(content));
      setServerContent(content);
      let statusMsg = "Wysłano na serwer.";
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
    setEditingQuest(null);
    setQuickEditCategoryId(null);
    setPickedUpCategorySlot(null);
    setPickedUpQuestIndex(null);
    setStatus("Przywrócono stan z serwera — lokalne zmiany odrzucone.");
  }

  // Local presets are a separate, opt-in safety net on top of the draft -
  // saving one never touches the server. Loading one only replaces the local
  // draft; it still has to go through "Wyślij na serwer" to go live - handy
  // if something got overwritten on the server and you want back what you had.
  async function saveCurrentPresetAs() {
    if (!profileId) return;
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

  function moveCategoryOrder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= content.categoryOrder.length) return;
    const next = [...content.categoryOrder];
    [next[index], next[target]] = [next[target], next[index]];
    save({ ...content, categoryOrder: next });
  }

  function updateCategory(id: string, patch: Partial<QuestCategory>) {
    save({ ...content, categories: { ...content.categories, [id]: { ...content.categories[id], ...patch } } });
  }

  // Picking up a category slot and clicking another swaps their grid
  // positions (which categoryOrder entry a slot represents travels with the
  // array element, so this correctly relocates "which category shows
  // where", not just an anonymous slot).
  function pickUpOrMoveCategorySlot(slot: number) {
    if (pickedUpCategorySlot === null) {
      setPickedUpCategorySlot(slot);
      return;
    }
    if (pickedUpCategorySlot === slot) {
      setPickedUpCategorySlot(null);
      return;
    }
    moveOrSwapCategorySlot(pickedUpCategorySlot, slot);
    setPickedUpCategorySlot(null);
  }

  function moveOrSwapCategorySlot(fromSlot: number, toSlot: number) {
    const nextLayout = content.mainMenuLayout.map((e) => {
      if (e.slot === fromSlot) return { ...e, slot: toSlot };
      if (e.slot === toSlot) return { ...e, slot: fromSlot };
      return e;
    });
    save({ ...content, mainMenuLayout: nextLayout });
  }

  function addCategorySlotAt(slot: number) {
    save({ ...content, mainMenuLayout: [...content.mainMenuLayout, { slot, role: "CATEGORY_SLOT" }] });
  }

  // Same reasoning as the shop's item swap: clicking a picked-up quest onto
  // another swaps the two (not "insert and shift everyone else along"),
  // matching how dragging works in a real MC inventory.
  function pickUpOrSwapQuest(targetIndex: number) {
    if (pickedUpQuestIndex === null) {
      setPickedUpQuestIndex(targetIndex);
      return;
    }
    if (pickedUpQuestIndex === targetIndex) {
      setPickedUpQuestIndex(null);
      return;
    }
    swapQuestsInCategory(activeView, pickedUpQuestIndex, targetIndex);
    setPickedUpQuestIndex(null);
  }

  function swapQuestsInCategory(categoryId: string, a: number, b: number) {
    const category = content.categories[categoryId];
    if (!category) return;
    const next = [...category.quests];
    [next[a], next[b]] = [next[b], next[a]];
    save({ ...content, categories: { ...content.categories, [categoryId]: { ...category, quests: next } } });
  }

  function dropQuestAtEnd() {
    if (pickedUpQuestIndex === null) return;
    const category = content.categories[activeView];
    if (!category) return;
    const next = [...category.quests];
    const [moved] = next.splice(pickedUpQuestIndex, 1);
    next.push(moved);
    save({ ...content, categories: { ...content.categories, [activeView]: { ...category, quests: next } } });
    setPickedUpQuestIndex(null);
  }

  // Layout is one shared template per category (used by every page of that
  // category), so these edit activeCategory.pageLayout directly regardless
  // of which page is currently shown.
  function moveLayoutSlot(fromSlot: number, toSlot: number) {
    const category = content.categories[activeView];
    if (!category) return;
    const next = category.pageLayout.map((e) => (e.slot === fromSlot ? { ...e, slot: toSlot } : e));
    updateCategory(activeView, { pageLayout: next });
  }

  function addLayoutSlot(slot: number) {
    const category = content.categories[activeView];
    if (!category) return;
    updateCategory(activeView, { pageLayout: [...category.pageLayout, { slot, role: addRole }] });
  }

  function removeLayoutSlot(slot: number) {
    const category = content.categories[activeView];
    if (!category) return;
    updateCategory(activeView, { pageLayout: category.pageLayout.filter((e) => e.slot !== slot) });
  }

  // Verified against the real plugin (QuestManager.otworzKategorie): quests
  // fill QUEST_SLOTs in pageLayout's LIST ORDER, not by ascending slot
  // number - the Nth quest goes into the Nth QUEST_SLOT the loop encounters.
  // moveLayoutSlot only ever changes an entry's .slot field in place (via
  // .map), never its array position, so repeatedly dragging slots around in
  // layout-edit mode can leave the array order scrambled relative to the
  // slots' visual/numeric order - quests then appear to land in seemingly
  // arbitrary positions even though the assignment is 100% consistent with
  // what the live server shows. This re-sorts the array by ascending slot
  // number so array order matches visual order again - it does NOT touch
  // slot numbers or add/remove anything, but it DOES change which quest ends
  // up in which slot (the Nth quest now goes to the Nth-lowest-numbered
  // QUEST_SLOT), so it's an explicit, undo-able action rather than automatic.
  function sortLayoutBySlotNumber() {
    const category = content.categories[activeView];
    if (!category) return;
    const next = [...category.pageLayout].sort((a, b) => a.slot - b.slot);
    updateCategory(activeView, { pageLayout: next });
  }

  function openQuestEditor(categoryId: string, quest: QuestEntry | null) {
    setActiveView(categoryId);
    setEditingQuest(quest ?? emptyQuest(nextQuestId(categoryId)));
  }

  function nextQuestId(categoryId: string): number {
    const quests = content.categories[categoryId]?.quests ?? [];
    return quests.length > 0 ? Math.max(...quests.map((q) => q.id)) + 1 : 1;
  }

  function saveEditingQuest() {
    if (!editingQuest || activeView === "MENU") return;
    const category = content.categories[activeView];
    if (!category) return;
    if (!editingQuest.title.trim()) {
      setStatus("Podaj tytuł questu.");
      return;
    }
    const existingIndex = category.quests.findIndex((q) => q.id === editingQuest.id);
    const nextQuests = [...category.quests];
    if (existingIndex >= 0) nextQuests[existingIndex] = editingQuest;
    else nextQuests.push(editingQuest);
    save({ ...content, categories: { ...content.categories, [activeView]: { ...category, quests: nextQuests } } });
    setEditingQuest(null);
  }

  function deleteQuest(categoryId: string, questId: number) {
    const category = content.categories[categoryId];
    if (!category) return;
    const nextQuests = category.quests.filter((q) => q.id !== questId);
    save({ ...content, categories: { ...content.categories, [categoryId]: { ...category, quests: nextQuests } } });
    if (editingQuest?.id === questId) setEditingQuest(null);
  }

  // ---- slot grid content builders ----

  // A quest has no icon field of its own - the closest real, meaningful icon
  // is its first ITEM reward (what you'll actually get), falling back to a
  // generic book (standard "quest" convention) when there's no item reward
  // to show (money/crate/title-only quests).
  function questIconMaterial(quest: QuestEntry): string {
    const itemReward = quest.rewards.find((r): r is Extract<RewardEntry, { type: "ITEM" }> => r.type === "ITEM");
    return itemReward?.material ?? "BOOK";
  }

  // Every square is a valid target, no move-mode checkbox needed: an
  // occupied category slot navigates on plain click, or - once something is
  // picked up via its move-icon handle - clicking any other square swaps/moves it
  // there. Empty squares always show "+" to add a new CATEGORY_SLOT (or
  // accept a drop, once something's picked up).
  function mainMenuGridContent(): Record<number, SlotContent> {
    const layoutBySlot = new Map(content.mainMenuLayout.map((e) => [e.slot, e]));
    let categoryIndex = 0;
    const categoryIndexByLayoutSlot = new Map<number, number>();
    for (const entry of content.mainMenuLayout) {
      if (entry.role === "CATEGORY_SLOT") {
        categoryIndexByLayoutSlot.set(entry.slot, categoryIndex);
        categoryIndex++;
      }
    }
    const out: Record<number, SlotContent> = {};
    for (let i = 0; i < 54; i++) {
      const entry = layoutBySlot.get(i);
      if (!entry) {
        out[i] = {
          label: pickedUpCategorySlot !== null ? "" : "+",
          kind: "filler",
          dim: true,
          onClick: () => {
            if (pickedUpCategorySlot !== null) {
              moveOrSwapCategorySlot(pickedUpCategorySlot, i);
              setPickedUpCategorySlot(null);
            } else {
              addCategorySlotAt(i);
            }
          },
        };
        continue;
      }
      if (entry.role === "CATEGORY_SLOT") {
        const catId = content.categoryOrder[categoryIndexByLayoutSlot.get(i) ?? -1];
        const cat = catId ? content.categories[catId] : undefined;
        out[i] = {
          label: cat?.displayName ?? catId ?? "(brak kategorii)",
          sublabel: cat?.quests.length ? `${cat.quests.length}` : "",
          kind: "category",
          material: cat?.icon,
          highlighted: pickedUpCategorySlot === i,
          onClick: pickedUpCategorySlot !== null ? () => pickUpOrMoveCategorySlot(i) : catId ? () => setActiveView(catId) : undefined,
          onContextMenu: catId ? () => setQuickEditCategoryId(catId) : undefined,
          onPickUp: () => pickUpOrMoveCategorySlot(i),
          onEdit: catId ? () => setQuickEditCategoryId(catId) : undefined,
        };
      } else {
        out[i] = { label: "", kind: "filler" };
      }
    }
    return out;
  }

  // Same idea one level deeper: plain click on a quest opens it for editing;
  // its move-icon handle picks it up, and clicking any other square then
  // swaps/moves it - every empty square works, not just the very next one.
  function categoryGridContent(category: QuestCategory): Record<number, SlotContent> {
    const out: Record<number, SlotContent> = {};
    let questSlotIndex = 0;
    for (const entry of category.pageLayout) {
      if (entry.role === "QUEST_SLOT") {
        const globalIndex = page * QUEST_SLOTS_PER_PAGE + questSlotIndex;
        questSlotIndex++;
        const quest = category.quests[globalIndex];
        if (quest) {
          out[entry.slot] = {
            label: quest.title,
            sublabel: `#${quest.id}`,
            kind: "quest",
            material: questIconMaterial(quest),
            highlighted: pickedUpQuestIndex === globalIndex,
            onClick: pickedUpQuestIndex !== null ? () => pickUpOrSwapQuest(globalIndex) : () => openQuestEditor(activeView, quest),
            onPickUp: () => pickUpOrSwapQuest(globalIndex),
          };
        } else {
          out[entry.slot] = {
            // kind stays "quest" (not "filler") even though it's empty - this
            // slot IS a QUEST_SLOT in the layout, and quest slots are often
            // scattered non-contiguously to mirror the real in-game path
            // ("wężyk"); forcing kind to "filler" here would drop this one
            // slot's accent line and visibly break that path. `dim` handles
            // quieting the "+" text instead, independent of kind.
            //
            // Every empty QUEST_SLOT shows "+" and adds - not just the one
            // that happens to be next in array order. Quests are a dense
            // array server-side (verified against QuestManager.java: they
            // always pack into QUEST_SLOTs strictly in pageLayout order, no
            // holes), so there's no such thing as "add AT this specific
            // slot" - wherever you click, the new quest lands at the same
            // next-available array position. Restricting the "+" to only
            // that one slot just meant it could end up buried in the middle
            // of a scattered layout instead of being reachable from any
            // empty cell.
            label: pickedUpQuestIndex !== null ? "" : "+",
            kind: "quest",
            dim: true,
            onClick: () => {
              if (pickedUpQuestIndex !== null) dropQuestAtEnd();
              else openQuestEditor(activeView, null);
            },
          };
        }
      } else if (entry.role === "NAV_PREV" || entry.role === "NAV_BACK" || entry.role === "NAV_NEXT") {
        out[entry.slot] = {
          label: entry.role === "NAV_PREV" ? "◀ Poprz." : entry.role === "NAV_NEXT" ? "Nast. ▶" : "↩ Powrót",
          kind: "nav",
          material: conventionalRoleIcon(entry.role),
        };
      } else {
        out[entry.slot] = { label: "", kind: "filler" };
      }
    }
    return out;
  }

  const activeCategory = activeView !== "MENU" ? content.categories[activeView] : null;
  const totalPages = activeCategory ? Math.max(1, Math.ceil(activeCategory.quests.length / QUEST_SLOTS_PER_PAGE)) : 1;

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Questy</h1>
      <p className="muted">
        Pełny, klikalny podgląd menu questów mainplugins-quests — dokładnie w takim układzie jak w grze. Kliknij slot,
        żeby edytować quest lub przejść do kategorii.
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
        <button onClick={publish} disabled={!profileId || !dirty || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
        <button type="button" onClick={revertToServer} disabled={!dirty}>
          ↶ Cofnij do stanu z serwera
        </button>
        {dirty && <span className="muted small">masz niezapisane zmiany</span>}
      </div>

      <ToolbarMore>
        <div className="row">
          <button onClick={() => load()} disabled={!profileId || busy}>
            Wczytaj
          </button>
          <span className="muted small">
            Źródło ikonek:{" "}
            {iconPackDir === ""
              ? "brak (pobieranie bazy Vanilla w toku...)"
              : (packProjects.find((p) => p.local_path === iconPackDir)?.name ?? "Baza Vanilla (automatyczna)")}
            {iconPackDir && ` — ${allMaterials.length} materiałów dostępnych z ikonkami`}
          </span>
          {packProjects.length > 0 && (
            <select
              value={packProjects.some((p) => p.local_path === iconPackDir) ? iconPackDir : ""}
              onChange={(e) => {
                if (e.target.value) selectIconPack(e.target.value);
                else getVanillaCacheDir().then(selectIconPack);
              }}
            >
              <option value="">(użyj automatycznej bazy Vanilla)</option>
              {packProjects.map((p) => (
                <option key={p.id} value={p.local_path}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={refreshVanillaBase} disabled={busy}>
            Odśwież bazę Vanilla
          </button>
        </div>
        <PresetBar
          presets={presetList}
          selectedName={selectedPresetName}
          onSelectName={setSelectedPresetName}
          onSaveAs={saveCurrentPresetAs}
          onLoad={loadPresetIntoDraft}
          onDelete={(name) => deletePreset(profileId, name)}
          disabled={!profileId}
        />
      </ToolbarMore>

      {content.categoryOrder.length > 0 && (
        <>
          <div className="row subtabs">
            <button type="button" className={activeView === "MENU" ? "active" : ""} onClick={() => setActiveView("MENU")}>
              Menu główne
            </button>
            {content.categoryOrder.map((id) => (
              <button
                key={id}
                type="button"
                className={activeView === id ? "active" : ""}
                onClick={() => {
                  setActiveView(id);
                  setPage(0);
                  setEditingQuest(null);
                  setPickedUpQuestIndex(null);
                }}
              >
                {content.categories[id]?.displayName ?? id}
              </button>
            ))}
          </div>

          {activeView === "MENU" && (
            <div className="two-col two-col-grid-wide">
              <div className="card">
                <h2>Menu główne (klikalne)</h2>
                <p className="muted small">
                  Kliknij kategorię, żeby wejść do jej strony, ikona przesunięcia w rogu — żeby ją przenieść, ikona ołówka (albo prawy klik) —
                  szybka edycja nazwy/ikony/opisu. "+" na pustym polu dodaje nową kategorię.
                </p>
                {quickEditCategoryId && (
                  <QuickEditCategory
                    categoryId={quickEditCategoryId}
                    category={content.categories[quickEditCategoryId]}
                    iconPackDir={iconPackDir}
                    onChange={(patch) => updateCategory(quickEditCategoryId, patch)}
                    onClose={() => setQuickEditCategoryId(null)}
                  />
                )}
                <SlotGrid content={mainMenuGridContent()} iconPackDir={iconPackDir} />
              </div>
              <div className="card">
                <h2>Kolejność kategorii</h2>
                <div className="card-grid">
                  {content.categoryOrder.map((id, index) => (
                    <div key={id} className="card">
                      <div className="card-title">{content.categories[id]?.displayName ?? id}</div>
                      <div className="muted small">{content.categories[id]?.quests.length ?? 0} questów</div>
                      <div className="row">
                        <button onClick={() => moveCategoryOrder(index, -1)} disabled={index === 0}>
                          ↑
                        </button>
                        <button onClick={() => moveCategoryOrder(index, 1)} disabled={index === content.categoryOrder.length - 1}>
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeCategory && (
            <div className="two-col two-col-grid-wide">
              <div className="card">
                <h2>{activeCategory.displayName}</h2>
                <div className="row">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    ◀ Strona
                  </button>
                  <span className="muted">
                    {page + 1} / {totalPages}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                    Strona ▶
                  </button>
                </div>
                <div className="row">
                  <label className="checkbox">
                    <input type="checkbox" checked={layoutEditMode} onChange={(e) => setLayoutEditMode(e.target.checked)} />
                    Edytuj układ (przeciągaj / dodawaj / usuwaj sloty)
                  </label>
                  {layoutEditMode && (
                    <select value={addRole} onChange={(e) => setAddRole(e.target.value as typeof addRole)}>
                      <option value="QUEST_SLOT">Nowy: slot questu</option>
                      <option value="NAV_PREV">Nowy: nawigacja "poprzednia strona"</option>
                      <option value="NAV_BACK">Nowy: nawigacja "powrót"</option>
                      <option value="NAV_NEXT">Nowy: nawigacja "następna strona"</option>
                    </select>
                  )}
                </div>
                {layoutEditMode && (
                  <>
                    <p className="muted small">
                      Kliknij zajęty slot, żeby go "podnieść" (podświetli się na żółto), potem kliknij pusty slot, żeby
                      go tam przenieść. Kliknij pusty slot bez podnoszenia niczego, żeby dodać nowy (rola z listy
                      powyżej). × usuwa slot. Układ jest wspólny dla wszystkich stron tej kategorii.
                    </p>
                    <div className="row">
                      <button type="button" onClick={sortLayoutBySlotNumber}>
                        Uporządkuj kolejność questów wg numeru slotu
                      </button>
                      <span className="muted small">
                        Questy trafiają do slotów w kolejności zapisu w pliku, nie wg numeru slotu — po wielu
                        przeciągnięciach ta kolejność mogła się rozjechać (np. quest #10 ląduje w slocie z połowy
                        planszy zamiast od razu po #9). Ten przycisk NIE zmienia rozmieszczenia sloty na planszy,
                        tylko porządkuje, KTÓRY quest trafia do KTÓREGO slotu (od najmniejszego numeru w górę) — to
                        realnie przełoży się na inny układ questów w grze, więc sprawdź podgląd przed wysłaniem.
                      </span>
                    </div>
                  </>
                )}
                <SlotGrid
                  content={categoryGridContent(activeCategory)}
                  editable={layoutEditMode}
                  iconPackDir={iconPackDir}
                  onMoveSlot={moveLayoutSlot}
                  onAddSlot={addLayoutSlot}
                  onRemoveSlot={removeLayoutSlot}
                />

                <div className="card-title" style={{ marginTop: "1rem" }}>
                  Ustawienia kategorii
                </div>
                <label>
                  Nazwa
                  <input
                    value={activeCategory.displayName}
                    onChange={(e) => updateCategory(activeView, { displayName: e.target.value })}
                  />
                </label>
                <label>
                  Ikona (materiał)
                  <MaterialField
                    datalistId="materials"
                    iconPackDir={iconPackDir}
                    value={activeCategory.icon}
                    onChange={(v) => updateCategory(activeView, { icon: v })}
                  />
                </label>
                <label>
                  Opis
                  <input
                    value={activeCategory.description}
                    onChange={(e) => updateCategory(activeView, { description: e.target.value })}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={activeCategory.sequential}
                    onChange={(e) => updateCategory(activeView, { sequential: e.target.checked })}
                  />
                  Sekwencyjna (quest N+1 zablokowany do ukończenia N)
                </label>
              </div>

              <div className="card form">
                {editingQuest ? (
                  <>
                    <h2>{activeCategory.quests.some((q) => q.id === editingQuest.id) ? "Edytuj quest" : "Nowy quest"}</h2>
                    <label>
                      ID (stabilne, nie renumeruj istniejących)
                      <input
                        type="number"
                        value={editingQuest.id}
                        onChange={(e) => setEditingQuest({ ...editingQuest, id: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Tytuł
                      <input value={editingQuest.title} onChange={(e) => setEditingQuest({ ...editingQuest, title: e.target.value })} />
                    </label>
                    <fieldset>
                      <legend>Opis</legend>
                      {editingQuest.description.map((line, i) => (
                        <div key={i} className="row">
                          <input
                            value={line}
                            onChange={(e) => {
                              const next = [...editingQuest.description];
                              next[i] = e.target.value;
                              setEditingQuest({ ...editingQuest, description: next });
                            }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditingQuest({ ...editingQuest, description: editingQuest.description.filter((_, li) => li !== i) })
                            }
                          >
                            Usuń
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setEditingQuest({ ...editingQuest, description: [...editingQuest.description, ""] })}>
                        + Dodaj linijkę
                      </button>
                    </fieldset>

                    <fieldset>
                      <legend>Wymóg</legend>
                      <select
                        value={editingQuest.requirement.type}
                        onChange={(e) => setEditingQuest({ ...editingQuest, requirement: defaultRequirement(e.target.value as Requirement["type"]) })}
                      >
                        {REQUIREMENT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>

                      {editingQuest.requirement.type === "ITEM" && (
                        <div>
                          {editingQuest.requirement.materials.map((m, i) => (
                            <div key={i} className="row">
                              <MaterialField
                                datalistId="materials"
                                iconPackDir={iconPackDir}
                                value={m.material}
                                onChange={(v) => {
                                  const req = editingQuest.requirement as Extract<Requirement, { type: "ITEM" }>;
                                  const next = [...req.materials];
                                  next[i] = { ...next[i], material: v };
                                  setEditingQuest({ ...editingQuest, requirement: { type: "ITEM", materials: next } });
                                }}
                              />
                              <input
                                type="number"
                                style={{ width: 70 }}
                                value={m.amount}
                                onChange={(e) => {
                                  const req = editingQuest.requirement as Extract<Requirement, { type: "ITEM" }>;
                                  const next = [...req.materials];
                                  next[i] = { ...next[i], amount: Number(e.target.value) };
                                  setEditingQuest({ ...editingQuest, requirement: { type: "ITEM", materials: next } });
                                }}
                              />
                              <input
                                placeholder="custom-id (opcjonalnie)"
                                value={m.customId ?? ""}
                                onChange={(e) => {
                                  const req = editingQuest.requirement as Extract<Requirement, { type: "ITEM" }>;
                                  const next = [...req.materials];
                                  next[i] = { ...next[i], customId: e.target.value || undefined };
                                  setEditingQuest({ ...editingQuest, requirement: { type: "ITEM", materials: next } });
                                }}
                              />
                              <input
                                placeholder="nazwa wyświetlana (opcjonalnie)"
                                value={m.displayName ?? ""}
                                onChange={(e) => {
                                  const req = editingQuest.requirement as Extract<Requirement, { type: "ITEM" }>;
                                  const next = [...req.materials];
                                  next[i] = { ...next[i], displayName: e.target.value || undefined };
                                  setEditingQuest({ ...editingQuest, requirement: { type: "ITEM", materials: next } });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const req = editingQuest.requirement as Extract<Requirement, { type: "ITEM" }>;
                                  setEditingQuest({ ...editingQuest, requirement: { type: "ITEM", materials: req.materials.filter((_, mi) => mi !== i) } });
                                }}
                              >
                                Usuń
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const req = editingQuest.requirement as Extract<Requirement, { type: "ITEM" }>;
                              setEditingQuest({ ...editingQuest, requirement: { type: "ITEM", materials: [...req.materials, { material: "STONE", amount: 1 }] } });
                            }}
                          >
                            + Dodaj materiał
                          </button>
                        </div>
                      )}
                      {editingQuest.requirement.type === "MONEY" && (
                        <input
                          type="number"
                          value={editingQuest.requirement.amount}
                          onChange={(e) => setEditingQuest({ ...editingQuest, requirement: { type: "MONEY", amount: Number(e.target.value) } })}
                        />
                      )}
                      {editingQuest.requirement.type === "TOOL_POSSESS" && (
                        <MaterialField
                          datalistId="materials"
                          iconPackDir={iconPackDir}
                          value={editingQuest.requirement.material}
                          onChange={(v) => setEditingQuest({ ...editingQuest, requirement: { type: "TOOL_POSSESS", material: v } })}
                        />
                      )}
                      {editingQuest.requirement.type === "TOOL_LEVEL" && (
                        <div className="row">
                          <select
                            value={editingQuest.requirement.tool}
                            onChange={(e) =>
                              setEditingQuest({
                                ...editingQuest,
                                requirement: { type: "TOOL_LEVEL", tool: e.target.value as "PICKAXE" | "AXE" | "SWORD", level: (editingQuest.requirement as any).level },
                              })
                            }
                          >
                            {TOOL_LEVEL_TOOLS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={editingQuest.requirement.level}
                            onChange={(e) =>
                              setEditingQuest({
                                ...editingQuest,
                                requirement: { type: "TOOL_LEVEL", tool: (editingQuest.requirement as any).tool, level: Number(e.target.value) },
                              })
                            }
                          />
                        </div>
                      )}
                      {(editingQuest.requirement.type === "BUY_ITEM" || editingQuest.requirement.type === "SELL_ITEM") && (
                        <div className="row">
                          <MaterialField
                            datalistId="materials"
                            iconPackDir={iconPackDir}
                            value={editingQuest.requirement.material.material}
                            onChange={(v) => {
                              const req = editingQuest.requirement as Extract<Requirement, { type: "BUY_ITEM" | "SELL_ITEM" }>;
                              setEditingQuest({ ...editingQuest, requirement: { ...req, material: { ...req.material, material: v } } });
                            }}
                          />
                          <input
                            type="number"
                            style={{ width: 70 }}
                            value={editingQuest.requirement.material.amount}
                            onChange={(e) => {
                              const req = editingQuest.requirement as Extract<Requirement, { type: "BUY_ITEM" | "SELL_ITEM" }>;
                              setEditingQuest({ ...editingQuest, requirement: { ...req, material: { ...req.material, amount: Number(e.target.value) } } });
                            }}
                          />
                          <input
                            placeholder="custom-id (opcjonalnie)"
                            value={editingQuest.requirement.material.customId ?? ""}
                            onChange={(e) => {
                              const req = editingQuest.requirement as Extract<Requirement, { type: "BUY_ITEM" | "SELL_ITEM" }>;
                              setEditingQuest({ ...editingQuest, requirement: { ...req, material: { ...req.material, customId: e.target.value || undefined } } });
                            }}
                          />
                          <span className="muted small">Licznik NARASTAJĄCY - łączna suma od momentu wczytania questu, nie stan bieżący.</span>
                        </div>
                      )}
                      {editingQuest.requirement.type === "MARKET_LISTINGS" && (
                        <div className="row">
                          <input
                            type="number"
                            value={editingQuest.requirement.amount}
                            onChange={(e) => setEditingQuest({ ...editingQuest, requirement: { type: "MARKET_LISTINGS", amount: Number(e.target.value) } })}
                          />
                          <span className="muted small">Liczba ofert wystawionych ŁĄCZNIE (licznik zdarzeń) - niezależnie czy już sprzedane/wycofane.</span>
                        </div>
                      )}
                      {editingQuest.requirement.type === "MARKET_OFFER" && (
                        <p className="muted small">Stan bieżący - wymaga AKTUALNIE aktywnej oferty (przeciwnie do "Wystaw na Targu N razy" powyżej, które liczy historię).</p>
                      )}
                    </fieldset>

                    <fieldset>
                      <legend>Nagrody</legend>
                      {editingQuest.rewards.map((r, i) => (
                        <div key={i} className="rp-texture-row">
                          <div className="rp-texture-info">
                            <div className="row">
                              <select
                                value={r.type}
                                onChange={(e) => {
                                  const next = [...editingQuest.rewards];
                                  next[i] = defaultReward(e.target.value as RewardEntry["type"]);
                                  setEditingQuest({ ...editingQuest, rewards: next });
                                }}
                              >
                                {REWARD_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>

                              {r.type === "ITEM" && (
                                <>
                                  <MaterialField
                                    datalistId="materials"
                                    iconPackDir={iconPackDir}
                                    value={r.material}
                                    onChange={(v) => {
                                      const next = [...editingQuest.rewards];
                                      next[i] = { ...r, material: v };
                                      setEditingQuest({ ...editingQuest, rewards: next });
                                    }}
                                  />
                                  <input
                                    type="number"
                                    style={{ width: 70 }}
                                    value={r.amount}
                                    onChange={(e) => {
                                      const next = [...editingQuest.rewards];
                                      next[i] = { ...r, amount: Number(e.target.value) };
                                      setEditingQuest({ ...editingQuest, rewards: next });
                                    }}
                                  />
                                </>
                              )}
                              {r.type === "CUSTOM_ITEM" && (
                                <>
                                  <input
                                    list="custom-items"
                                    value={r.id}
                                    onChange={(e) => {
                                      const next = [...editingQuest.rewards];
                                      next[i] = { ...r, id: e.target.value };
                                      setEditingQuest({ ...editingQuest, rewards: next });
                                    }}
                                  />
                                  <input
                                    type="number"
                                    style={{ width: 70 }}
                                    value={r.amount}
                                    onChange={(e) => {
                                      const next = [...editingQuest.rewards];
                                      next[i] = { ...r, amount: Number(e.target.value) };
                                      setEditingQuest({ ...editingQuest, rewards: next });
                                    }}
                                  />
                                </>
                              )}
                              {r.type === "MONEY" && (
                                <input
                                  type="number"
                                  value={r.amount}
                                  onChange={(e) => {
                                    const next = [...editingQuest.rewards];
                                    next[i] = { ...r, amount: Number(e.target.value) };
                                    setEditingQuest({ ...editingQuest, rewards: next });
                                  }}
                                />
                              )}
                              {r.type === "CRATE" && (
                                <label className="checkbox">
                                  Tier
                                  <input
                                    type="number"
                                    style={{ width: 60 }}
                                    value={r.tier}
                                    onChange={(e) => {
                                      const next = [...editingQuest.rewards];
                                      next[i] = { ...r, tier: Number(e.target.value) };
                                      setEditingQuest({ ...editingQuest, rewards: next });
                                    }}
                                  />
                                </label>
                              )}
                              {r.type === "TOOL" && (
                                <select
                                  value={r.tool}
                                  onChange={(e) => {
                                    const next = [...editingQuest.rewards];
                                    next[i] = { ...r, tool: e.target.value as any };
                                    setEditingQuest({ ...editingQuest, rewards: next });
                                  }}
                                >
                                  {TOOL_REWARD_TOOLS.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {r.type === "TITLE" && (
                                <input
                                  list="titles"
                                  value={r.id}
                                  onChange={(e) => {
                                    const next = [...editingQuest.rewards];
                                    next[i] = { ...r, id: e.target.value };
                                    setEditingQuest({ ...editingQuest, rewards: next });
                                  }}
                                />
                              )}

                              <label className="checkbox">
                                <input
                                  type="checkbox"
                                  checked={Boolean(r.silent)}
                                  onChange={(e) => {
                                    const next = [...editingQuest.rewards];
                                    next[i] = { ...r, silent: e.target.checked || undefined } as RewardEntry;
                                    setEditingQuest({ ...editingQuest, rewards: next });
                                  }}
                                />
                                cicha (bonus)
                              </label>
                              <button
                                type="button"
                                onClick={() => setEditingQuest({ ...editingQuest, rewards: editingQuest.rewards.filter((_, ri) => ri !== i) })}
                              >
                                Usuń
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => setEditingQuest({ ...editingQuest, rewards: [...editingQuest.rewards, defaultReward("ITEM")] })}>
                        + Dodaj nagrodę
                      </button>
                    </fieldset>

                    <label>
                      Etykieta nagrody (opcjonalnie — bez tego składa się automatycznie)
                      <input
                        value={editingQuest.rewardLabel ?? ""}
                        onChange={(e) => setEditingQuest({ ...editingQuest, rewardLabel: e.target.value || undefined })}
                      />
                    </label>

                    <div className="row">
                      <button onClick={saveEditingQuest}>Zapisz quest (lokalnie — pamiętaj o "Wyślij na serwer")</button>
                      <button type="button" onClick={() => setEditingQuest(null)}>
                        Anuluj
                      </button>
                      {activeCategory.quests.some((q) => q.id === editingQuest.id) && (
                        <button type="button" onClick={() => deleteQuest(activeView, editingQuest.id)} disabled={busy}>
                          Usuń quest
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="muted">Kliknij slot z questem (albo "+ Dodaj") w siatce, żeby zacząć edycję.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <datalist id="materials">
        {allMaterials.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="custom-items">
        {customItemIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <datalist id="titles">
        {Object.keys(content.titles).map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      <div className="row">
        <input placeholder="komenda RCON, np. @reloadquesty" value={reloadCommand} onChange={(e) => setReloadCommand(e.target.value)} />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}

// Same idea as the shop's pencil-icon quick-edit: fix a category's name/icon/description
// right from the main-menu grid, without navigating into its own tab. Unlike
// the shop (which stores each category in its own remote file and has to
// fetch it first), quest categories already live in the one in-memory
// `content` object, so every field here just calls updateCategory() directly
// - same live-save-per-keystroke behavior as the full "Ustawienia kategorii"
// panel on the category tab.
function QuickEditCategory({
  categoryId,
  category,
  iconPackDir,
  onChange,
  onClose,
}: {
  categoryId: string;
  category: QuestCategory | undefined;
  iconPackDir?: string;
  onChange: (patch: Partial<QuestCategory>) => void;
  onClose: () => void;
}) {
  if (!category) return null;
  return (
    <div className="card form" style={{ marginBottom: "0.75rem" }}>
      <h2>Szybka edycja — {categoryId}</h2>
      <div className="row">
        <label>
          Nazwa
          <input value={category.displayName} onChange={(e) => onChange({ displayName: e.target.value })} />
        </label>
        <label>
          Ikona (materiał)
          <MaterialField
            datalistId="materials"
            iconPackDir={iconPackDir}
            value={category.icon}
            onChange={(v) => onChange({ icon: v })}
          />
        </label>
        <label>
          Opis
          <input value={category.description} onChange={(e) => onChange({ description: e.target.value })} />
        </label>
        <button type="button" onClick={onClose}>
          Zamknij
        </button>
      </div>
    </div>
  );
}
