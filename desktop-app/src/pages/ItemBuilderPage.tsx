import { useDirtyTracking } from "../state/DirtyContext";
import { Save } from "lucide-react";
import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import MaterialField from "../components/MaterialField";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import PresetBar from "../components/PresetBar";
import ToolbarMore from "../components/ToolbarMore";
import RemoteFilePicker from "../components/RemoteFilePicker";
import SlotGrid from "../components/SlotGrid";
import type { SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpListDir, sftpReadFile, sftpWriteFile } from "../lib/api";
import { getLastUsed, setLastUsed } from "../lib/lastUsed";
import { conventionalRoleIcon } from "../lib/materialIcons";
import { parseShopGuiContent, serializeShopGuiContent } from "../lib/shopGuiYaml";
import { buyPricePerUnit, effectiveSellInfoFor, parseDynamicPrices, parseSalesStats, shopItemKey } from "../lib/shopStats";
import type { SalesStatEntry } from "../lib/shopStats";
import { useIconPack } from "../lib/useIconPack";
import { useLocalPresets } from "../lib/useLocalPresets";
import { useProfiles } from "../state/ProfilesContext";
import type { ShopGuiContent, ShopItem, ShopScreen, ShopSlotEntry, ShopSlotRole } from "../lib/types";

const LAST_USED_KEY = "items";

interface NavState {
  profileId?: string | null;
  remotePath?: string | null;
}

type ScreenKey = "mainMenu" | "categoryPage" | "buyPicker" | "searchResults";

const SCREEN_LABELS: Record<ScreenKey, string> = {
  mainMenu: "Menu główne",
  categoryPage: "Strona kategorii",
  buyPicker: "Wybór ilości",
  searchResults: "Wyniki wyszukiwania",
};

const ROLE_LABELS: Record<ShopSlotRole, string> = {
  CATEGORY_SLOT: "Kategoria",
  ITEM_SLOT: "Przedmiot",
  AMOUNT_SLOT: "Ilość",
  NAV_BACK: "Powrót",
  NAV_PREV: "Poprzednia strona",
  NAV_NEXT: "Następna strona",
  EXIT: "Zamknij",
  SEARCH: "Szukaj",
  SORT: "Sortuj",
  FILLER: "Wypełniacz",
};

// Which roles make sense to add on each screen - mirrors the real
// sklep-gui.yml usage (main-menu never has ITEM_SLOT, buy-picker never has
// CATEGORY_SLOT, etc.) so the "add new slot" picker doesn't offer nonsense.
const ALLOWED_ROLES: Record<ScreenKey, ShopSlotRole[]> = {
  mainMenu: ["CATEGORY_SLOT", "SEARCH", "EXIT", "FILLER"],
  categoryPage: ["ITEM_SLOT", "SORT", "NAV_PREV", "NAV_BACK", "NAV_NEXT", "EXIT", "FILLER"],
  buyPicker: ["AMOUNT_SLOT", "NAV_BACK", "FILLER"],
  searchResults: ["ITEM_SLOT", "NAV_BACK", "FILLER"],
};

// /@sklep mnoznik/reset already exist server-side (SklepAdminCommand.java) -
// no new plugin code needed to let the app push a live multiplier override
// over RCON. Kept as its own tiny component so each row owns its own draft
// input value without re-rendering the whole item list on every keystroke.
function MultiplierControl({
  mnoznik,
  busy,
  onSet,
  onReset,
}: {
  mnoznik?: number;
  busy: boolean;
  onSet: (value: number) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState(mnoznik != null ? mnoznik.toFixed(2) : "1.00");
  return (
    <div className="row">
      <input
        type="number"
        step="0.05"
        min="0.5"
        max="1.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: "5rem" }}
      />
      <button type="button" onClick={() => onSet(Number(value))} disabled={busy}>
        Ustaw mnożnik
      </button>
      {mnoznik != null && mnoznik !== 1 && (
        <button type="button" onClick={onReset} disabled={busy}>
          Reset → 1.0
        </button>
      )}
    </div>
  );
}

type StatsSortKey = "sztukLacznie" | "wyplaconoLacznie" | "sztukDzis" | "wyplaconoDzis" | "transakcji";

function kindForRole(role: ShopSlotRole): SlotContent["kind"] {
  if (role === "CATEGORY_SLOT") return "category";
  if (role === "ITEM_SLOT" || role === "AMOUNT_SLOT") return "item";
  if (role === "FILLER") return "filler";
  return "nav";
}

function screenGridContent(screen: ShopScreen, categoryOrder: string[]): Record<number, SlotContent> {
  const out: Record<number, SlotContent> = {};
  let categoryIndex = 0;
  let itemIndex = 0;
  for (const entry of screen.layout) {
    let label: string = ROLE_LABELS[entry.role];
    let sublabel: string | undefined;
    let material: string | undefined = conventionalRoleIcon(entry.role);
    if (entry.role === "CATEGORY_SLOT") {
      label = categoryOrder[categoryIndex] ?? "(brak kategorii)";
      sublabel = `kategoria #${categoryIndex + 1}`;
      categoryIndex++;
    } else if (entry.role === "ITEM_SLOT") {
      itemIndex++;
      sublabel = `pozycja #${itemIndex}`;
    } else if (entry.role === "AMOUNT_SLOT") {
      sublabel = `×${entry.amount ?? "?"}`;
    } else if (entry.role === "FILLER" && entry.material) {
      material = entry.material;
    }
    out[entry.slot] = { label, sublabel, kind: kindForRole(entry.role), material };
  }
  return out;
}

const EMPTY_ITEM: ShopItem = {
  material: "STONE",
  slot: 0,
  displayName: "",
  amount: 1,
  buyPrice: 0,
  sellPrice: null,
  sellAmount: null,
  customId: "",
  lore: [],
};

// Mirrors the REAL on-disk shape of categories/<id>.yml exactly (verified
// against a live server): a category is NOT a flat map of items - it's
// {name, icon, slot, items: {0: {...}, 1: {...}, ...}}. ShopManager merges
// every file in categories/ under "categories.<id>." at runtime, but on disk
// each file stands alone with these top-level keys.
interface CategoryFile {
  name: string;
  icon: string;
  slot: number;
  items: ShopItem[];
}

const EMPTY_CATEGORY: CategoryFile = { name: "", icon: "CHEST", slot: 0, items: [] };
const EMPTY_ITEMS: ShopItem[] = [];

interface ShopPreset {
  guiContent: ShopGuiContent | null;
  categoryMeta: { name: string; icon: string; slot: number };
  items: ShopItem[];
}

// A lore line that's just "~" (a common decorative divider in item lore)
// parses as YAML null, not the literal text "~" - unquoted, YAML only
// recognizes "~" as null when it's the WHOLE scalar. Left as null it crashes
// MinecraftTextInput's color-code parser (calls .length on it), so restore
// the most likely intended text instead of passing null through.
function sanitizeLoreLine(raw: any): string {
  return raw == null ? "~" : String(raw);
}

function parseCategoryYaml(text: string): CategoryFile {
  if (!text.trim()) return EMPTY_CATEGORY;
  const raw = (yaml.load(text) ?? {}) as Record<string, any>;
  const itemsRaw = raw.items ?? {};
  const items: ShopItem[] = Object.entries(itemsRaw)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]: [string, any]) => ({
      material: value.material ?? "STONE",
      slot: Number(value.slot ?? 0),
      displayName: value["display-name"] ?? "",
      amount: Number(value.amount ?? 1),
      buyPrice: Number(value["buy-price"] ?? 0),
      sellPrice: value["sell-price"] != null ? Number(value["sell-price"]) : null,
      sellAmount: value["sell-amount"] != null ? Number(value["sell-amount"]) : null,
      customId: value["custom-id"] ?? "",
      lore: Array.isArray(value.lore) ? value.lore.map(sanitizeLoreLine) : [],
    }));
  return {
    name: raw.name ?? "",
    icon: raw.icon ?? "CHEST",
    slot: Number(raw.slot ?? 0),
    items,
  };
}

function serializeCategoryYaml(category: CategoryFile): string {
  const itemsOut: Record<string, any> = {};
  category.items.forEach((item, index) => {
    const entry: Record<string, any> = {
      material: item.material,
      slot: item.slot,
      "display-name": item.displayName,
      amount: item.amount,
      "buy-price": Math.trunc(item.buyPrice),
    };
    if (item.sellPrice != null) entry["sell-price"] = Math.trunc(item.sellPrice);
    if (item.sellAmount != null) entry["sell-amount"] = Math.trunc(item.sellAmount);
    if (item.customId.trim()) entry["custom-id"] = item.customId.trim();
    if (item.lore.length > 0) entry.lore = item.lore;
    itemsOut[String(index)] = entry;
  });
  return yaml.dump({ name: category.name, icon: category.icon, slot: category.slot, items: itemsOut }, { lineWidth: -1 });
}

export default function ItemBuilderPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const location = useLocation();
  const navState = (location.state as NavState) ?? {};
  const [remotePath, setRemotePath] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [quickEditCategoryId, setQuickEditCategoryId] = useState<string | null>(null);
  const [pickedUpCategorySlot, setPickedUpCategorySlot] = useState<number | null>(null);
  const [categoryMeta, setCategoryMeta] = useState<{ name: string; icon: string; slot: number }>(EMPTY_CATEGORY);
  const [serverCategoryMeta, setServerCategoryMeta] = useState<{ name: string; icon: string; slot: number }>(EMPTY_CATEGORY);
  const [items, setItems] = useState<ShopItem[]>(EMPTY_ITEMS);
  const [serverItems, setServerItems] = useState<ShopItem[]>(EMPTY_ITEMS);
  const [editing, setEditing] = useState<ShopItem>(EMPTY_ITEM);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [reloadCommand, setReloadCommand] = useState("@reloadsklep");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const autoLoadedRef = useRef(false);

  const [guiRemotePath, setGuiRemotePath] = useState("");
  const [guiContent, setGuiContent] = useState<ShopGuiContent | null>(null);
  const [serverGuiContent, setServerGuiContent] = useState<ShopGuiContent | null>(null);
  const [guiPickerOpen, setGuiPickerOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("mainMenu");
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [addRole, setAddRole] = useState<ShopSlotRole>("CATEGORY_SLOT");
  const [addAmount, setAddAmount] = useState(1);
  const [addMaterial, setAddMaterial] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({});
  const [salesStats, setSalesStats] = useState<SalesStatEntry[]>([]);
  const [statsSortKey, setStatsSortKey] = useState<StatsSortKey>("sztukLacznie");
  const [statsSortDir, setStatsSortDir] = useState<"asc" | "desc">("desc");
  const [statsFilter, setStatsFilter] = useState("");
  const [itemPage, setItemPage] = useState(0);
  const [pickedUpItemIndex, setPickedUpItemIndex] = useState<number | null>(null);

  const { iconPackDir, allMaterials, refreshVanillaBase } = useIconPack(setStatus);
  const {
    presets: presetList,
    selectedName: selectedPresetName,
    setSelectedName: setSelectedPresetName,
    load: loadPresets,
    saveAs: savePresetAs,
    remove: deletePreset,
    find: findPreset,
  } = useLocalPresets<ShopPreset>("shop");

  const profile = profiles.find((p) => p.id === profileId);

  function selectProfile(id: string) {
    setProfileId(id);
    loadPresets(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const base = p.remote_plugins_path.replace(/\/+$/, "");
    const guiPath = `${base}/MainpluginsShop/sklep-gui.yml`;
    setGuiRemotePath(guiPath);
    loadGui(id, guiPath);
    loadPricesAndStats(id, base);
    loadCategoryList(id, base);
  }

  // Each category is its own file (categories/<id>.yml) - there is no single
  // "sklep.yml" item list anymore. Discover the real category ids by listing
  // the folder rather than assuming any particular file exists.
  async function loadCategoryList(pid: string, base: string, preferredCategory?: string) {
    try {
      const entries = await sftpListDir(pid, `${base}/MainpluginsShop/categories`);
      const ids = entries
        .filter((e) => !e.is_dir && e.name.endsWith(".yml"))
        .map((e) => e.name.slice(0, -4))
        .sort();
      setCategoryIds(ids);
      loadCategoryIcons(pid, base, ids);
      if (ids.length === 0) return;
      const target = preferredCategory && ids.includes(preferredCategory) ? preferredCategory : ids[0];
      selectCategory(pid, base, target);
    } catch (e) {
      setStatus(String(e));
    }
  }

  // Icons per category (for the Menu główne preview) live in each category
  // file's own "icon" field, not in sklep-gui.yml - a handful of extra reads
  // once per category-list load, purely so the main menu can show real
  // block/item icons instead of just category ids as text.
  async function loadCategoryIcons(pid: string, base: string, ids: string[]) {
    const icons: Record<string, string> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const text = await sftpReadFile(pid, `${base}/MainpluginsShop/categories/${id}.yml`);
          icons[id] = parseCategoryYaml(text).icon;
        } catch {
          // no icon available for this one - it'll just show as text
        }
      }),
    );
    setCategoryIcons(icons);
  }

  function selectCategory(pid: string, base: string, categoryId: string) {
    const path = `${base}/MainpluginsShop/categories/${categoryId}.yml`;
    setRemotePath(path);
    setItemPage(0);
    setEditing(EMPTY_ITEM);
    setEditingIndex(null);
    setPickedUpItemIndex(null);
    load(pid, path);
  }

  function goToCategory(categoryId: string) {
    if (!profile) return;
    selectCategory(profileId, profile.remote_plugins_path.replace(/\/+$/, ""), categoryId);
    setActiveScreen("categoryPage");
  }

  // Overlays real category data on top of the structural sklep-gui.yml
  // layout, so the "Menu główne" screen shows actual category names and
  // clicking one navigates straight into its "Strona kategorii" - the GUI
  // preview IS the navigation, not a separate abstract editor.
  // Every one of the 54 squares is a valid target, not just the ones already
  // in sklep-gui.yml's layout: an occupied category slot navigates in (left
  // click) or quick-edits its name/icon (right click); any other square -
  // empty, or not even in the layout yet - shows "+" and adds a brand new
  // CATEGORY_SLOT right there.
  function mainMenuGridContent(): Record<number, SlotContent> {
    if (!guiContent) return {};
    const screen = guiContent.mainMenu;
    const layoutBySlot = new Map(screen.layout.map((e) => [e.slot, e]));
    let categoryIndex = 0;
    const categoryIndexByLayoutSlot = new Map<number, number>();
    for (const entry of screen.layout) {
      if (entry.role === "CATEGORY_SLOT") {
        categoryIndexByLayoutSlot.set(entry.slot, categoryIndex);
        categoryIndex++;
      }
    }
    const out: Record<number, SlotContent> = {};
    for (let i = 0; i < screen.size; i++) {
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
        const catId = guiContent.categoryOrder[categoryIndexByLayoutSlot.get(i) ?? -1];
        out[i] = {
          label: catId ?? "(brak kategorii)",
          kind: "category",
          material: catId ? categoryIcons[catId] : undefined,
          highlighted: pickedUpCategorySlot === i,
          onClick: pickedUpCategorySlot !== null ? () => pickUpOrMoveCategorySlot(i) : catId ? () => goToCategory(catId) : undefined,
          onContextMenu: catId ? () => editCategoryQuick(catId) : undefined,
          onPickUp: () => pickUpOrMoveCategorySlot(i),
          onEdit: catId ? () => editCategoryQuick(catId) : undefined,
        };
      } else {
        out[i] = {
          label: ROLE_LABELS[entry.role],
          kind: kindForRole(entry.role),
          material: conventionalRoleIcon(entry.role),
        };
      }
    }
    return out;
  }

  function addCategorySlotAt(slot: number) {
    if (!guiContent) return;
    updateScreen("mainMenu", { layout: [...guiContent.mainMenu.layout, { slot, role: "CATEGORY_SLOT" }] });
  }

  // Picking up a category slot and clicking another swaps their grid
  // positions (their real category identity - which categoryOrder entry
  // they represent - travels with the array element, so this correctly
  // relocates "which category shows where", not just an anonymous slot).
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
    if (!guiContent) return;
    const nextLayout = guiContent.mainMenu.layout.map((e) => {
      if (e.slot === fromSlot) return { ...e, slot: toSlot };
      if (e.slot === toSlot) return { ...e, slot: fromSlot };
      return e;
    });
    updateScreen("mainMenu", { layout: nextLayout });
  }

  function editCategoryQuick(categoryId: string) {
    if (!profile) return;
    setQuickEditCategoryId(categoryId);
    selectCategory(profileId, profile.remote_plugins_path.replace(/\/+$/, ""), categoryId);
  }

  const categoryPageItemSlotCount = guiContent?.categoryPage.layout.filter((e) => e.role === "ITEM_SLOT").length ?? 0;
  const itemTotalPages = categoryPageItemSlotCount > 0 ? Math.max(1, Math.ceil(items.length / categoryPageItemSlotCount)) : 1;

  // Same idea as mainMenuGridContent but one level deeper: each ITEM_SLOT
  // position shows the REAL item that plugin fills there at runtime (items
  // fill slots in array order, paginated by how many ITEM_SLOTs the layout
  // has). Verified against ShopManager.java: the per-item "slot" field in
  // categories/*.yml is NEVER read at runtime - real position is purely the
  // item's order in the YAML map. Every square is a valid target: an
  // occupied one edits (or, in move mode, picks up/swaps); ANY empty one
  // (not just the one right after the last item) adds a new item / accepts
  // a dropped one - there's no such thing as "the wrong empty square" since
  // items always pack from the start with no gaps.
  function categoryPageGridContent(): Record<number, SlotContent> {
    if (!guiContent) return {};
    const screen = guiContent.categoryPage;
    const base = screenGridContent(screen, guiContent.categoryOrder);
    const pageSize = categoryPageItemSlotCount || 1;
    const startIndex = itemPage * pageSize;
    let seen = 0;
    for (const entry of screen.layout) {
      if (entry.role !== "ITEM_SLOT") continue;
      const itemIndex = startIndex + seen;
      seen++;
      const item = items[itemIndex];
      if (item) {
        const sellInfo = effectiveSellInfoFor(item, dynamicPrices);
        base[entry.slot] = {
          label: (item.displayName.replace(/&./g, "") || item.material) || "?",
          sublabel: `${sellInfo ? sellInfo.effective : buyPricePerUnit(item)}$`,
          kind: "item",
          material: item.material,
          highlighted: pickedUpItemIndex === itemIndex,
          onClick: pickedUpItemIndex !== null ? () => pickUpOrSwapItem(itemIndex) : () => editItem(itemIndex),
          onPickUp: () => pickUpOrSwapItem(itemIndex),
        };
      } else {
        base[entry.slot] = {
          // kind stays "item" (not "filler") even though it's empty - see the
          // matching comment in QuestsPage.categoryGridContent: an ITEM_SLOT
          // that's currently unfilled is still an ITEM_SLOT, and forcing it
          // to "filler" would drop its role accent-line if items are ever
          // laid out non-contiguously. `dim` quiets the "+" text instead.
          //
          // Every empty ITEM_SLOT shows "+" and adds - items are a dense
          // array server-side (verified against ShopManager.java: real slot
          // position = array order, the per-item "slot" field is never read
          // at runtime), so there's no such thing as "add AT this specific
          // slot" - any empty cell adds the same next item.
          label: pickedUpItemIndex !== null ? "" : "+",
          kind: "item",
          dim: true,
          onClick: () => (pickedUpItemIndex !== null ? dropPickedUpAtEnd() : addItemAt(items.length)),
        };
      }
    }
    return base;
  }

  // Clicking an item picks it up; clicking a DIFFERENT item swaps the two
  // (matches how dragging one item onto another works in a real MC
  // inventory - not "insert and shift everyone else along").
  function pickUpOrSwapItem(targetIndex: number) {
    if (pickedUpItemIndex === null) {
      setPickedUpItemIndex(targetIndex);
      return;
    }
    if (pickedUpItemIndex === targetIndex) {
      setPickedUpItemIndex(null);
      return;
    }
    swapItemsInCategory(pickedUpItemIndex, targetIndex);
    setPickedUpItemIndex(null);
  }

  function swapItemsInCategory(a: number, b: number) {
    const next = [...items];
    [next[a], next[b]] = [next[b], next[a]];
    saveAll(next.map((it, i) => ({ ...it, slot: i })));
  }

  // Dropping a picked-up item on ANY empty square moves it to the end -
  // empty squares don't have individually meaningful positions since items
  // pack from the start with no gaps, so there's nothing to distinguish
  // between "which" empty square was clicked.
  function dropPickedUpAtEnd() {
    if (pickedUpItemIndex === null) return;
    const next = [...items];
    const [moved] = next.splice(pickedUpItemIndex, 1);
    next.push(moved);
    saveAll(next.map((it, i) => ({ ...it, slot: i })));
    setPickedUpItemIndex(null);
  }

  function addItemAt(index: number) {
    setEditing({ ...EMPTY_ITEM, slot: index });
    setEditingIndex(null);
  }

  // Live dynamic prices + long-term sales stats are read-only informational
  // overlays - both files are written by the server itself (DynamicPriceManager /
  // StatystykiSklepu), never by this app, so a missing file (fresh install,
  // no sales yet) is normal and just means "nothing to show", not an error.
  async function loadPricesAndStats(pid: string, base: string) {
    try {
      const text = await sftpReadFile(pid, `${base}/MainpluginsShop/ceny-dynamiczne.yml`);
      setDynamicPrices(parseDynamicPrices(text));
    } catch {
      setDynamicPrices({});
    }
    try {
      const text = await sftpReadFile(pid, `${base}/MainpluginsShop/statystyki-sklepu.yml`);
      setSalesStats(parseSalesStats(text));
    } catch {
      setSalesStats([]);
    }
  }

  function refreshPricesAndStats() {
    if (!profile) return;
    loadPricesAndStats(profileId, profile.remote_plugins_path.replace(/\/+$/, ""));
  }

  // /@sklep mnoznik / reset already exist on the server (SklepAdminCommand.java)
  // - pushing a live override is just an RCON call, no new plugin code needed.
  async function setMultiplierFor(item: ShopItem, value: number) {
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, `@sklep mnoznik ${shopItemKey(item)} ${value}`);
      setStatus(`RCON: ${result || "OK"}`);
      refreshPricesAndStats();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetMultiplierFor(item: ShopItem) {
    setBusy(true);
    setStatus(null);
    try {
      const result = await rconSendCommand(profileId, `@sklep reset ${shopItemKey(item)}`);
      setStatus(`RCON: ${result || "OK"}`);
      refreshPricesAndStats();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleStatsSort(key: StatsSortKey) {
    if (statsSortKey === key) {
      setStatsSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setStatsSortKey(key);
      setStatsSortDir("desc");
    }
  }

  async function loadGui(profileIdOverride?: string, pathOverride?: string, silent = false) {
    const pid = profileIdOverride ?? profileId;
    const path = pathOverride ?? guiRemotePath;
    if (!pid || !path) return;
    if (!silent) {
      setBusy(true);
      setStatus(null);
    }
    try {
      const text = await sftpReadFile(pid, path);
      const parsed = parseShopGuiContent(text);
      setGuiContent(parsed);
      setServerGuiContent(parsed);
    } catch (e) {
      if (!silent) setStatus(String(e));
    } finally {
      if (!silent) setBusy(false);
    }
  }

  // Edits only touch local state - nothing reaches the server until "Wyślij
  // na serwer" is clicked, and "Cofnij do stanu z serwera" throws away local
  // changes and goes back to the server*-mirrors captured on load / after the
  // last successful publish.
  function saveGui(next: ShopGuiContent) {
    setGuiContent(next);
  }

  function updateScreen(key: ScreenKey, patch: Partial<ShopScreen>) {
    if (!guiContent) return;
    saveGui({ ...guiContent, [key]: { ...guiContent[key], ...patch } });
  }

  function moveGuiSlot(fromSlot: number, toSlot: number) {
    if (!guiContent) return;
    const screen = guiContent[activeScreen];
    updateScreen(activeScreen, { layout: screen.layout.map((e) => (e.slot === fromSlot ? { ...e, slot: toSlot } : e)) });
  }

  function addGuiSlot(slot: number) {
    if (!guiContent) return;
    const screen = guiContent[activeScreen];
    const entry: ShopSlotEntry = { slot, role: addRole };
    if (addRole === "AMOUNT_SLOT") entry.amount = addAmount;
    if (addRole === "FILLER" && addMaterial.trim()) entry.material = addMaterial.trim().toUpperCase();
    updateScreen(activeScreen, { layout: [...screen.layout, entry] });
  }

  function removeGuiSlot(slot: number) {
    if (!guiContent) return;
    const screen = guiContent[activeScreen];
    updateScreen(activeScreen, { layout: screen.layout.filter((e) => e.slot !== slot) });
  }

  function moveCategoryOrder(index: number, delta: number) {
    if (!guiContent) return;
    const target = index + delta;
    if (target < 0 || target >= guiContent.categoryOrder.length) return;
    const next = [...guiContent.categoryOrder];
    [next[index], next[target]] = [next[target], next[index]];
    saveGui({ ...guiContent, categoryOrder: next });
  }

  function addCategoryOrderEntry(id: string) {
    if (!guiContent || !id.trim()) return;
    saveGui({ ...guiContent, categoryOrder: [...guiContent.categoryOrder, id.trim()] });
  }

  function removeCategoryOrderEntry(index: number) {
    if (!guiContent) return;
    saveGui({ ...guiContent, categoryOrder: guiContent.categoryOrder.filter((_, i) => i !== index) });
  }

  async function load(profileIdOverride?: string, remotePathOverride?: string, silent = false) {
    const pid = profileIdOverride ?? profileId;
    const path = remotePathOverride ?? remotePath;
    if (!pid || !path) return;
    if (!silent) {
      setBusy(true);
      setStatus(null);
    }
    try {
      const text = await sftpReadFile(pid, path);
      const category = parseCategoryYaml(text);
      const meta = { name: category.name, icon: category.icon, slot: category.slot };
      setCategoryMeta(meta);
      setServerCategoryMeta(meta);
      setItems(category.items);
      setServerItems(category.items);
      setLastUsed(LAST_USED_KEY, { profileId: pid, remotePath: path });
    } catch (e) {
      if (!silent) setStatus(String(e));
    } finally {
      if (!silent) setBusy(false);
    }
  }

  // Extracts "bloki" out of ".../categories/bloki.yml" - lets last-used
  // remember which CATEGORY was open, not just which profile.
  function categoryIdFromPath(path: string): string | undefined {
    const match = path.match(/\/categories\/([^/]+)\.yml$/);
    return match?.[1];
  }

  useEffect(() => {
    if (navState.profileId) {
      autoLoadedRef.current = true;
      setProfileId(navState.profileId);
      loadPresets(navState.profileId);
      const p = profiles.find((x) => x.id === navState.profileId);
      if (!p) return;
      const base = p.remote_plugins_path.replace(/\/+$/, "");
      const preferredCategory = navState.remotePath ? categoryIdFromPath(navState.remotePath) : undefined;
      setGuiRemotePath(`${base}/MainpluginsShop/sklep-gui.yml`);
      loadGui(navState.profileId, `${base}/MainpluginsShop/sklep-gui.yml`);
      loadPricesAndStats(navState.profileId, base);
      loadCategoryList(navState.profileId, base, preferredCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once a server has been picked here at least once, remember it (profile +
  // which category file) and load everything automatically next time this
  // page opens (unless navigated here with an explicit target, handled
  // above). With no history yet but exactly one server configured, just use
  // that one - nothing to actually choose between.
  // Kolejność pierwszeństwa: jawna nawigacja (navState, wyżej) > serwer aktywny
  // GLOBALNIE (pasek boczny) > stary zapis specyficzny dla tej strony > jedyny
  // skonfigurowany profil, gdy nic innego nie wskazuje wyboru.
  useEffect(() => {
    if (profilesLoading || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    const last = getLastUsed(LAST_USED_KEY);
    const fallbackProfile = profiles.length === 1 ? profiles[0] : undefined;
    const pid =
      profileId && profiles.some((p) => p.id === profileId)
        ? profileId
        : last && profiles.some((p) => p.id === last.profileId)
          ? last.profileId
          : fallbackProfile?.id;
    if (!pid) return;
    setProfileId(pid);
    loadPresets(pid);
    const p = profiles.find((x) => x.id === pid);
    if (!p) return;
    const base = p.remote_plugins_path.replace(/\/+$/, "");
    const preferredCategory = last?.remotePath && last.profileId === pid ? categoryIdFromPath(last.remotePath) : undefined;
    setGuiRemotePath(`${base}/MainpluginsShop/sklep-gui.yml`);
    loadGui(pid, `${base}/MainpluginsShop/sklep-gui.yml`);
    loadPricesAndStats(pid, base);
    loadCategoryList(pid, base, preferredCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesLoading]);

  // Edits only touch local state - nothing reaches the server until "Wyślij
  // na serwer" is clicked, and "Cofnij do stanu z serwera" throws away every
  // local draft (GUI layout, category meta, items) and goes back to the
  // server*-mirrors captured on load / after the last successful publish.
  const dirty = guiContent !== serverGuiContent || categoryMeta !== serverCategoryMeta || items !== serverItems;
  useDirtyTracking(dirty);

  // Since there's now a local draft to protect, this only silently re-pulls
  // from the server while there's nothing unsaved - otherwise a background
  // refresh could yank a local edit out from under the user before they got
  // to click "Wyślij na serwer". This is what keeps the app in sync if the
  // file changes from outside the app (another admin, a direct edit, RCON,
  // etc.) instead of only ever reflecting whatever was last loaded until a
  // manual reload. Also paused whenever the user has something actively
  // picked up or is mid-edit.
  useEffect(() => {
    if (!profileId || dirty) return;
    const interacting =
      pickedUpItemIndex !== null || pickedUpCategorySlot !== null || editingIndex !== null || quickEditCategoryId !== null;
    if (interacting) return;
    const timer = setInterval(() => {
      loadGui(undefined, undefined, true);
      if (remotePath) load(undefined, undefined, true);
      if (profile) loadPricesAndStats(profileId, profile.remote_plugins_path.replace(/\/+$/, ""));
    }, 20000);
    return () => clearInterval(timer);
  }, [profileId, guiRemotePath, remotePath, pickedUpItemIndex, pickedUpCategorySlot, editingIndex, quickEditCategoryId, profile, dirty]);

  function saveAll(next: ShopItem[]) {
    setItems(next);
  }

  function saveCategoryMeta(patch: Partial<{ name: string; icon: string; slot: number }>) {
    const next = { ...categoryMeta, ...patch };
    setCategoryMeta(next);
    const catId = categoryIdFromPath(remotePath);
    if (catId) setCategoryIcons((prev) => ({ ...prev, [catId]: next.icon }));
  }

  // Writing the files over SFTP does NOT make the running plugin pick them
  // up - it still has the old GUI/category data cached in memory until told
  // to reload, so publish also sends the RCON reload command right after a
  // successful write. Otherwise "Wyślij na serwer" would silently do nothing
  // visible in-game until someone separately remembered to click "Wyślij RCON".
  async function publish() {
    if (!profileId) return;
    setBusy(true);
    setStatus(null);
    try {
      const writes: Promise<void>[] = [];
      if (guiContent && guiRemotePath) writes.push(sftpWriteFile(profileId, guiRemotePath, serializeShopGuiContent(guiContent)));
      if (remotePath) writes.push(sftpWriteFile(profileId, remotePath, serializeCategoryYaml({ ...categoryMeta, items })));
      await Promise.all(writes);
      if (guiContent) setServerGuiContent(guiContent);
      setServerCategoryMeta(categoryMeta);
      setServerItems(items);
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
    if (serverGuiContent) setGuiContent(serverGuiContent);
    setCategoryMeta(serverCategoryMeta);
    setItems(serverItems);
    setEditing(EMPTY_ITEM);
    setEditingIndex(null);
    setQuickEditCategoryId(null);
    setPickedUpItemIndex(null);
    setPickedUpCategorySlot(null);
    setStatus("Przywrócono stan z serwera - lokalne zmiany odrzucone.");
  }

  // Local presets are a separate, opt-in safety net on top of the draft -
  // saving one never touches the server. Loading one only replaces the local
  // draft (GUI layout + currently open category); it still has to go through
  // "Wyślij na serwer" to go live - handy if something got overwritten on
  // the server and you want back what you had.
  function saveCurrentPresetAs() {
    if (!profileId) return;
    const name = window.prompt("Nazwa presetu (nadpisze istniejący o tej samej nazwie):", selectedPresetName || "");
    if (!name) return;
    savePresetAs(profileId, name, { guiContent, categoryMeta, items });
    setStatus(`Zapisano preset lokalnie jako „${name}" (nie wysłano na serwer).`);
  }

  function loadPresetIntoDraft(name: string) {
    const found = findPreset(name);
    if (!found) return;
    if (found.guiContent) setGuiContent(found.guiContent);
    setCategoryMeta(found.categoryMeta);
    setItems(found.items);
    setStatus(`Wczytano preset „${name}" do edycji - kliknij "Wyślij na serwer", żeby go opublikować.`);
  }

  function upsertEditing() {
    if (!editing.material.trim()) {
      setStatus("Podaj materiał itemu.");
      return;
    }
    const next = [...items];
    if (editingIndex != null) {
      next[editingIndex] = editing;
    } else {
      next.push(editing);
    }
    saveAll(next);
    setEditing(EMPTY_ITEM);
    setEditingIndex(null);
  }

  function editItem(index: number) {
    setEditing(items[index]);
    setEditingIndex(index);
  }

  function removeItem(index: number) {
    const next = items.filter((_, i) => i !== index);
    saveAll(next);
    if (editingIndex === index) {
      setEditing(EMPTY_ITEM);
      setEditingIndex(null);
    }
  }

  async function reload() {
    if (!reloadCommand) return;
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

  return (
    <div className="page">
      <Link to="/tools" className="back-link">← Twoje pluginy</Link>
      <h1>Kreator sklepu</h1>

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
        <p className="muted small">
          Ikonki materiałów: {iconPackDir ? `${allMaterials.length} dostępnych` : "ładowanie bazy Vanilla..."}
          {" - "}
          <button type="button" onClick={refreshVanillaBase} disabled={busy}>
            Odśwież bazę Vanilla
          </button>
          {" - "}
          <button
            type="button"
            onClick={() => {
              loadGui();
              if (remotePath) load();
              if (profile) loadPricesAndStats(profileId, profile.remote_plugins_path.replace(/\/+$/, ""));
            }}
            disabled={busy || !profileId}
          >
            Odśwież teraz z serwera
          </button>
          <span className="muted small"> (auto-odświeżanie co 20s, gdy nic nie edytujesz i nie masz niezapisanych zmian)</span>
        </p>
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

      <datalist id="materials">
        {allMaterials.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {!guiContent && <p className="muted">Wczytywanie sklep-gui.yml...</p>}

      {guiContent && (
        <>
          <div className="row subtabs">
            {(Object.keys(SCREEN_LABELS) as ScreenKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={activeScreen === key ? "active" : ""}
                onClick={() => {
                  setActiveScreen(key);
                  setAddRole(ALLOWED_ROLES[key][0]);
                }}
              >
                {SCREEN_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="row">
            <label className="checkbox">
              <input type="checkbox" checked={layoutEditMode} onChange={(e) => setLayoutEditMode(e.target.checked)} />
              Tryb edycji układu (zamiast klikania w przedmioty/kategorie: przesuwaj / dodawaj / usuwaj sloty)
            </label>
            {layoutEditMode && (
              <>
                <label>
                  Rozmiar (9-54)
                  <input
                    type="number"
                    min={9}
                    max={54}
                    step={9}
                    value={guiContent[activeScreen].size}
                    onChange={(e) => updateScreen(activeScreen, { size: Number(e.target.value) })}
                  />
                </label>
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as ShopSlotRole)}>
                  {ALLOWED_ROLES[activeScreen].map((r) => (
                    <option key={r} value={r}>
                      Nowy: {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                {addRole === "AMOUNT_SLOT" && (
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={addAmount}
                    onChange={(e) => setAddAmount(Number(e.target.value))}
                    placeholder="ilość"
                  />
                )}
                {addRole === "FILLER" && (
                  <input
                    list="materials"
                    value={addMaterial}
                    onChange={(e) => setAddMaterial(e.target.value)}
                    placeholder="materiał (opcjonalnie)"
                  />
                )}
              </>
            )}
          </div>
          {layoutEditMode && (
            <p className="muted small">
              Kliknij zajęty slot, żeby go podnieść, potem kliknij pusty slot, żeby go tam przenieść. Kliknij pusty
              slot bez podnoszenia niczego, żeby dodać nowy (rola z listy powyżej). × usuwa slot.
            </p>
          )}

          {activeScreen === "mainMenu" && (
            <div className="two-col two-col-grid-wide">
              <div className="card">
                <h2>Menu główne {layoutEditMode ? "" : "(klikalne)"}</h2>
                {!layoutEditMode && (
                  <p className="muted small">
                    {pickedUpCategorySlot !== null
                      ? "Kategoria podniesiona - kliknij inne pole, żeby ją tam przenieść (albo kliknij ikonę przesunięcia na niej jeszcze raz, żeby anulować)."
                      : "Kliknij kategorię, żeby wejść do jej Strony kategorii, ikona przesunięcia w rogu - żeby ją przenieść, prawy klik - szybka edycja nazwy/ikony. \"+\" na pustym polu dodaje nową kategorię."}
                  </p>
                )}
                {quickEditCategoryId && (
                  <div className="card form" style={{ marginBottom: "0.75rem" }}>
                    <h2>Szybka edycja - {quickEditCategoryId}</h2>
                    {categoryIdFromPath(remotePath) !== quickEditCategoryId ? (
                      <p className="muted small">Wczytywanie...</p>
                    ) : (
                      <div className="row">
                        <label>
                          Nazwa
                          <input
                            value={categoryMeta.name}
                            onChange={(e) => setCategoryMeta({ ...categoryMeta, name: e.target.value })}
                          />
                        </label>
                        <label>
                          Ikona (materiał)
                          <MaterialField
                            datalistId="materials"
                            iconPackDir={iconPackDir}
                            value={categoryMeta.icon}
                            onChange={(v) => setCategoryMeta({ ...categoryMeta, icon: v })}
                          />
                        </label>
                        <button type="button" onClick={() => saveCategoryMeta(categoryMeta)} disabled={busy}>
                          Zapisz
                        </button>
                        <button type="button" onClick={() => setQuickEditCategoryId(null)}>
                          Zamknij
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <SlotGrid
                  content={layoutEditMode ? screenGridContent(guiContent.mainMenu, guiContent.categoryOrder) : mainMenuGridContent()}
                  size={guiContent.mainMenu.size}
                  editable={layoutEditMode}
                  iconPackDir={iconPackDir}
                  onMoveSlot={moveGuiSlot}
                  onAddSlot={addGuiSlot}
                  onRemoveSlot={removeGuiSlot}
                />
              </div>
              <div className="card">
                <h2>Kolejność kategorii ({guiContent.categoryOrder.length})</h2>
                <p className="muted small">
                  i-ty CATEGORY_SLOT w Menu głównym → i-ta pozycja z tej listy. Kategoria z plikiem na dysku, ale
                  spoza tej listy, nadal działa - po prostu nie ma własnej ikony w menu głównym.
                </p>
                <div className="card-grid">
                  {guiContent.categoryOrder.map((id, index) => (
                    <div key={index} className="card">
                      <div className="card-title">{id}</div>
                      <div className="row">
                        <button onClick={() => goToCategory(id)}>Otwórz</button>
                        <button onClick={() => moveCategoryOrder(index, -1)} disabled={index === 0}>
                          ↑
                        </button>
                        <button
                          onClick={() => moveCategoryOrder(index, 1)}
                          disabled={index === guiContent.categoryOrder.length - 1}
                        >
                          ↓
                        </button>
                        <button onClick={() => removeCategoryOrderEntry(index)}>Usuń</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <input
                    placeholder="id kategorii, np. bloki"
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addCategoryOrderEntry(newCategoryId);
                      setNewCategoryId("");
                    }}
                  >
                    + Dodaj
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeScreen === "categoryPage" && (
            <>
              {categoryIds.length > 0 && (
                <div className="row">
                  <label>
                    Kategoria
                    <select value={categoryIdFromPath(remotePath) ?? ""} onChange={(e) => goToCategory(e.target.value)}>
                      {categoryIds.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="two-col two-col-grid-wide">
                <div className="card">
                  <h2>Strona kategorii {layoutEditMode ? "" : `- ${categoryMeta.name || "?"}`}</h2>
                  {!layoutEditMode && (
                    <>
                      <p className="muted small">
                        {pickedUpItemIndex !== null
                          ? "Przedmiot podniesiony - kliknij inny, żeby zamienić miejscami, albo dowolne puste pole, żeby przenieść na koniec."
                          : "Kliknij przedmiot, żeby go edytować, ikona przesunięcia w rogu - żeby go przenieść, \"+ Dodaj\" na pustym polu dodaje nowy. Kolejność tu = realna pozycja w grze (pole \"slot\" w pliku nie jest czytane przez wtyczkę)."}
                      </p>
                      {itemTotalPages > 1 && (
                        <div className="row">
                          <button onClick={() => setItemPage((p) => Math.max(0, p - 1))} disabled={itemPage === 0}>
                            ◀ Strona
                          </button>
                          <span className="muted">
                            {itemPage + 1} / {itemTotalPages}
                          </span>
                          <button
                            onClick={() => setItemPage((p) => Math.min(itemTotalPages - 1, p + 1))}
                            disabled={itemPage >= itemTotalPages - 1}
                          >
                            Strona ▶
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  <SlotGrid
                    content={layoutEditMode ? screenGridContent(guiContent.categoryPage, guiContent.categoryOrder) : categoryPageGridContent()}
                    size={guiContent.categoryPage.size}
                    editable={layoutEditMode}
                    iconPackDir={iconPackDir}
                    onMoveSlot={moveGuiSlot}
                    onAddSlot={addGuiSlot}
                    onRemoveSlot={removeGuiSlot}
                  />
                </div>

                <div className="card form">
                  <h2>{editingIndex != null ? "Edytuj pozycję" : "Nowa pozycja"}</h2>

                  <label>
                    Materiał
                    <MaterialField
                      datalistId="materials"
                      iconPackDir={iconPackDir}
                      value={editing.material}
                      onChange={(v) => setEditing({ ...editing, material: v })}
                    />
                  </label>

                  <label>
                    Nazwa wyświetlana
                    <MinecraftTextInput
                      value={editing.displayName}
                      onChange={(v) => setEditing({ ...editing, displayName: v })}
                      placeholder="&b&lNazwa itemu"
                    />
                  </label>

                  <fieldset>
                    <legend>Lore</legend>
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
                        <button
                          type="button"
                          onClick={() => setEditing({ ...editing, lore: editing.lore.filter((_, li) => li !== i) })}
                        >
                          Usuń
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setEditing({ ...editing, lore: [...editing.lore, ""] })}>
                      + Dodaj linijkę
                    </button>
                  </fieldset>

                  <div className="row">
                    <label>
                      Ilość
                      <input
                        type="number"
                        min={1}
                        max={64}
                        value={editing.amount}
                        onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })}
                      />
                    </label>
                  </div>

                  <div className="row">
                    <label>
                      Cena kupna
                      <input
                        type="number"
                        min={0}
                        value={editing.buyPrice}
                        onChange={(e) => setEditing({ ...editing, buyPrice: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Cena sprzedaży (opcjonalnie)
                      <input
                        type="number"
                        min={0}
                        value={editing.sellPrice ?? ""}
                        onChange={(e) => setEditing({ ...editing, sellPrice: e.target.value ? Number(e.target.value) : null })}
                      />
                    </label>
                    <label>
                      Ilość przy sprzedaży (opcjonalnie)
                      <input
                        type="number"
                        min={0}
                        value={editing.sellAmount ?? ""}
                        onChange={(e) => setEditing({ ...editing, sellAmount: e.target.value ? Number(e.target.value) : null })}
                      />
                    </label>
                  </div>
                  <p className="muted small">
                    Ceny muszą być liczbami całkowitymi - plugin obcina ułamki. "Cena kupna" to cena za CAŁY lot
                    ({editing.amount} szt.), nie za sztukę - w grze gracz zobaczy{" "}
                    <strong>{buyPricePerUnit(editing)}$ za szt.</strong>
                  </p>

                  <label>
                    Custom ID (opcjonalnie)
                    <input value={editing.customId} onChange={(e) => setEditing({ ...editing, customId: e.target.value })} />
                  </label>

                  <div className="row">
                    <button onClick={upsertEditing} disabled={!profileId}>
                      Zapisz pozycję (lokalnie - pamiętaj o "Wyślij na serwer")
                    </button>
                    {editingIndex != null && (
                      <button type="button" onClick={() => removeItem(editingIndex)} disabled={busy}>
                        Usuń tę pozycję
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(EMPTY_ITEM);
                        setEditingIndex(null);
                      }}
                    >
                      Wyczyść formularz
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <h2>Ustawienia kategorii</h2>
                <div className="row">
                  <label>
                    Nazwa
                    <input
                      value={categoryMeta.name}
                      onChange={(e) => setCategoryMeta({ ...categoryMeta, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Ikona (materiał)
                    <MaterialField
                      datalistId="materials"
                      iconPackDir={iconPackDir}
                      value={categoryMeta.icon}
                      onChange={(v) => setCategoryMeta({ ...categoryMeta, icon: v })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => saveCategoryMeta(categoryMeta)}
                    disabled={busy || !profileId}
                    style={{ alignSelf: "flex-end" }}
                  >
                    Zapisz ustawienia kategorii
                  </button>
                </div>
              </div>

              <div className="card">
                <h2>Wszystkie pozycje w kategorii ({items.length})</h2>
                <div className="card-grid">
                  {items.map((item, index) => {
                    const sellInfo = effectiveSellInfoFor(item, dynamicPrices);
                    const stats = salesStats.find((s) => s.key === shopItemKey(item));
                    return (
                      <div key={index} className="card">
                        <div className="row" style={{ alignItems: "center" }}>
                          <MaterialIcon material={item.material} iconPackDir={iconPackDir} />
                          <div className="card-title">#{index}</div>
                        </div>
                        <div className="muted small">{item.material}</div>
                        <div className="muted small">
                          Kupno w grze: {buyPricePerUnit(item)}$ za szt.
                          <span className="muted small"> (konfig: {item.buyPrice}$ za lot ×{item.amount})</span>
                        </div>
                        {item.sellPrice != null && (
                          <div className="muted small">
                            Skup (baza): {item.sellPrice}$ za {item.sellAmount ?? item.amount} szt.
                          </div>
                        )}
                        <div className="muted small">
                          {sellInfo
                            ? `Żywa cena skupu: ${sellInfo.effective}$ za ${item.sellAmount ?? item.amount} szt. (mnożnik ×${sellInfo.mnoznik.toFixed(2)})`
                            : "Żywa cena skupu: brak danych (jeszcze nie handlowano)"}
                        </div>
                        {stats && (
                          <div className="muted small">
                            Sprzedano łącznie: {stats.sztukLacznie} szt. / {stats.wyplaconoLacznie}$ - dziś: {stats.sztukDzis} szt.
                          </div>
                        )}
                        <MultiplierControl
                          mnoznik={sellInfo?.mnoznik}
                          busy={busy}
                          onSet={(v) => setMultiplierFor(item, v)}
                          onReset={() => resetMultiplierFor(item)}
                        />
                        <div className="row">
                          <button onClick={() => editItem(index)}>Edytuj</button>
                          <button onClick={() => removeItem(index)}>Usuń</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <h2>Statystyki sprzedaży (cały sklep)</h2>
                <p className="muted small">
                  Dane z statystyki-sklepu.yml (zbierane przez serwer od zawsze), dla wszystkich kategorii naraz -
                  tylko podgląd sprzedaży, ale mnożnik ceny obok każdego itemu wyżej można zmienić na żywo.
                </p>
                <div className="row">
                  <input
                    placeholder="Szukaj po nazwie lub kluczu..."
                    value={statsFilter}
                    onChange={(e) => setStatsFilter(e.target.value)}
                  />
                  <button type="button" onClick={refreshPricesAndStats} disabled={busy}>
                    Odśwież ceny i statystyki
                  </button>
                </div>
                {salesStats.length === 0 ? (
                  <p className="muted small">Brak danych - jeszcze nikt nic nie sprzedał do sklepu na tym serwerze.</p>
                ) : (
                  <div className="build-log">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          {(
                            [
                              ["sztukLacznie", "Sztuk łącznie"],
                              ["wyplaconoLacznie", "Wypłacono łącznie"],
                              ["transakcji", "Transakcji"],
                              ["sztukDzis", "Sztuk dziś"],
                              ["wyplaconoDzis", "Wypłacono dziś"],
                            ] as [StatsSortKey, string][]
                          ).map(([key, label]) => (
                            <th key={key} onClick={() => toggleStatsSort(key)} style={{ cursor: "pointer" }}>
                              {label} {statsSortKey === key ? (statsSortDir === "desc" ? "▼" : "▲") : ""}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {salesStats
                          .filter((s) => {
                            if (!statsFilter.trim()) return true;
                            const item = items.find((i) => shopItemKey(i) === s.key);
                            const name = (item?.displayName?.replace(/&./g, "") || s.key).toLowerCase();
                            return name.includes(statsFilter.toLowerCase()) || s.key.toLowerCase().includes(statsFilter.toLowerCase());
                          })
                          .sort((a, b) => (statsSortDir === "desc" ? b[statsSortKey] - a[statsSortKey] : a[statsSortKey] - b[statsSortKey]))
                          .map((s) => {
                            const item = items.find((i) => shopItemKey(i) === s.key);
                            return (
                              <tr key={s.key}>
                                <td>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                                    {item && <MaterialIcon material={item.material} iconPackDir={iconPackDir} />}
                                    {item?.displayName?.replace(/&./g, "") || s.key}
                                  </span>
                                </td>
                                <td>{s.sztukLacznie}</td>
                                <td>{s.wyplaconoLacznie}$</td>
                                <td>{s.transakcji}</td>
                                <td>{s.sztukDzis}</td>
                                <td>{s.wyplaconoDzis}$</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {(activeScreen === "buyPicker" || activeScreen === "searchResults") && (
            <div className="card">
              <h2>{SCREEN_LABELS[activeScreen]}</h2>
              <p className="muted small">
                {activeScreen === "buyPicker"
                  ? "Ekran wyboru ilości - opcje nie są przypisane do konkretnych przedmiotów, tylko definiują dostępne ilości."
                  : "Wyniki wyszukiwania są wspólne dla wszystkich kategorii - tu edytujesz tylko układ, nie konkretne przedmioty."}
              </p>
              <SlotGrid
                content={screenGridContent(guiContent[activeScreen], guiContent.categoryOrder)}
                size={guiContent[activeScreen].size}
                editable={layoutEditMode}
                iconPackDir={iconPackDir}
                onMoveSlot={moveGuiSlot}
                onAddSlot={addGuiSlot}
                onRemoveSlot={removeGuiSlot}
              />
            </div>
          )}

          <details>
            <summary className="muted small">Zaawansowane: ręczne ścieżki plików</summary>
            <div className="row">
              <input
                placeholder="/plugins/MainpluginsShop/categories/bloki.yml"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
              />
              <button onClick={() => setPickerOpen(true)} disabled={!profileId}>
                Przeglądaj...
              </button>
              <button
                onClick={() => {
                  load();
                  if (profile) loadPricesAndStats(profileId, profile.remote_plugins_path.replace(/\/+$/, ""));
                }}
                disabled={!profileId || busy}
              >
                Wczytaj plik kategorii
              </button>
            </div>
            <div className="row">
              <input
                placeholder="/plugins/MainpluginsShop/sklep-gui.yml"
                value={guiRemotePath}
                onChange={(e) => setGuiRemotePath(e.target.value)}
              />
              <button onClick={() => setGuiPickerOpen(true)} disabled={!profileId}>
                Przeglądaj...
              </button>
              <button onClick={() => loadGui()} disabled={!profileId || busy}>
                Wczytaj sklep-gui.yml
              </button>
            </div>
          </details>

          {pickerOpen && profile && (
            <RemoteFilePicker
              profileId={profileId}
              startPath={profile.remote_plugins_path}
              onSelect={(path) => {
                setRemotePath(path);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}

          {guiPickerOpen && profile && (
            <RemoteFilePicker
              profileId={profileId}
              startPath={profile.remote_plugins_path}
              onSelect={(path) => {
                setGuiRemotePath(path);
                setGuiPickerOpen(false);
              }}
              onClose={() => setGuiPickerOpen(false)}
            />
          )}
        </>
      )}

      <div className="row">
        <input
          placeholder="komenda RCON, np. @reloadsklep"
          value={reloadCommand}
          onChange={(e) => setReloadCommand(e.target.value)}
        />
        <button onClick={reload} disabled={busy || !profileId}>
          Wyślij RCON
        </button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
