import { ArrowDown, ArrowUp, HelpCircle, Save, Store, Terminal, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CopyRow, Fold, ListToggle, LoreEditor, StatusBar } from "../components/EditorBits";
import ItemRefPicker, { ItemDatalists, MATERIALS_LIST_ID } from "../components/ItemRefPicker";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import { showPrompt } from "../components/PromptModal";
import SlotGrid, { type SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpDeleteFile, sftpListDir, sftpReadFile, sftpWriteFile } from "../lib/api";
import { readSetting } from "../lib/coreSettings";
import { idFromName } from "../lib/cratesYaml";
import { loadItemCatalog } from "../lib/itemCatalogRemote";
import type { ItemRef } from "../lib/itemRef";
import { conventionalRoleIcon } from "../lib/materialIcons";
import { itemKey, parseDynamicPrices, parseSalesStats, type SalesStatEntry } from "../lib/shopStats";
import { shopTemplateChoices, shopTemplateFor, type ShopTemplate } from "../lib/shopTemplates";
import {
  BUTTON_LABELS,
  categoryBySlot,
  defaultSettings,
  detectSort,
  fromPerPiece,
  isLotted,
  matchesPriceFilter,
  moveCategoryTo,
  swapItems,
  moveBackFromPool,
  moveToPool,
  newCategory,
  newItem,
  parseCategory,
  parseShopSettings,
  perPiece,
  randomPick,
  type PriceFilter,
  ROLE_LABELS,
  sortItems,
  SCREEN_LABELS,
  SCREENS,
  serializeCategory,
  serializeShopSettings,
  shopProblems,
  type CategoryDraft,
  type MenuScreenDraft,
  type ShopItemDraft,
  type ShopSettingsDraft,
  type TuningDraft,
} from "../lib/shopYaml";
import { parseSpawnerConfig } from "../lib/spawnersYaml";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

interface ShopFile {
  settings: ShopSettingsDraft;
  cats: CategoryDraft[];
}

type Sel = { kind: "cat" } | { kind: "item"; pool: boolean; index: number };
type Tab = "cats" | "settings" | "stats" | "menu";

const EMPTY: ShopFile = { settings: defaultSettings(), cats: [] };
const GOAT_HORNS = ["ponder_goat_horn", "sing_goat_horn", "seek_goat_horn", "feel_goat_horn", "admire_goat_horn", "call_goat_horn", "yearn_goat_horn", "dream_goat_horn"];
// Ktory przycisk z "Ikonki przyciskow" odpowiada ktorej roli pola w ukladzie. "sort-sell"
// to tylko druga ikonka tego samego przycisku sortowania, wiec nie ma wlasnej roli.
const BUTTON_ROLES: Record<string, string> = {
  search: "SEARCH",
  exit: "EXIT",
  back: "NAV_BACK",
  prev: "NAV_PREV",
  next: "NAV_NEXT",
  sort: "SORT",
  "picker-back": "NAV_BACK",
};

const ROLES_BY_SCREEN: Record<string, string[]> = {
  "main-menu": ["CATEGORY_SLOT", "SEARCH", "EXIT", "FILLER"],
  "category-page": ["ITEM_SLOT", "SORT", "NAV_PREV", "NAV_NEXT", "NAV_BACK", "EXIT", "FILLER"],
  "buy-picker": ["AMOUNT_SLOT", "NAV_BACK", "FILLER"],
  "search-results": ["ITEM_SLOT", "NAV_BACK", "FILLER"],
};

/** Pola strojenia cen dynamicznych: nazwa w kodzie, podpis, krok i podpowiedź z wartością domyślną. */
const TUNING_FIELDS: Array<[keyof TuningDraft, string, string, string]> = [
  ["maxDropPerCycle", "Największy spadek skupu na cykl", "0.01", "0.05 = 5% (domyślnie 0.05)"],
  ["dropAtTop", "Ile razy mocniejszy spadek na maksimum", "0.1", "domyślnie 4.2"],
  ["recoverFromBelow", "Ile drogi wraca w cyklu ciszy", "0.05", "0.8 = 80% (domyślnie 0.8)"],
  ["risePerCycle", "Wzrost na cykl, gdy nikt nie sprzedaje", "0.005", "0.125 = 12,5% (domyślnie 0.125)"],
  ["quietThreshold", "Poniżej jakiej części normy to cisza", "0.05", "0.1 = 10% (domyślnie 0.1)"],
  ["cyclesToRise", "Ile cykli ciszy przed wzrostem", "1", "domyślnie 2"],
  ["cyclesFrozen", "Ile cykli cena stoi po zejściu z góry", "1", "domyślnie 2"],
  ["normLearnRate", "Jak szybko sklep zapomina stare cykle", "0.005", "0.02 ≈ tydzień (domyślnie 0.02)"],
];

function shopDir(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsShop`;
}

function serializeAll(f: ShopFile): string {
  return serializeShopSettings(f.settings) + f.cats.map((c) => `\n#### ${c.id}\n${serializeCategory(c)}`).join("");
}

/** Kategorie w kolejności z shop.yml, reszta na końcu. */
function ordered(settings: ShopSettingsDraft, cats: CategoryDraft[]): CategoryDraft[] {
  const inOrder = settings.categoryOrder.map((id) => cats.find((c) => c.id === id)).filter((c): c is CategoryDraft => !!c);
  return [...inOrder, ...cats.filter((c) => !settings.categoryOrder.includes(c.id))];
}

function fromTemplate(t: ShopTemplate): ShopFile {
  const settings = parseShopSettings(t["shop.yml"]);
  return { settings, cats: ordered(settings, Object.entries(t.categories).map(([id, text]) => parseCategory(id, text))) };
}

function plain(text: string): string {
  return text.replace(/&[0-9a-fk-or]/gi, "");
}

function refLabel(r: ItemRef): string {
  return r.custom != null ? `custom: ${r.custom}` : (r.item ?? "STONE").toLowerCase().replace(/_/g, " ");
}

/** Kwota ze znaczkiem, zeby bylo widac, ze to pieniadze, a nie ilosc sztuk. */
function money(n: number | null): string {
  if (n == null) return "-";
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + " $";
}

function ShopCommandsModal({ file, onClose }: { file: ShopFile; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Komendy Sklepu</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="muted small">
          Gracz: /shop, /sell (przedmiot z ręki), /sellall (wszystkie takie jak w ręce). Admin (uprawnienie mainplugins.shop.admin) - w konsoli bez „/”.
          Przedmiot w komendach to np. DIAMOND albo custom:spawner_zombie (podpowiada się klawiszem Tab).
        </p>
        <div className="ci-protip">
          <CopyRow cmd="/@shop reload" what="wczytuje sklep od nowa (aplikacja robi to sama po „Wyślij na serwer”)" />
          <CopyRow cmd="/@shop info <przedmiot>" what="ceny i stan rynku przedmiotu" />
          <CopyRow cmd="/@shop price <przedmiot> buy <kwota>" what="zmienia cenę kupna całej porcji (zapis w pliku kategorii)" />
          <CopyRow cmd="/@shop price <przedmiot> sell <kwota>" what="zmienia cenę skupu całej porcji" />
          <CopyRow cmd="/@shop event <przedmiot> 1.5" what="event: skup x1.5 na stałe, aż wpiszesz ... off" />
          <CopyRow cmd="/@shop event list" what="lista eventów" />
          <CopyRow cmd="/@shop reset <przedmiot>" what="skup przedmiotu wraca do normy" />
          <CopyRow cmd="/@shop resetall" what="wszystkie ceny skupu wracają do normy (potem /@shop confirm)" />
          <CopyRow cmd="/@shop rotation" what="co jest teraz w rotacji" />
          <CopyRow cmd="/@shop rotation force" what="losuje nową ofertę rotacji od razu" />
          <CopyRow cmd="/@shop stats" what="dzisiejsza sprzedaż (gdy statystyki są włączone)" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Twoje kategorie z rotacją
        </div>
        <div className="ci-protip">
          {file.cats.filter((c) => c.rotation?.enabled).length === 0 && <span className="muted small">Żadna kategoria nie ma rotacji.</span>}
          {file.cats
            .filter((c) => c.rotation?.enabled)
            .map((c) => (
              <CopyRow key={c.id} cmd={`/@shop rotation force ${c.id}`} what={<MinecraftTextPreview text={c.name} emptyLabel={c.id} />} />
            ))}
        </div>
      </div>
    </div>
  );
}

export default function ShopEditorPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [file, setFile] = useState<ShopFile>(EMPTY);
  const [saved, setSaved] = useState<ShopFile>(EMPTY);
  const [serverFile, setServerFile] = useState<ShopFile>(EMPTY);
  const [serverCatIds, setServerCatIds] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("cats");
  const [catId, setCatId] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>({ kind: "cat" });
  const [language, setLanguage] = useState("en");
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [stats, setStats] = useState<SalesStatEntry[]>([]);
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});
  const [statsFilter, setStatsFilter] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [rotationHelp, setRotationHelp] = useState(false);
  const [priceHelp, setPriceHelp] = useState(false);
  const [shopHelp, setShopHelp] = useState(false);
  const [fixedHelp, setFixedHelp] = useState(false);
  // Duze okienko "Jak dziala sklep" otwarte od razu na rozwinietych cenach dynamicznych.
  const [shopHelpDynamic, setShopHelpDynamic] = useState(false);
  const [poolPickCat, setPoolPickCat] = useState<string | null>(null);
  const [poolPickBack, setPoolPickBack] = useState(false);
  // Ktora liste widac w srodkowej kolumnie: stale przedmioty czy pula rotacji.
  const [showPool, setShowPool] = useState(false);
  // Lista w srodkowej kolumnie da sie zwinac (jak lista zadan w Questach).
  const [listOpen, setListOpen] = useState(true);
  // Co jest "podniesione" z listy obok siatki: kategoria albo rola pola (Szukaj, Zamknij, Tło).
  const [picked, setPicked] = useState<{ cat?: string; role?: string } | null>(null);
  // Kategoria pokazywana w podgladzie strony kategorii (jej przedmioty w polach).
  const [previewCat, setPreviewCat] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  // Liczba dopisywana do stawianego przycisku ilosci - zamiast osobnej listy pol pod spodem.
  const [amountValue, setAmountValue] = useState(64);
  // Material stawianego tla - wybierasz raz na dole i klikasz pola w siatce.
  const [fillerMaterial, setFillerMaterial] = useState("BLACK_STAINED_GLASS_PANE");
  const [sortBy, setSortBy] = useState<Record<string, { by: "buy" | "sell"; dir: "asc" | "desc" }>>({});
  const [priceFilter, setPriceFilter] = useState<Record<string, PriceFilter>>({});
  const [trashConfirm, setTrashConfirm] = useState<string | null>(null);
  const [screen, setScreen] = useState("main-menu");
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  const unsaved = useMemo(() => serializeAll(file) !== serializeAll(saved), [file, saved]);
  const notSent = useMemo(() => serializeAll(saved) !== serializeAll(serverFile), [saved, serverFile]);
  useDirtyTracking(unsaved || notSent);
  const category = file.cats.find((c) => c.id === catId) ?? null;

  useEffect(() => {
    setTrashConfirm(null);
  }, [catId, sel, tab]);

  async function load(pid: string, path: string) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    const base = path.replace(/\/+$/, "");
    const dir = shopDir(path);
    let lang = "en";
    try {
      lang = readSetting(await sftpReadFile(pid, `${base}/MainpluginsCore/config.yml`), "language") ?? "en";
    } catch {
      // brak configu core - zostaje angielski
    }
    setLanguage(lang);
    try {
      const settings = parseShopSettings(await sftpReadFile(pid, `${dir}/shop.yml`));
      let ids: string[] = [];
      try {
        ids = (await sftpListDir(pid, `${dir}/categories`)).filter((e) => !e.is_dir && e.name.endsWith(".yml")).map((e) => e.name.slice(0, -4));
      } catch {
        ids = [];
      }
      const cats: CategoryDraft[] = [];
      for (const id of ids) cats.push(parseCategory(id, await sftpReadFile(pid, `${dir}/categories/${id}.yml`)));
      const f = { settings, cats: ordered(settings, cats) };
      setFile(f);
      setSaved(f);
      setServerFile(f);
      setServerCatIds(ids);
      setCatId(f.cats[0]?.id ?? null);
      setSel({ kind: "cat" });
    } catch {
      // Na serwerze nie ma jeszcze nowego sklepu - pokazujemy Mały (jak plugin przy pierwszym starcie).
      const f = fromTemplate(shopTemplateFor(lang));
      setFile(f);
      setSaved(f);
      setServerFile(EMPTY);
      setServerCatIds([]);
      setCatId(f.cats[0]?.id ?? null);
      setSel({ kind: "cat" });
      setStatus(`Na serwerze nie ma jeszcze shop.yml - wczytano domyślny sklep (język: ${lang}). Kliknij „Wyślij na serwer”, żeby go tam zapisać.`);
    } finally {
      setBusy(false);
    }
    refreshStats(pid, path);
    const ids = new Set<string>();
    try {
      (await loadItemCatalog(pid, path)).items.forEach((it) => ids.add(it.id));
    } catch {
      // katalog opcjonalny
    }
    try {
      parseSpawnerConfig(await sftpReadFile(pid, `${base}/MainpluginsSpawners/spawnery-typy.yml`)).typy.forEach((t) =>
        ids.add(`spawner_${t.id.toLowerCase()}`)
      );
    } catch {
      // bez Spawnerów nie ma ich na liście
    }
    ["GENERATOR_BRUK_T1", "GENERATOR_KRUCHY_T1"].forEach((g) => ids.add(g));
    setCustomIds([...ids].sort());
  }

  async function refreshStats(pid = profileId, path = pluginsPath) {
    if (!pid || !path) return;
    const dir = shopDir(path);
    try {
      setStats(parseSalesStats(await sftpReadFile(pid, `${dir}/stats.yml`)));
    } catch {
      setStats([]);
    }
    try {
      setMultipliers(parseDynamicPrices(await sftpReadFile(pid, `${dir}/prices.yml`)));
    } catch {
      setMultipliers({});
    }
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
    const warnings = shopProblems(toSend.settings, toSend.cats);
    if (warnings.length && !window.confirm(`Uwaga:\n- ${warnings.join("\n- ")}\n\nWysłać mimo to?`)) return;
    const removed = serverCatIds.filter((id) => !toSend.cats.some((c) => c.id === id));
    if (removed.length && !window.confirm(`Z serwera zostaną usunięte pliki kategorii: ${removed.join(", ")}. Kontynuować?`)) return;
    setBusy(true);
    setStatus(null);
    const dir = shopDir(pluginsPath);
    try {
      await sftpWriteFile(profileId, `${dir}/shop.yml`, serializeShopSettings(toSend.settings));
      for (const c of toSend.cats) await sftpWriteFile(profileId, `${dir}/categories/${c.id}.yml`, serializeCategory(c));
      for (const id of removed) await sftpDeleteFile(profileId, `${dir}/categories/${id}.yml`);
      setServerFile(toSend);
      setServerCatIds(toSend.cats.map((c) => c.id));
      let msg = "Wysłano na serwer.";
      try {
        const r = await rconSendCommand(profileId, "@shop reload");
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
    const t = shopTemplateChoices(language).find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm(`Wczytać szablon „${t.label}”? Sklep w edytorze zostanie zastąpiony (na serwerze nic się nie zmieni, dopóki nie wyślesz).`)) return;
    const f = fromTemplate(t.template);
    setFile(f);
    setCatId(f.cats[0]?.id ?? null);
    setSel({ kind: "cat" });
    setTab("cats");
    setStatus(`Wczytano szablon „${t.label}”. Kliknij „Zapisz”, a potem „Wyślij na serwer”.`);
  }

  // ---- zmiany ----

  function setSettings(patch: Partial<ShopSettingsDraft>) {
    setFile({ ...file, settings: { ...file.settings, ...patch } });
  }

  /**
   * Kategorie i menu to dwie różne rzeczy: `cats` to wszystko, co jest w sklepie, a
   * `categoryOrder` to te, które mają ikonkę w menu (i w jakiej kolejności). Kategoria
   * poza menu dalej działa - plugin ją wczytuje, tylko gracz nie widzi jej kafelka.
   * Nowa kategoria wchodzi do menu, skasowana z niego wypada; reszta zostaje jak była.
   */
  function setCats(cats: CategoryDraft[]) {
    const ids = cats.map((c) => c.id);
    const kept = file.settings.categoryOrder.filter((id) => ids.includes(id));
    const added = ids.filter((id) => !file.settings.categoryOrder.includes(id));
    setFile({ ...file, cats, settings: { ...file.settings, categoryOrder: [...kept, ...added] } });
  }

  /** Kategoria znika z menu, ale zostaje w sklepie - można ją później postawić z powrotem. */
  function hideFromMenu(id: string) {
    setSettings({ categoryOrder: file.settings.categoryOrder.filter((x) => x !== id) });
  }

  function updateCategory(id: string, patch: Partial<CategoryDraft>) {
    setFile({ ...file, cats: file.cats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  /** Przeniesienie pozycji ze stałych do puli rotacji, jako łatka do updateCategory. */
  function movedToPool(c: CategoryDraft, indexes: number[]): Partial<CategoryDraft> {
    const next = moveToPool(c, indexes);
    return { items: next.items, rotation: next.rotation };
  }

  /** Cofnięcie: pozycja z puli wraca na stałą listę. Zaznaczenie wraca na kategorię, bo numery się przesuwają. */
  function moveBack(c: CategoryDraft, indexes: number[]) {
    const next = moveBackFromPool(c, indexes);
    updateCategory(c.id, { items: next.items, rotation: next.rotation });
    setSel({ kind: "cat" });
  }

  function listOf(c: CategoryDraft, pool: boolean): ShopItemDraft[] {
    return pool ? (c.rotation?.pool ?? []) : c.items;
  }

  function setList(c: CategoryDraft, pool: boolean, list: ShopItemDraft[]) {
    if (pool && c.rotation) updateCategory(c.id, { rotation: { ...c.rotation, pool: list } });
    else if (!pool) updateCategory(c.id, { items: list });
  }

  function updateItem(c: CategoryDraft, pool: boolean, index: number, patch: Partial<ShopItemDraft>) {
    setList(c, pool, listOf(c, pool).map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function moveItem(c: CategoryDraft, pool: boolean, index: number, dir: -1 | 1) {
    const list = [...listOf(c, pool)];
    const to = index + dir;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    setList(c, pool, list);
    setSel({ kind: "item", pool, index: to });
  }

  function removeItem(c: CategoryDraft, pool: boolean, index: number) {
    setList(c, pool, listOf(c, pool).filter((_, i) => i !== index));
    setSel({ kind: "cat" });
  }

  /**
   * Przełącznik układania listy. Pierwsze kliknięcie układa od najtańszego, kolejne
   * odwraca. Kolejność w pliku to kolejność w menu sklepu, więc zmienia to widok w grze.
   */
  function toggleSort(c: CategoryDraft, pool: boolean, by: "buy" | "sell") {
    const key = `${c.id}:${pool}`;
    const cur = sortBy[key];
    const dir: "asc" | "desc" = cur && cur.by === by && cur.dir === "asc" ? "desc" : "asc";
    setList(c, pool, sortItems(listOf(c, pool), by, dir));
    setSortBy({ ...sortBy, [key]: { by, dir } });
    setSel({ kind: "cat" });
  }

  /** Wąski pasek nad listą: układanie i filtr obok siebie, żeby nie zjadał miejsca. */
  function listToolbar(c: CategoryDraft, pool: boolean) {
    const key = `${c.id}:${pool}`;
    const cur = sortBy[key] ?? detectSort(listOf(c, pool));
    const filter = priceFilter[key] ?? "all";
    const style = { fontSize: "0.72rem", padding: "0.12rem 0.4rem" } as const;
    const sortBtn = (by: "buy" | "sell", label: string) => {
      const on = cur?.by === by;
      const down = on && cur.dir === "desc";
      return (
        <button
          type="button"
          style={style}
          className={on ? "ci-publish" : undefined}
          title={down ? "Od najdroższego - kliknij, żeby odwrócić" : "Od najtańszego - kliknij drugi raz, żeby odwrócić"}
          onClick={() => toggleSort(c, pool, by)}
        >
          {label} {on ? (down ? "↓" : "↑") : ""}
        </button>
      );
    };
    const filterBtn = (f: PriceFilter, label: string, title: string) => (
      <button
        type="button"
        style={style}
        className={filter === f ? "ci-publish" : undefined}
        title={title}
        onClick={() => setPriceFilter({ ...priceFilter, [key]: f })}
      >
        {label}
      </button>
    );
    return (
      <div className="row" style={{ gap: "0.2rem", margin: "0.15rem 0 0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted small">Ułóż:</span>
        {sortBtn("buy", "kupno")}
        {sortBtn("sell", "skup")}
        <span className="muted small" style={{ marginLeft: "0.4rem" }}>
          Pokaż:
        </span>
        {filterBtn("all", "wszystko", "Cała lista")}
        {filterBtn("buy", "kupno", "Tylko do kupienia - sklep tego nie skupuje")}
        {filterBtn("sell", "skup", "Tylko do sprzedania - kupić się nie da")}
        {filterBtn("both", "oba", "Da się i kupić, i sprzedać")}
      </div>
    );
  }

  /** Ile przedmiotów widać przy obecnym filtrze. */
  function shownCount(c: CategoryDraft, pool: boolean): number {
    const f = priceFilter[`${c.id}:${pool}`] ?? "all";
    return listOf(c, pool).filter((it) => matchesPriceFilter(it, f)).length;
  }

  function addItem(c: CategoryDraft, pool: boolean) {
    const list = listOf(c, pool);
    setList(c, pool, [...list, newItem({ item: "STONE" })]);
    setSel({ kind: "item", pool, index: list.length });
  }

  async function addCategory() {
    const name = (await showPrompt("Nazwa nowej kategorii (może mieć spacje, np. Rudy i minerały):"))?.trim();
    if (!name) return;
    const id = idFromName(name, file.cats.map((c) => c.id));
    setCats([...file.cats, newCategory(id, `&e&l${name}`)]);
    setCatId(id);
    setSel({ kind: "cat" });
    setTab("cats");
  }

  /** Strzałki przestawiają kolejność w menu (kategoria poza menu wraca na koniec). */
  function moveCategory(id: string, dir: -1 | 1) {
    const order = file.settings.categoryOrder;
    const i = order.indexOf(id);
    if (i < 0) {
      setSettings({ categoryOrder: [...order, id] });
      return;
    }
    const to = i + dir;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[i], next[to]] = [next[to], next[i]];
    setSettings({ categoryOrder: next });
  }

  function removeCategory(id: string) {
    const cats = file.cats.filter((c) => c.id !== id);
    setCats(cats);
    setCatId(cats[0]?.id ?? null);
    setSel({ kind: "cat" });
  }

  // ---- małe kawałki ----

  function iconOf(r: ItemRef) {
    return r.custom != null ? (
      <span className="ci-item-icon muted small" title={`custom: ${r.custom}`}>
        ✦
      </span>
    ) : (
      <MaterialIcon material={r.item ?? "STONE"} iconPackDir={iconPackDir} />
    );
  }

  function trashButton(key: string, title: string) {
    return (
      <button type="button" className="ci-trash" title={title} onClick={() => setTrashConfirm(key)}>
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    );
  }

  function confirmRow(question: string, run: () => void) {
    return (
      <div className="ci-actions">
        <span className="ci-actions-question">{question}</span>
        <button
          type="button"
          className="ci-danger"
          onClick={() => {
            run();
            setTrashConfirm(null);
          }}
        >
          Tak, usuń
        </button>
        <button type="button" onClick={() => setTrashConfirm(null)}>
          Anuluj
        </button>
      </div>
    );
  }

  function priceText(it: ShopItemDraft): string {
    const parts: string[] = [];
    if (it.buy != null) parts.push(`kupno ${money(perPiece(it.buy, it.amount))} za szt.`);
    if (it.sell != null) parts.push(isLotted(it) && it.sellAmount > 1 ? `skup ${money(it.sell)} za ${it.sellAmount} szt.` : `skup ${money(it.sell)}`);
    return parts.join(", ") || "brak cen";
  }

  function itemRow(c: CategoryDraft, pool: boolean, it: ShopItemDraft, i: number) {
    const key = `item:${c.id}:${pool}:${i}`;
    if (trashConfirm === key) return <div key={key}>{confirmRow("Usunąć tę pozycję?", () => removeItem(c, pool, i))}</div>;
    const active = sel.kind === "item" && sel.pool === pool && sel.index === i;
    return (
      <div key={key} className="ci-cat-row">
        <button type="button" className={`ci-item${active ? " active" : ""}`} onClick={() => setSel({ kind: "item", pool, index: i })}>
          {iconOf(it.ref)}
          <span className="ci-item-text">
            <span className="ci-item-name">
              {it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref)}
            </span>
            <span className="small muted">{priceText(it)}</span>
            {it.buy != null && it.sell != null && it.sell / it.sellAmount >= it.buy / it.amount && (
              <span className="ci-badges">
                <span className="ci-badge warn">skup ≥ kupno</span>
              </span>
            )}
          </span>
        </button>
        {pool && (
          <button type="button" title="Wróć do stałych - przedmiot znów będzie w sklepie zawsze" onClick={() => moveBack(c, [i])}>
            <Undo2 size={14} strokeWidth={1.75} />
          </button>
        )}
        {trashButton(key, "Usuń pozycję")}
      </div>
    );
  }

  /** Mnożnik z pliku -> procent zmiany pokazywany w aplikacji (0.5 -> 50, 1.5 -> 50). */
  function pct(multiplier: number) {
    return Math.abs(Math.round((multiplier - 1) * 100));
  }

  /** Procent zmiany -> mnożnik do pliku (-50 -> 0.5, +50 -> 1.5). */
  function fromPct(percent: number) {
    return Math.round((1 + percent / 100) * 100) / 100;
  }

  /** Mnożnik -> "+50" / "-20" (tak samo jak /@shop event). */
  function signedPct(multiplier: number) {
    const p = Math.round((multiplier - 1) * 100);
    return (p >= 0 ? "+" : "") + p;
  }

  function numberInput(value: number | null, onChange: (n: number) => void, step = "0.01", min = 0) {
    return (
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        style={{ width: "8rem" }}
      />
    );
  }

  // ---- prawy panel: pozycja ----

  function renderItem(c: CategoryDraft, pool: boolean, index: number) {
    const it = listOf(c, pool)[index];
    if (!it) return null;
    const set = (patch: Partial<ShopItemDraft>) => updateItem(c, pool, index, patch);
    const lotted = isLotted(it);
    const rounding = file.settings.rounding;
    return (
      <>
        <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          {iconOf(it.ref)} {it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref)}
          <span className="muted small">{pool ? "(pula rotacji)" : ""}</span>
          <span style={{ flex: 1 }} />
          {pool && (
            <button type="button" title="Przedmiot wraca na stałą listę kategorii" onClick={() => moveBack(c, [index])}>
              Wróć do stałych
            </button>
          )}
          <button type="button" title="Wyżej" onClick={() => moveItem(c, pool, index, -1)} disabled={index === 0}>
            <ArrowUp size={14} />
          </button>
          <button type="button" title="Niżej" onClick={() => moveItem(c, pool, index, 1)} disabled={index === listOf(c, pool).length - 1}>
            <ArrowDown size={14} />
          </button>
        </h2>
        <p className="muted small">Klucz w komendach: {itemKey(it.ref)}</p>
        <Fold title="Przedmiot" open>
          <ItemRefPicker value={it.ref} onChange={(r) => set({ ref: r.custom != null ? { custom: r.custom } : { item: r.item } })} materials={allMaterials} customIds={customIds} iconPackDir={iconPackDir} />
          {it.ref.custom != null && (
            <p className="muted small">Przedmiot z katalogu itemów albo z innego pluginu (np. spawner_zombie ze Spawnerów). Bez tego pluginu pozycja się nie pokaże.</p>
          )}
          <label>
            Własna nazwa w sklepie <span className="muted small">(puste = nazwa z gry, w języku gracza)</span>
            <MinecraftTextInput value={it.name} onChange={(v) => set({ name: v })} placeholder="np. &d&lBruk" />
          </label>
          <div className="ci-section-title">Opis na ikonce</div>
          <LoreEditor value={it.lore} onChange={(l) => set({ lore: l })} />
          <p className="muted small">Nazwa i opis są tylko na ikonce w sklepie - kupiony przedmiot jest zwykły.</p>
          {it.ref.item === "GOAT_HORN" && (
            <label>
              Dźwięk rogu
              <select value={it.instrument} onChange={(e) => set({ instrument: e.target.value })}>
                <option value="">zwykły</option>
                {GOAT_HORNS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Fold>
        <Fold title="Cena" open>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={lotted}
              onChange={(e) => {
                if (e.target.checked) set({ amount: 64, sellAmount: 64, buy: fromPerPiece(it.buy, 64), sell: fromPerPiece(it.sell, 64) });
                else set({ amount: 1, sellAmount: 1, buy: perPiece(it.buy, it.amount), sell: perPiece(it.sell, it.sellAmount) });
              }}
            />
            Skup po kilka sztuk naraz (kupno zawsze idzie po sztuce)
            <button type="button" title="Po co to jest" aria-label="Po co to jest" onClick={() => setPriceHelp(true)}>
              <HelpCircle size={16} strokeWidth={1.75} />
            </button>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={it.buy != null}
              // Cena w pliku jest za cały stack, a pole w aplikacji za sztukę - startowa "1" musi
              // być za sztukę, inaczej przy stacku 64 pokazywało się 0.02.
              onChange={(e) => set({ buy: e.target.checked ? fromPerPiece(20, it.amount) : null })}
            />
            Da się kupić
          </label>
          {it.buy != null &&
            (lotted ? (
              <div className="row" style={{ alignItems: "center" }}>
                Kupno za sztukę {numberInput(perPiece(it.buy, it.amount), (n) => set({ buy: fromPerPiece(n, it.amount) }))}
                <span className="muted small">$</span>
                <span className="muted small">porcja</span>
                {numberInput(
                  it.amount,
                  (n) => {
                    const amount = Math.max(1, Math.floor(n));
                    set({ amount, buy: fromPerPiece(perPiece(it.buy, it.amount), amount) });
                  },
                  "1",
                  1
                )}
                <span className="muted small">szt. = {money(it.buy)} za tyle sztuk</span>
              </div>
            ) : (
              <label>
                Cena kupna za sztukę {numberInput(it.buy, (n) => set({ buy: n }))} <span className="muted small">$</span>
              </label>
            ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={it.sell != null}
              // Startowy skup to polowa ceny kupna (za sztuke), zeby nowy przedmiot od razu byl
              // sensowny i nie zapalal ostrzezenia "skup >= kupno". Bez ceny kupna: 10 za sztuke.
              onChange={(e) =>
                set({ sell: e.target.checked ? fromPerPiece((perPiece(it.buy, it.amount) ?? 20) / 2, it.sellAmount) : null })
              }
            />
            Da się sprzedać
          </label>
          {it.sell != null &&
            (lotted ? (
              <div className="row" style={{ alignItems: "center" }}>
                Skup: {numberInput(it.sell, (n) => set({ sell: n }))} <span className="muted small">$</span> za{" "}
                {numberInput(it.sellAmount, (n) => set({ sellAmount: Math.max(1, Math.floor(n)) }), "1", 1)} szt.
                <span className="muted small">czyli {money(perPiece(it.sell, it.sellAmount))} za sztukę</span>
              </div>
            ) : (
              <label>
                Cena skupu za sztukę {numberInput(it.sell, (n) => set({ sell: n }))} <span className="muted small">$</span>
              </label>
            ))}
          <label className="checkbox">
            <input type="checkbox" checked={!it.dynamic} onChange={(e) => set({ dynamic: !e.target.checked })} />
            Cena stała - ceny dynamiczne omijają ten przedmiot
            <button type="button" title="Po co to jest" aria-label="Po co to jest" onClick={() => setFixedHelp(true)}>
              <HelpCircle size={16} strokeWidth={1.75} />
            </button>
          </label>
          <p className="muted small">
            {rounding === "whole"
              ? "Sklep liczy w pełnych złotówkach (Ustawienia): niepełna porcja zaokrągla się w górę do złotówki."
              : "Sklep liczy z groszami (Ustawienia)."}{" "}
            Gracz sprzedaje tylko pełne porcje - reszta zostaje mu w ekwipunku.
          </p>
          {it.buy != null && it.sell != null && it.sell / it.sellAmount >= it.buy / it.amount && (
            <p className="ci-badge warn">Skup za sztukę jest co najmniej taki jak kupno - gracze zarobią na kupowaniu i sprzedawaniu w kółko.</p>
          )}
        </Fold>
      </>
    );
  }

  // ---- prawy panel: kategoria ----

  function renderCategory(c: CategoryDraft) {
    const r = c.rotation;
    return (
      <>
        <h2>
          <MinecraftTextPreview text={c.name} emptyLabel={c.id} />{" "}
          <span className="muted small" title="Nazwa pliku na serwerze">
            plik: categories/{c.id}.yml
          </span>
        </h2>
        <Fold title="Nazwa i ikonka" open>
          <label>
            Nazwa
            <MinecraftTextInput value={c.name} onChange={(v) => updateCategory(c.id, { name: v })} placeholder="&e&lNazwa kategorii" />
          </label>
          <div className="ci-section-title">Ikonka w menu głównym</div>
          <ItemRefPicker value={c.icon} onChange={(ref) => updateCategory(c.id, { icon: ref.custom != null ? { custom: ref.custom } : { item: ref.item } })} materials={allMaterials} customIds={customIds} iconPackDir={iconPackDir} />
        </Fold>
        <Fold title="Rotacja (przedmioty wymieniają się co kilka dni)" open={r != null}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={r?.enabled ?? false}
              onChange={(e) =>
                updateCategory(c.id, {
                  rotation: r ? { ...r, enabled: e.target.checked } : { enabled: true, show: 5, everyDays: 14, announce: true, pool: [], raw: {} },
                })
              }
            />
            Włącz rotację
          </label>
          <div className="row" style={{ alignItems: "center" }}>
            <span className="muted small" style={{ flex: 1 }}>
              Przedmioty w tej kategorii wymieniają się co kilka dni - część jest do kupienia tylko wtedy, gdy sklep je wylosuje.
            </span>
            <button type="button" title="Po co jest rotacja" aria-label="Po co jest rotacja" onClick={() => setRotationHelp(true)}>
              <HelpCircle size={16} strokeWidth={1.75} />
            </button>
          </div>
          {r && (
            <>
              <label>
                Ilość przedmiotów w rotacji {numberInput(r.show, (n) => updateCategory(c.id, { rotation: { ...r, show: Math.max(1, Math.floor(n)) } }), "1", 1)}
              </label>
              <label>
                Co ile dni nowa oferta {numberInput(r.everyDays, (n) => updateCategory(c.id, { rotation: { ...r, everyDays: Math.max(1, Math.floor(n)) } }), "1", 1)}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={r.announce}
                  onChange={(e) => updateCategory(c.id, { rotation: { ...r, announce: e.target.checked } })}
                />
                Ogłoś na czacie, gdy oferta się zmieni
              </label>
              <div className="ci-section-title">Pula - z czego sklep losuje</div>
              <p className="muted small">
                Pula ma {r.pool.length} przedmiotów, stałych jest {c.items.length}. Przedmioty z puli edytujesz na liście w środku, pod stałymi.
              </p>
              <div className="row" style={{ alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setPoolPickBack(false);
                    setPoolPickCat(c.id);
                  }}
                  disabled={c.items.length === 0}
                >
                  Wybierz z kategorii...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPoolPickBack(true);
                    setPoolPickCat(c.id);
                  }}
                  disabled={r.pool.length === 0}
                >
                  Cofnij z puli...
                </button>
                <button
                  type="button"
                  title="Losuje 5 przedmiotów z kategorii i przenosi je do puli"
                  onClick={() => updateCategory(c.id, movedToPool(c, randomPick(5, c.items.length)))}
                  disabled={c.items.length === 0}
                >
                  Wypełnij losowo
                </button>
              </div>
            </>
          )}
        </Fold>
      </>
    );
  }

  // ---- okienka rotacji ----

  /** Ogolne wytlumaczenie: z czego sklep sie sklada i jakie ma systemy. */
  function shopHelpModal() {
    const close = () => {
      setShopHelp(false);
      setShopHelpDynamic(false);
    };
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Jak działa sklep</h2>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p className="muted small">
            Gracz wpisuje /shop i dostaje menu z kategoriami. Wchodzi w kategorię, klika przedmiot, wybiera ilość i kupuje. Sprzedaje
            przedmiotem trzymanym w ręce.
          </p>
          <p>
            <b>Kategorie i przedmioty.</b> Każda kategoria to osobny plik. Kolejność kategorii i przedmiotów w aplikacji to ta sama
            kolejność, którą gracz widzi w menu.
          </p>
          <p>
            <b>Ceny.</b> Kupno zawsze idzie po sztuce, skup możesz ustawić hurtem (całymi porcjami). W Ustawieniach wybierasz, czy sklep
            liczy w pełnych złotówkach, czy z groszami.
          </p>
          <Fold title="Ceny - szczegóły">
            <p className="small">
              W pliku cena zapisana jest za całą porcję (np. 640 za 64 sztuki), a aplikacja pokazuje ją za sztukę i sama przelicza. Gdy
              gracz kupuje mniej niż porcję, sklep liczy proporcjonalnie i zaokrągla w górę - nigdy na swoją niekorzyść.
            </p>
            <p className="small">
              „Pełne złotówki” znaczy, że najniższa możliwa cena to 1 zł, więc tanie rzeczy lepiej sprzedawać większymi porcjami. Przy
              „groszach” minimum to 0,01.
            </p>
            <p className="small">
              Skup ma jeszcze jeden bezpiecznik: w <b>Ustawieniach</b> jest sufit „skup najwyżej taka część ceny kupna” (domyślnie 0,9). Nawet
              gdy ceny dynamiczne podbiją skup, nigdy nie przebije 90% ceny kupna - inaczej gracze zarabialiby, kupując i od razu
              sprzedając.
            </p>
          </Fold>
          <p>
            <b>Ceny dynamiczne.</b> Sklep sam obniża skup tego, co gracze masowo sprzedają, i podnosi go z powrotem, gdy przestaną.
            Granice (o ile może spaść i urosnąć) ustawiasz w <b>Ustawieniach</b>, tam też włączasz ogłoszenia na czacie.
          </p>
          <Fold title="Ceny dynamiczne - szczegóły" open={shopHelpDynamic}>
            <p className="small">
              Każdy przedmiot ma własną cenę skupu i własną historię - to, co dzieje się z diamentem, nie rusza ceny bruku, nawet jeśli
              leżą w tej samej kategorii. Cena chodzi w widełkach z Ustawień, domyślnie od połowy do półtora raza zwykłej ceny.
              Uwaga: rusza się wyłącznie <b>skup</b>, czyli ile sklep płaci graczowi. To, ile gracz płaci przy kupowaniu, nie zmienia się
              samo nigdy - stoi tak, jak wpisałeś w cenniku.
            </p>
            <p className="small">
              Sklep sam liczy, ile danej rzeczy schodzi <b>normalnie w ciągu godziny</b> - to jest „norma”. Co godzinę porównuje z nią
              to, co gracze naprawdę sprzedali, i na tej podstawie rusza ceną. Poniżej wszystko na przykładzie diamentu, którego zwykła
              cena skupu to 100 $, przy domyślnych ustawieniach.
            </p>

            <div className="ci-section-title">Gracze sprzedają dużo</div>
            <p className="small">
              Cena spada najwyżej o 5% na godzinę, czyli ze 100 $ na 95 $, potem 90 $ i tak dalej. Spadek jest tym mocniejszy, im wyżej
              cena stoi: na samej górze (150 $) schodzi około czterech razy szybciej, więc <b>powrót ze szczytu do zwykłej ceny zajmuje
              jakieś trzy godziny</b> ciągłego sprzedawania. Na dole zatrzymuje się na 50 $ i niżej nie zejdzie.
            </p>
            <p className="small">
              Ile spadnie, zależy od tego, jak bardzo sprzedaż przebiła normę - ale nie wprost. Dwa razy większa sprzedaż nie znaczy dwa
              razy większego spadku, bo inaczej jeden gracz z wielkim zapasem ustalałby cenę dla całego serwera. Sama transakcja nie ma
              żadnego limitu: nawet 3000 sztuk naraz idzie w całości po cenie z tej godziny.
            </p>

            <div className="ci-section-title">Nikt nie sprzedaje</div>
            <p className="small">
              „Cisza” to godzina, w której zeszło mniej niż 10% normy. Wtedy:
            </p>
            <ul className="small">
              <li>
                <b>Jeśli cena była zbita</b> (np. 60 $), w godzinę odrabia 80% drogi do zwykłej - czyli wraca do jakichś 92 $, a po
                drugiej godzinie jest praktycznie równo. Powrót jest szybki celowo, bo w realnej grze zawsze ktoś coś sprzedaje i
                inaczej cena nigdy by nie wstała.
              </li>
              <li>
                <b>Jeśli cena stoi na zwykłej</b>, przez pierwsze dwie godziny ciszy nic się nie dzieje. Dopiero potem zaczyna rosnąć,
                po 12,5% na godzinę: 112 $, 125 $, 137 $, 150 $ - czyli <b>cztery godziny od zwykłej ceny na szczyt</b>. To zachęta dla
                graczy: nikt tego nie przynosi, więc opłaca się przynieść.
              </li>
              <li>
                <b>Po zejściu ze szczytu</b> cena zatrzymuje się na zwykłej na dwie godziny, zanim zwykły ruch zepchnie ją niżej - żeby
                nie skakała w górę i w dół co chwilę.
              </li>
            </ul>

            <div className="ci-section-title">Zabezpieczenia - czego sklep nie przekroczy</div>
            <p className="small">
              Cena skupu nigdy nie ucieka w kosmos ani nie spada do zera. Pilnują tego trzy rzeczy:
            </p>
            <ul className="small">
              <li>
                <b>Widełki</b> - cena chodzi tylko między dolną a górną granicą z <b>Ustawień</b> (domyślnie od połowy do półtora raza
                zwykłej ceny). Przy diamencie za 100 $ znaczy to, że skup nie zejdzie poniżej 50 $ i nie przebije 150 $, choćby gracze
                sprzedawali go bez przerwy albo nie sprzedawali wcale. Obie granice ustawiasz sam.
              </li>
              <li>
                <b>Sufit skupu</b> - skup nigdy nie da więcej niż ustalona część ceny kupna (domyślnie 90%). To blokada na „kup w sklepie
                taniej, sprzedaj do sklepu drożej”: bez niej wystarczyłoby kupować i od razu sprzedawać, żeby robić pieniądze z niczego.
                Ten sufit działa <b>nawet wtedy, gdy ceny dynamiczne albo event podbiją skup</b> - wtedy cena po prostu zatrzyma się na
                90% kupna.
              </li>
              <li>
                <b>Cena stała</b> - przełącznik przy przedmiocie, który całkiem wyłącza wahania. Dla rzeczy farmowalnych, które i tak
                osiadłyby na dnie.
              </li>
            </ul>
            <p className="small">
              Do tego aplikacja i plugin pilnują Cię przy samym ustawianiu cen: gdy wpiszesz skup równy albo wyższy od kupna, aplikacja
              zapali czerwone ostrzeżenie przy przedmiocie i wypisze problem na dole listy, a komenda <code>/@shop price</code> taką
              zmianę wprost odrzuci.
            </p>

            <div className="ci-section-title">Drobiazgi, które pilnują uczciwości</div>
            <p className="small">
              Próg ciszy jest zapamiętywany w chwili, gdy cisza się zaczyna. Bez tego kurczyłby się razem z normą (a norma przy braku
              sprzedaży maleje) i cisza nigdy by się nie kończyła. Jedna przypadkowa transakcja pod koniec ciszy tylko cofa licznik o
              godzinę, zamiast kasować cały postęp. Nowy przedmiot przy pierwszej sprzedaży jeszcze nie rusza ceny - ta sprzedaż ustawia
              mu normę, bo nie ma jeszcze z czym porównywać.
            </p>

            <div className="ci-section-title">Reset co 14 dni</div>
            <p className="small">
              Wszystkie ceny wracają do zwykłych naraz, z ogłoszeniem na czacie (do wyłączenia w <b>Ustawieniach</b>). Normy zostają - sklep nie
              zapomina, ile czego zwykle schodzi. Przedmioty z trwającym eventem reset pomija.
            </p>
            <p className="small">
              14 dni to tylko wartość domyślna - w <b>Ustawieniach</b>, przy „co ile dni wszystkie ceny wracają do normy”, wpisujesz co chcesz:
              częściej, żeby rynek często startował od zera, albo rzadziej, żeby ceny dłużej pamiętały, co się działo.
            </p>

            <div className="ci-section-title">Tempo da się zmienić</div>
            <p className="small">
              Te wszystkie liczby - godzinny cykl, 5% spadku, 12,5% wzrostu, dwie godziny ciszy - to gotowy zestaw ustawiony pod
              <b> dość szybką grę</b>, gdzie ceny zauważalnie ruszają się w ciągu jednego wieczoru. Jeśli wolisz, żeby rynek zmieniał się
              wolniej i spokojniej, zmienisz to sam w <b>Ustawieniach</b>: „co ile minut przeliczać” wydłuż np. do 180, a w sekcji
              <b> Strojenie (zaawansowane)</b> zmniejsz spadek i wzrost na cykl. W drugą stronę też działa - da się ustawić rynek, który
              szaleje z godziny na godzinę.
            </p>

            <div className="ci-section-title">Czego ten system nie zrobi</div>
            <p className="small">
              Rzeczy, które da się farmić bez końca (bruk, drewno, dropy ze spawnerów), i tak osiądą na dole - farma sprzedaje niezależnie
              od ceny, bo nic jej nie kosztuje. Dla nich lepiej zaznaczyć przy przedmiocie „cena stała”. Da się też grać pod system:
              wstrzymać sprzedaż, doczekać szczytu i wysypać zapas, albo poczekać na reset. To świadoma zgoda, nie błąd.
            </p>
          </Fold>
          <p>
            <b>Eventy.</b> Komendą <code>/@shop event</code> podbijasz skup wybranego przedmiotu na jakiś czas - przydaje się na akcje
            typu „weekend z diamentami”.
          </p>
          <Fold title="Eventy - szczegóły">
            <p className="small">
              Event ustawia cenę skupu ręcznie i <b>blokuje ją</b> - dopóki trwa, ceny dynamiczne tego przedmiotu nie ruszają, choćby
              gracze znieśli pół świata. Podajesz procent (np. +50) i opcjonalnie czas; bez czasu trwa, aż go wyłączysz.
            </p>
            <p className="small">
              <code>/@shop event list</code> pokazuje trwające eventy, <code>/@shop reset</code> zdejmuje event z jednego przedmiotu, a
              <code>/@shop resetall</code> przywraca wszystkie ceny do normy. Ogłoszenie na czacie przy starcie i końcu eventu włączasz w
              <b>Ustawieniach</b>.
            </p>
            <p className="small">
              Wyłączenie eventu przywraca zwykłą cenę <b>od razu</b>, a nie stopniowo - inaczej podbite ceny ciągnęłyby się jeszcze
              godzinami po ogłoszeniu końca akcji. Globalny reset cen pomija przedmioty zablokowane eventem, więc trwająca akcja nie
              zostanie skasowana w połowie.
            </p>
            <p className="small">
              Resety (<code>/@shop reset</code>, <code>/@shop resetall</code>) proszą o potwierdzenie komendą <code>/@shop confirm</code>,
              bo kasują historię rynkową przedmiotu.
            </p>
          </Fold>
          <p>
            <b>Rotacja.</b> Kategoria może mieć drugą listę - pulę. Sklep co kilka dni losuje z niej kilka przedmiotów, więc oferta się
            zmienia i nie wszystko jest dostępne od ręki.
          </p>
          <Fold title="Rotacja - szczegóły">
            <p className="small">
              Ustawiasz dwie rzeczy: ile przedmiotów ma być w ofercie naraz i co ile dni losowanie. Przedmiot, który był w ofercie, przez
              5 kolejnych losowań nie może wrócić - dzięki temu to samo nie kręci się w kółko. Gdy pula jest za mała, sklep dobiera te,
              którym zostało najmniej przerwy, więc oferta nigdy nie będzie pusta.
            </p>
            <p className="small">
              Czas liczy się kalendarzowo, nie od obecności graczy: data następnego losowania siedzi w pliku na serwerze i jest sprawdzana
              co kilka minut oraz po restarcie. Zmiana puli z aplikacji powoduje losowanie od razu.
            </p>
          </Fold>
          <p>
            <b>Wygląd menu.</b> W osobnej zakładce ustawiasz rozmiar okien i to, co w którym kwadracie stoi: kategorie, przedmioty,
            przyciski, tło. Widzisz dokładnie to, co zobaczy gracz.
          </p>
          <Fold title="Wygląd menu - szczegóły">
            <p className="small">
              Są cztery okna: menu główne (kategorie), strona kategorii (przedmioty), wybór ilości i wyniki szukania. W każdym ustawiasz
              wielkość (od 1 do 6 rzędów) i rozkładasz pola.
            </p>
            <p className="small">
              Kategorie i przedmioty wchodzą w swoje pola <b>po kolei</b> - dlatego kolejność na liście to jednocześnie miejsce w oknie.
              Strzałki stron pokazują się graczowi tylko wtedy, gdy jest dokąd iść, więc mała kategoria ich nie wyświetli.
            </p>
            <p className="small">
              Ikonki przycisków (szukanie, zamknij, sortowanie) wybierasz z listy przedmiotów, a ich napisy siedzą w plikach językowych
              pluginu.
            </p>
          </Fold>
          <p>
            <b>Statystyki.</b> Po włączeniu sklep zapisuje, co i za ile gracze sprzedają. Podgląd jest w zakładce Statystyki, a pełny
            raport w pliku na serwerze.
          </p>
          <Fold title="Statystyki - szczegóły">
            <p className="small">
              Zbierane jest: ile sztuk łącznie i dzisiaj, ile pieniędzy wypłacono, ile było transakcji i jaki jest teraz mnożnik skupu.
              Widać dzięki temu, co naprawdę napędza gospodarkę i które ceny są za wysokie.
            </p>
            <p className="small">
              Sklep liczy też, ile cykli przedmiot przesiedział na dole, ile na górze, a ile pośrodku. To najprostsza podpowiedź, czy
              cena bazowa w cenniku jest trafiona: coś, co stale leży na dnie, jest wycenione za wysoko, a coś, co ciągle stoi na
              szczycie - za nisko.
            </p>
            <p className="small">
              Na serwerze powstaje plik z raportem do otwarcia w Excelu, z kolumną sugestii („obniż cenę bazową”, „podnieś”, „ok”), plus
              liczniki dobowe i archiwum dzień po dniu. Statystyki przeżywają globalny reset cen - to osobna, długa historia. Zbieranie
              można wyłączyć: stare dane zostają, nowe nie dochodzą.
            </p>
          </Fold>
          <p className="muted small">
            Zmiany w aplikacji trafiają na serwer dopiero po „Zapisz” i „Wyślij na serwer”. Listę komend znajdziesz pod przyciskiem
            „Komendy”.
          </p>
        </div>
      </div>
    );
  }

  function fixedPriceHelpModal() {
    return (
      <div className="modal-overlay" onClick={() => setFixedHelp(false)}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Cena stała</h2>
            <button type="button" onClick={() => setFixedHelp(false)}>
              Zamknij
            </button>
          </div>
          <p>
            Zwykle sklep sam rusza ceną skupu: spada, gdy gracze masowo coś sprzedają, i wraca, gdy przestaną. Ten przełącznik to
            wyłącza - przedmiot zawsze skupuje się po cenie z cennika.
          </p>
          <p>
            <b>Kiedy się przydaje:</b> rzeczy, które da się farmić bez końca (bruk, drewno, dropy ze spawnerów). Farma sprzedaje
            niezależnie od ceny, bo nic nie kosztuje, więc ich skup i tak osiadłby na dnie i nigdy nie wrócił. Lepiej z góry ustawić im
            cenę, na której Ci zależy.
          </p>
          <p className="muted small">
            Cena kupna nie zmienia się nigdy, niezależnie od tego ustawienia - ceny dynamiczne dotyczą tylko skupu.
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setFixedHelp(false);
                setShopHelpDynamic(true);
                setShopHelp(true);
              }}
            >
              Dowiedz się więcej
            </button>
          </div>
        </div>
      </div>
    );
  }

  function priceHelpModal() {
    return (
      <div className="modal-overlay" onClick={() => setPriceHelp(false)}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Kupno i skup</h2>
            <button type="button" onClick={() => setPriceHelp(false)}>
              Zamknij
            </button>
          </div>
          <p>
            <b>Kupno zawsze idzie po sztuce.</b> Cenę podajesz za jedną sztukę, a sklep przelicza ją na tyle sztuk, ile gracz wybierze.
          </p>
          <p>
            W grze gracz nie wpisuje liczby - klika jeden z gotowych przycisków, domyślnie <b>1, 8, 16, 32 i 64</b>. Te liczby możesz
            zmienić na dowolne (np. 2, 10, 20), dodać kolejne albo usunąć: zakładka <b>Wygląd menu</b>, ekran <b>Wybór ilości</b>, sekcja
            <b>Przyciski</b> pod siatką - wpisujesz liczbę i stawiasz przycisk w oknie. Najwyżej 64, bo tyle mieści się w jednym miejscu
            w ekwipunku.
          </p>
          <p>
            <b>Skup może iść hurtem.</b> Po włączeniu tej opcji sklep odkupuje od gracza tylko całe porcje - ustawiasz, ile sztuk to
            jedna porcja i ile za nią płacisz. Reszta, która nie wypełni porcji, zostaje graczowi w ekwipunku.
          </p>
          <p>
            <b>Po co?</b> Żeby nie skupować pojedynczych sztuk za grosze i żeby ceny skupu były okrągłe. Przykład: 640 $ za 64 sztuki
            bruku zamiast 10 $ za każdą.
          </p>
        </div>
      </div>
    );
  }

  function rotationHelpModal() {
    return (
      <div className="modal-overlay" onClick={() => setRotationHelp(false)}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Po co jest rotacja</h2>
            <button type="button" onClick={() => setRotationHelp(false)}>
              Zamknij
            </button>
          </div>
          <p>
            Rotacja wymienia przedmioty wewnątrz kategorii - co kilka dni jedne znikają, a na ich miejsce wchodzą inne. Dzięki temu nie
            wszystko jest dostępne od ręki i gracze mają po co zaglądać do sklepu.
          </p>
          <p>
            Przedmioty w kategorii dzielą się na dwie listy: <b>stałe</b> (zawsze w sklepie) i <b>pulę</b> (zapas, z którego sklep losuje te
            zmieniające się). Stałe zostają na miejscu, rotują się tylko te z puli.
          </p>
          <p>
            Wybrane przedmioty przenoszą się ze stałych do puli - przestają być dostępne zawsze. Cofniesz to przyciskiem „Wróć do stałych”
            przy przedmiocie z puli.
          </p>
          <p>
            <b>Przykład:</b> pula 30 rzeczy, 5 przedmiotów naraz, nowa oferta co 14 dni. Gracz wchodzi i widzi 5 przedmiotów, za dwa tygodnie 5
            innych. To samo wraca najwcześniej po 5 losowaniach, żeby nie kręciło się w kółko.
          </p>
        </div>
      </div>
    );
  }

  function poolPickModal() {
    const c = file.cats.find((x) => x.id === poolPickCat);
    if (!c) return null;
    const back = poolPickBack;
    const list = back ? (c.rotation?.pool ?? []) : c.items;
    const close = () => setPoolPickCat(null);
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal card" style={{ width: "min(34rem, 92vw)" }} onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>{back ? "Pula rotacji - co wraca na stałe" : "Stałe przedmioty - co idzie do rotacji"}</h2>
            <button
              type="button"
              disabled={list.length === 0}
              onClick={() => {
                const all = list.map((_, i) => i);
                if (back) moveBack(c, all);
                else {
                  updateCategory(c.id, movedToPool(c, all));
                  setSel({ kind: "cat" });
                }
              }}
            >
              {back ? "Cofnij wszystko" : "Wszystko do rotacji"}
            </button>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p className="muted small">
            {back
              ? "Kliknij „Cofnij” przy przedmiocie - wróci na stałą listę i będzie w sklepie zawsze, bez losowania."
              : "Kliknij „Do rotacji” przy przedmiocie - zniknie ze stałej listy i gracz kupi go tylko wtedy, gdy sklep go wylosuje."}
          </p>
          <div style={{ maxHeight: "24rem", overflowY: "auto", paddingRight: "0.6rem" }}>
            {list.length === 0 && <p className="muted small">{back ? "Pula jest pusta." : "Kategoria nie ma stałych przedmiotów."}</p>}
            {list.map((it, i) => (
              <div key={`pick:${i}`} className="ci-cat-row">
                <div className="ci-item" style={{ flex: 1 }}>
                  {iconOf(it.ref)}
                  <span className="ci-item-text">
                    <span className="ci-item-name">{it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref)}</span>
                    <span className="small muted">{priceText(it)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (back) moveBack(c, [i]);
                    else {
                      updateCategory(c.id, movedToPool(c, [i]));
                      setSel({ kind: "cat" });
                    }
                  }}
                >
                  {back ? "Cofnij" : "Do rotacji"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- ustawienia ----

  function layoutEditor(sc: string) {
    const m: MenuScreenDraft = file.settings.menus[sc];
    const setMenu = (patch: Partial<MenuScreenDraft>) => setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, ...patch } } });
    const content: Record<number, SlotContent> = {};
    const catBySlot = categoryBySlot(m.layout, file.settings.categoryOrder);
    // Pola na przedmioty w kolejnosci z pliku - plugin wklada w nie towar po kolei.
    const itemSlots = m.layout.filter((e) => e.role === "ITEM_SLOT").map((e) => e.slot);
    for (const e of m.layout) {
      if (e.role === "CATEGORY_SLOT") {
        const catId = catBySlot.get(e.slot);
        const cat = file.cats.find((c) => c.id === catId);
        content[e.slot] = {
          label: cat ? plain(cat.name) : "",
          kind: "category",
          // Puste pole ma wygladac jak tlo, ale zostaje polem (da sie je usunac w trybie ukladu).
          blank: !cat,
          material: cat?.icon.item,
          dim: !cat,
          // Klikniecie pola stawia tu to, co podniesione z listy obok (dziala tez w trybie ukladu).
          onClick: picked ? () => placePicked(sc, e.slot) : undefined,
          highlighted: Boolean(picked) && !cat,
        };
      } else if (e.role === "ITEM_SLOT") {
        const pc = file.cats.find((c) => c.id === previewCat);
        const it = pc ? pc.items[previewPage * itemSlots.length + itemSlots.indexOf(e.slot)] : undefined;
        content[e.slot] = it
          ? {
              label: it.name.trim() ? plain(it.name) : refLabel(it.ref),
              kind: "item",
              material: it.ref.item,
              sublabel: money(perPiece(it.buy, it.amount)),
            }
          : { label: pc ? "" : "Przedmiot", kind: "item", dim: true, blank: Boolean(pc) };
      } else if (e.role === "AMOUNT_SLOT") {
        // Pole "ile sztuk kupic" - liczy sie sama liczba, a kamien i tak byl obrazkiem na niby.
        content[e.slot] = {
          label: String(e.amount ?? 1),
          sublabel: "szt.",
          kind: "amount",
          onClick: picked ? () => placePicked(sc, e.slot) : undefined,
        };
      } else if (e.role === "FILLER") {
        content[e.slot] = { label: "Tło", kind: "nav", material: e.material ?? "GRAY_STAINED_GLASS_PANE" };
      } else {
        content[e.slot] = {
          label: ROLE_LABELS[e.role] ?? e.role,
          kind: "nav",
          material: conventionalRoleIcon(e.role),
          onClick: picked ? () => placePicked(sc, e.slot) : undefined,
        };
      }
    }
    if (picked) {
      // Pole spoza ukladu tez ma byc celem - inaczej dalo by sie stawiac tylko tam, gdzie juz cos jest.
      for (let i = 0; i < m.size; i++) {
        if (content[i]) continue;
        content[i] = { label: "", kind: "filler", blank: true, highlighted: true, onClick: () => placePicked(sc, i) };
      }
    }
    return (
      <>
        <SlotGrid
          content={content}
          size={m.size}
          // Uklad jest edytowalny od razu - bez przelacznika "Zmien uklad".
          editable
          allowSwap
          plain
          iconPackDir={iconPackDir}
          onMoveSlot={(from, to) => {
            // Podglad kategorii: przeciagniecie przedmiotu zmienia jego miejsce w kategorii
            // (czyli w oknie gry), a nie uklad samych pol.
            const pc = file.cats.find((c) => c.id === previewCat);
            if (pc && itemSlots.includes(from) && itemSlots.includes(to)) {
              const at = (slot: number) => previewPage * itemSlots.length + itemSlots.indexOf(slot);
              updateCategory(pc.id, { items: swapItems(pc.items, at(from), at(to)) });
              return;
            }
            setMenu({ layout: m.layout.map((e) => (e.slot === from ? { ...e, slot: to } : e.slot === to ? { ...e, slot: from } : e)) });
          }}
          onRemoveSlot={(slot) => {
            // Na polu z kategorią × chowa kategorię z menu (zostaje w sklepie), a pole zostaje
            // puste. Na pustym polu i na przyciskach × usuwa samo pole z układu.
            const hidden = categoryBySlot(m.layout, file.settings.categoryOrder).get(slot);
            const isCat = m.layout.some((e) => e.slot === slot && e.role === "CATEGORY_SLOT");
            if (isCat && hidden) hideFromMenu(hidden);
            else setMenu({ layout: m.layout.filter((e) => e.slot !== slot) });
          }}
        />
      </>
    );
  }

  /** Pole materialu. Podpowiedzi biora sie z jednej listy na cala strone (patrz nizej). */
  function materialInput(value: string, onPick: (m: string) => void, _listId?: string) {
    return (
      <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
        {value && <MaterialIcon material={value} iconPackDir={iconPackDir} />}
        <input
          list={MATERIALS_LIST_ID}
          value={value}
          onChange={(e) => onPick(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
          style={{ minWidth: "14rem" }}
        />
      </span>
    );
  }

  function renderSettings() {
    const s = file.settings;
    const d = s.dynamic;
    const setDyn = (patch: Partial<typeof d>) => setSettings({ dynamic: { ...d, ...patch } });
    return (
      <section className="card form">
        <Fold title="Ceny" open>
          <label className="checkbox">
            <input type="radio" checked={s.rounding === "whole"} onChange={() => setSettings({ rounding: "whole" })} />
            Pełne złotówki (1 sztuka z „64 za 10” kosztuje 1)
          </label>
          <label className="checkbox">
            <input type="radio" checked={s.rounding === "cents"} onChange={() => setSettings({ rounding: "cents" })} />
            Grosze (1 sztuka z „64 za 10” kosztuje 0.16)
          </label>
        </Fold>
        <Fold title="Ceny dynamiczne skupu" open>
          <label className="checkbox">
            <input type="checkbox" checked={d.enabled} onChange={(e) => setDyn({ enabled: e.target.checked })} />
            Włączone - gdy gracze dużo czegoś sprzedają, skup tego spada; gdy nikt nie sprzedaje, rośnie
          </label>
          {d.enabled && (
            <>
              <label>
                Co ile minut przeliczać {numberInput(d.cycleMinutes, (n) => setDyn({ cycleMinutes: Math.max(1, Math.floor(n)) }), "1", 1)}
              </label>
              <label>
                Skup może spaść najwyżej o (%) {numberInput(pct(d.minMultiplier), (n) => setDyn({ minMultiplier: fromPct(-Math.abs(n)) }), "5")}
                <span className="muted small">50 = skup spadnie najwyżej do połowy zwykłej ceny</span>
              </label>
              <label>
                Skup może wzrosnąć najwyżej o (%) {numberInput(pct(d.maxMultiplier), (n) => setDyn({ maxMultiplier: fromPct(Math.abs(n)) }), "5")}
                <span className="muted small">50 = skup urośnie najwyżej do półtora raza zwykłej ceny</span>
              </label>
              <label>
                Co ile dni wszystkie ceny wracają do normy {numberInput(d.resetDays, (n) => setDyn({ resetDays: Math.max(1, Math.floor(n)) }), "1", 1)}
              </label>
              <label>
                Skup najwyżej taka część ceny kupna {numberInput(d.maxSellShare, (n) => setDyn({ maxSellShare: Math.min(1, n) }), "0.05")}
                <span className="muted small">0.9 = skup nigdy nie da więcej niż 90% ceny kupna</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={d.announceEvents} onChange={(e) => setDyn({ announceEvents: e.target.checked })} />
                Ogłoś na czacie, gdy zaczyna się albo kończy event (/@shop event)
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={d.announceReset} onChange={(e) => setDyn({ announceReset: e.target.checked })} />
                Ogłoś na czacie, gdy wszystkie ceny wracają do normy
              </label>
              <Fold title="Strojenie (zaawansowane)">
                <p className="muted small">
                  Domyślne wartości są przemyślane i przetestowane - zmieniaj tylko, gdy wiesz, co robisz. Jak coś pójdzie nie tak,
                  wpisz wartości z nawiasów.
                </p>
                {TUNING_FIELDS.map(([field, label, step, hint]) => (
                  <label key={field}>
                    {label}
                    <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
                      {numberInput(d.tuning[field], (n) => setDyn({ tuning: { ...d.tuning, [field]: n } }), step, 0)}
                      <span className="muted small">{hint}</span>
                    </span>
                  </label>
                ))}
              </Fold>
            </>
          )}
        </Fold>
        <Fold title="Statystyki sprzedaży">
          <label className="checkbox">
            <input type="checkbox" checked={s.statsEnabled} onChange={(e) => setSettings({ statsEnabled: e.target.checked })} />
            Zbieraj statystyki (stats.yml + raport stats.csv do Excela z podpowiedziami cen)
          </label>
        </Fold>
        <p className="muted small">Układ okien w grze i ikonki przycisków są w osobnej zakładce „Wygląd menu” u góry.</p>
      </section>
    );
  }

  /** Stawia to, co podniesione z listy obok, w klikniętym polu. */
  function placePicked(sc: string, slot: number) {
    if (!picked) return;
    const m = file.settings.menus[sc];
    const withoutSlot = m.layout.filter((e) => e.slot !== slot);
    if (picked.role) {
      const role = picked.role;
      const entry =
        role === "AMOUNT_SLOT"
          ? { slot, role, amount: Math.max(1, Math.floor(amountValue)) }
          : role === "FILLER"
            ? { slot, role, material: fillerMaterial || "BLACK_STAINED_GLASS_PANE" }
            : { slot, role };
      setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, layout: [...withoutSlot, entry] } } });
      setPicked(null);
      return;
    }
    if (!picked.cat) return;
    // Kategoria potrzebuje pola o roli CATEGORY_SLOT - jak go tu nie ma, robimy je.
    const isCatSlot = m.layout.some((e) => e.slot === slot && e.role === "CATEGORY_SLOT");
    const layout = isCatSlot ? m.layout : [...withoutSlot, { slot, role: "CATEGORY_SLOT" }];
    const index = [...categoryBySlot(layout, file.settings.categoryOrder).keys()].indexOf(slot);
    if (index < 0) return;
    setFile({
      ...file,
      settings: {
        ...file.settings,
        menus: { ...file.settings.menus, [sc]: { ...m, layout } },
        categoryOrder: moveCategoryTo(file.settings.categoryOrder, picked.cat, index),
      },
    });
    setPicked(null);
  }

  /** Ustawienia pól wybranego ekranu (ile sztuk, własne tło) - siedzą pod listą po lewej. */
  function layoutExtras(sc: string) {
    const m: MenuScreenDraft = file.settings.menus[sc];
    const setMenu = (patch: Partial<MenuScreenDraft>) => setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, ...patch } } });
    const fillers = m.layout.filter((e) => e.role === "FILLER");
    if (fillers.length === 0) return null;
    return (
      <>
        {fillers.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <div className="ci-section-title">Własne tło na polach</div>
            <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
              {fillers.map((e) => (
                <label key={e.slot} style={{ margin: 0 }}>
                  <span className="muted small">Pole {e.slot}</span>
                  {materialInput(e.material ?? "", (v) => setMenu({ layout: m.layout.map((x) => (x.slot === e.slot ? { ...x, material: v } : x)) }))}
                </label>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  /** Pasek nad siatką: co podglądamy, ile tego jest i przełączanie stron. */
  function previewBar(sc: string) {
    const pc = file.cats.find((c) => c.id === previewCat);
    if (!pc || (sc !== "category-page" && sc !== "search-results")) return null;
    const perPage = file.settings.menus[sc].layout.filter((e) => e.role === "ITEM_SLOT").length;
    const pages = perPage > 0 ? Math.max(1, Math.ceil(pc.items.length / perPage)) : 0;
    const page = Math.min(previewPage, Math.max(0, pages - 1));
    return (
      <div className="row" style={{ alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
        <MinecraftTextPreview text={pc.name} emptyLabel={pc.id} />
        <span className="muted small">
          {pc.items.length} przedmiotów{perPage > 0 ? `, po ${perPage} na stronie` : " - brak pól na przedmioty"}
        </span>
        {pages > 1 && (
          <>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setPreviewPage(Math.max(0, page - 1))} disabled={page === 0}>
              <ArrowUp size={14} style={{ transform: "rotate(-90deg)" }} />
            </button>
            <span className="muted small">
              strona {page + 1} z {pages}
            </span>
            <button type="button" onClick={() => setPreviewPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>
              <ArrowDown size={14} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </>
        )}
      </div>
    );
  }

  /** Rozmiar okna i tryb przesuwania pól - pod listą, żeby nie rozpychać góry siatki. */
  function screenToolbar(sc: string) {
    const m: MenuScreenDraft = file.settings.menus[sc];
    const setMenu = (patch: Partial<MenuScreenDraft>) => setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, ...patch } } });
    return (
      <div className="card" style={{ padding: "0.6rem", marginTop: "0.6rem" }}>
        <label style={{ margin: 0 }}>
          <span className="muted small">Rozmiar okna</span>
          <select
            value={m.size}
            onChange={(e) => setMenu({ size: Number(e.target.value), layout: m.layout.filter((x) => x.slot < Number(e.target.value)) })}
          >
            {[9, 18, 27, 36, 45, 54].map((sz) => (
              <option key={sz} value={sz}>
                {sz / 9} rzędy ({sz} pól)
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  /** Lista kategorii obok siatki: klikasz kategorię, potem pole - i tam stanie. */
  function pickerPanel(sc: string) {
    // W menu glownym lista sluzy do stawiania kategorii, na stronie kategorii - do podgladu
    // jej przedmiotow w polach. Reszta (przyciski, tlo, ilosc) stawia sie z sekcji na dole.
    const preview = sc === "category-page" || sc === "search-results";
    if (sc !== "main-menu" && !preview) return null;
    const order = file.settings.categoryOrder;
    return (
      // position: static - lista ma stac w miejscu przy przewijaniu (ci-cats domyslnie sie przykleja).
      <aside className="card ci-cats" style={{ minWidth: 0, padding: "0.6rem", position: "static" }}>
        <p className="muted small">
          {preview
            ? "Kliknij kategorię, żeby zobaczyć jej przedmioty w polach. Przeciągnij przedmiot, żeby zmienić mu miejsce."
            : "Klikasz co postawić i gdzie, przeciągasz myszką, żeby przesunąć, a krzyżykiem usuwasz."}
        </p>
        <div className="ci-section-title">Kategorie</div>
        {file.cats.map((c) => {
          const inMenu = order.includes(c.id);
          return (
            <div key={c.id} className="ci-cat-row">
              <button
                type="button"
                className={`ci-cat ci-cat-pick${(preview ? previewCat === c.id : picked?.cat === c.id) ? " active" : ""}`}
                onClick={() =>
                  preview
                    ? (setPreviewCat(previewCat === c.id ? null : c.id), setPreviewPage(0))
                    : setPicked(picked?.cat === c.id ? null : { cat: c.id })
                }
              >
                {iconOf(c.icon)}
                <span className="ci-item-name">
                  <MinecraftTextPreview text={c.name} emptyLabel={c.id} />
                </span>
                {!preview && !inMenu && <span className="ci-badge">poza menu</span>}
              </button>
              {!preview && inMenu && (
                <button
                  type="button"
                  className="ci-trash"
                  title="Schowaj z menu (kategoria zostaje w sklepie)"
                  onClick={() => hideFromMenu(c.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
        {picked && (
          <button type="button" onClick={() => setPicked(null)}>
            Anuluj wybór
          </button>
        )}
      </aside>
    );
  }

  function renderMenu() {
    const s = file.settings;
    return (
      <section className="card form">
        <Fold title="Układ okien w grze" open>
          <p className="muted small">
            Kliknij kategorię albo przycisk, potem pole w siatce - tam stanie. Pola przeciągasz myszką, a krzyżyk je usuwa. Kategorie
            widać z prawdziwymi ikonkami, dokładnie tak, jak zobaczy je gracz.
          </p>
          <div className="row">
            {SCREENS.map((sc) => (
              <button key={sc} type="button" className={screen === sc ? "ci-publish" : undefined} onClick={() => setScreen(sc)}>
                {SCREEN_LABELS[sc]}
              </button>
            ))}
          </div>
          <div className="row" style={{ alignItems: "flex-start", gap: "1rem" }}>
            {/* Stala, waska kolumna - inaczej dluzsze nazwy kategorii rozpychaja ja na pol ekranu. */}
            <div style={{ flex: "0 0 18rem", maxWidth: "18rem" }}>
              {pickerPanel(screen)}
              {screenToolbar(screen)}
              {layoutExtras(screen)}
            </div>
            {/* Siatka odrobine nizej niz lista obok - inaczej lepi sie do gornej krawedzi karty. */}
            <div style={{ flex: 1, minWidth: 0, marginTop: "0.5rem" }}>
              {previewBar(screen)}
              {layoutEditor(screen)}
            </div>
          </div>
        </Fold>
        <Fold title="Przyciski" open>
          <p className="muted small">
            Ikonka przycisku i stawianie go w oknie. „Postaw” podnosi przycisk - potem klikasz pole w siatce wyżej, tak samo jak przy
            kategoriach. Przyciski, których nie ma na wybranym ekranie, są bez tej opcji.
          </p>
          {Object.keys(BUTTON_LABELS).map((b) => {
            // Wroc ma dwie ikonki: zwykla i te z wyboru ilosci - stawiamy te, ktora pasuje do ekranu.
            const role = BUTTON_ROLES[b];
            const rightBack = b === "picker-back" ? screen === "buy-picker" : b === "back" ? screen !== "buy-picker" : true;
            const canPlace = Boolean(role) && rightBack && (ROLES_BY_SCREEN[screen] ?? []).includes(role);
            return (
              <div key={b} className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
                <span style={{ minWidth: "11rem" }}>{BUTTON_LABELS[b]}</span>
                {materialInput(s.buttons[b] ?? "", (v) => setSettings({ buttons: { ...s.buttons, [b]: v } }))}
                {canPlace && (
                  <button
                    type="button"
                    className={picked?.role === role ? "ci-publish" : undefined}
                    onClick={() => setPicked(picked?.role === role ? null : { role })}
                  >
                    {picked?.role === role ? "Anuluj" : "Postaw"}
                  </button>
                )}
              </div>
            );
          })}
          {(ROLES_BY_SCREEN[screen] ?? []).includes("ITEM_SLOT") && (
            <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
              <span style={{ minWidth: "11rem" }}>Przedmiot ze sklepu</span>
              <span className="muted small" style={{ minWidth: "14rem" }}>
                pole wypełnia się towarem z kategorii
              </span>
              <button
                type="button"
                className={picked?.role === "ITEM_SLOT" ? "ci-publish" : undefined}
                onClick={() => setPicked(picked?.role === "ITEM_SLOT" ? null : { role: "ITEM_SLOT" })}
              >
                {picked?.role === "ITEM_SLOT" ? "Anuluj" : "Postaw"}
              </button>
            </div>
          )}
          {(ROLES_BY_SCREEN[screen] ?? []).includes("AMOUNT_SLOT") && (
            <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
              <span style={{ minWidth: "11rem" }}>Przycisk ilości</span>
              <input
                type="number"
                className="no-spin"
                min={1}
                max={64}
                step="1"
                title="Ile sztuk kupuje ten przycisk (najwyżej 64, czyli pełny stack)"
                value={amountValue}
                onChange={(e) => setAmountValue(Math.min(64, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                style={{ width: "3.4rem" }}
              />
              <span className="muted small" style={{ minWidth: "11rem" }}>sztuk (max 64)</span>
              <button
                type="button"
                className={picked?.role === "AMOUNT_SLOT" ? "ci-publish" : undefined}
                onClick={() => setPicked(picked?.role === "AMOUNT_SLOT" ? null : { role: "AMOUNT_SLOT" })}
              >
                {picked?.role === "AMOUNT_SLOT" ? "Anuluj" : "Postaw"}
              </button>
            </div>
          )}
          <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
            <span style={{ minWidth: "11rem" }}>Tło (puste pola)</span>
            {materialInput(fillerMaterial, (v) => setFillerMaterial(v))}
            <button
              type="button"
              className={picked?.role === "FILLER" ? "ci-publish" : undefined}
              onClick={() => setPicked(picked?.role === "FILLER" ? null : { role: "FILLER" })}
            >
              {picked?.role === "FILLER" ? "Anuluj" : "Postaw"}
            </button>
          </div>
        </Fold>
      </section>
    );
  }

  function renderStats() {
    const names = new Map<string, string>();
    file.cats.forEach((c) => [...c.items, ...(c.rotation?.pool ?? [])].forEach((it) => names.set(itemKey(it.ref), it.name.trim() ? plain(it.name) : refLabel(it.ref))));
    const q = statsFilter.toLowerCase();
    const rows = stats
      .filter((s) => !q || s.key.toLowerCase().includes(q) || (names.get(s.key) ?? "").toLowerCase().includes(q))
      .sort((a, b) => b.sztukLacznie - a.sztukLacznie);
    return (
      <section className="card">
        <h2>Statystyki sprzedaży</h2>
        <p className="muted small">
          Dane z serwera (stats.yml i prices.yml) - tylko podgląd. {file.settings.statsEnabled ? "" : "Statystyki są wyłączone w Ustawieniach, więc nowe dane się nie zbierają."}
        </p>
        <div className="row">
          <input placeholder="Szukaj po nazwie lub kluczu..." value={statsFilter} onChange={(e) => setStatsFilter(e.target.value)} />
          <button type="button" onClick={() => refreshStats()} disabled={!profileId}>
            Odśwież
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="muted small">Brak danych - jeszcze nikt nic nie sprzedał albo statystyki są wyłączone.</p>
        ) : (
          <div className="build-log">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Przedmiot</th>
                  <th>Sztuk łącznie</th>
                  <th>Wypłacono łącznie</th>
                  <th>Transakcji</th>
                  <th>Sztuk dziś</th>
                  <th>Wypłacono dziś</th>
                  <th>Skup teraz</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const m = multipliers[s.key];
                  return (
                    <tr key={s.key}>
                      <td>{names.get(s.key) ?? s.key}</td>
                      <td>{s.sztukLacznie}</td>
                      <td>{money(s.wyplaconoLacznie)}</td>
                      <td>{s.transakcji}</td>
                      <td>{s.sztukDzis}</td>
                      <td>{money(s.wyplaconoDzis)}</td>
                      <td>{m == null ? "0%" : `${signedPct(m)}%${m > 1.02 ? " ▲" : m < 0.98 ? " ▼" : ""}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  const problems = tab === "cats" && category ? shopProblems(file.settings, [category]) : [];

  return (
    <div className="page">
      <Link to="/tools" className="back-link">
        ← Twoje pluginy
      </Link>
      <h1>Sklep</h1>
      <p className="muted">Kategorie i przedmioty sklepu serwerowego: ceny kupna i skupu, rotacja, ceny dynamiczne i wygląd menu.</p>

      <div className="row">
        <select value={profileId} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">Wybierz serwer...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setShowCommands(true)}>
          <Terminal size={14} strokeWidth={1.75} /> Komendy
        </button>
        {/* Zakladki w tym samym wierszu co reszta paska - tak samo jak na stronie Questow. */}
        <button type="button" className={tab === "cats" ? "ci-publish" : undefined} onClick={() => setTab("cats")}>
          Kategorie
        </button>
        <button type="button" className={tab === "settings" ? "ci-publish" : undefined} onClick={() => setTab("settings")}>
          Ustawienia
        </button>
        <button type="button" className={tab === "menu" ? "ci-publish" : undefined} onClick={() => setTab("menu")}>
          Wygląd menu
        </button>
        <button type="button" className={tab === "stats" ? "ci-publish" : undefined} onClick={() => setTab("stats")}>
          Statystyki
        </button>
        <select value="" onChange={(e) => loadTemplate(e.target.value)} disabled={!profileId} title="Gotowe sklepy">
          <option value="">Wczytaj szablon...</option>
          {shopTemplateChoices(language).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="button" title="Jak działa sklep" aria-label="Jak działa sklep" onClick={() => setShopHelp(true)}>
          <HelpCircle size={16} strokeWidth={1.75} />
        </button>
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
      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      {showCommands && <ShopCommandsModal file={file} onClose={() => setShowCommands(false)} />}
      <ItemDatalists materials={allMaterials} customIds={customIds} />
      {rotationHelp && rotationHelpModal()}
      {priceHelp && priceHelpModal()}
      {shopHelp && shopHelpModal()}
      {fixedHelp && fixedPriceHelpModal()}
      {poolPickCat && poolPickModal()}

      {tab === "settings" && renderSettings()}
      {tab === "menu" && renderMenu()}
      {tab === "stats" && renderStats()}

      {tab === "cats" && (
        <div className="ci-layout ci-layout-crates ci-layout-quests ci-layout-shop">
          <aside className="card ci-cats">
            <div className="ci-section-title">Kategorie</div>
            {file.cats.map((c) =>
              trashConfirm === `cat:${c.id}` ? (
                <div key={c.id}>{confirmRow(`Usunąć kategorię ${c.id}?`, () => removeCategory(c.id))}</div>
              ) : (
                <div key={c.id} className="ci-cat-row">
                  <button
                    type="button"
                    className={`ci-cat${catId === c.id ? " active" : ""}`}
                    onClick={() => {
                      setCatId(c.id);
                      setSel({ kind: "cat" });
                    }}
                  >
                    <span className="ci-item-name">
                      <MinecraftTextPreview text={c.name} emptyLabel={c.id} />
                    </span>
                    {!file.settings.categoryOrder.includes(c.id) && (
                      <span className="ci-badge" title="Kategoria działa, ale nie ma swojego kafelka w menu sklepu">
                        poza menu
                      </span>
                    )}
                    <span className="ci-prize-count" title={`${c.items.length} przedmiotów`}>
                      <Store size={12} strokeWidth={2} /> {c.items.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ci-trash"
                    title={file.settings.categoryOrder.includes(c.id) ? "Wyżej w menu" : "Wstaw z powrotem do menu (na koniec)"}
                    onClick={() => moveCategory(c.id, -1)}
                    disabled={file.settings.categoryOrder.indexOf(c.id) === 0}
                  >
                    <ArrowUp size={12} />
                  </button>
                  {trashButton(`cat:${c.id}`, `Usuń kategorię ${c.id}`)}
                </div>
              )
            )}
            <button type="button" onClick={addCategory} disabled={!profileId}>
              + Nowa kategoria
            </button>
          </aside>

          <section className="card ci-list">
            {category ? (
              <>
                <button type="button" className={`ci-item${sel.kind === "cat" ? " active" : ""}`} onClick={() => setSel({ kind: "cat" })}>
                  {iconOf(category.icon)}
                  <span className="ci-item-text">
                    <span className="ci-item-name">
                      <MinecraftTextPreview text={category.name} emptyLabel={category.id} />
                    </span>
                    <span className="small muted">ustawienia kategorii</span>
                  </span>
                </button>
                {/* Dwie listy naraz to bylo za duzo przewijania - przelaczamy sie miedzy nimi. */}
                {category.rotation && (
                  <div className="row" style={{ gap: "0.25rem" }}>
                    <button type="button" className={!showPool ? "ci-publish" : undefined} onClick={() => {
                        setShowPool(false);
                        setSel({ kind: "cat" });
                      }}>
                      Przedmioty ({category.items.length})
                    </button>
                    <button type="button" className={showPool ? "ci-publish" : undefined} onClick={() => {
                        setShowPool(true);
                        setSel({ kind: "cat" });
                      }}>
                      Pula rotacji ({category.rotation.pool.length})
                    </button>
                  </div>
                )}
                {(!category.rotation || !showPool) && (
                  <>
                    <ListToggle
                      open={listOpen}
                      onToggle={() => setListOpen(!listOpen)}
                      label={`Przedmioty (${shownCount(category, false)}${
                        shownCount(category, false) === category.items.length ? "" : ` z ${category.items.length}`
                      })`}
                    />
                    {listOpen && category.items.length > 1 && listToolbar(category, false)}
                    {listOpen &&
                      category.items.map((it, i) =>
                        matchesPriceFilter(it, priceFilter[`${category.id}:false`] ?? "all") ? itemRow(category, false, it, i) : null
                      )}
                    <button type="button" onClick={() => addItem(category, false)}>
                      + Dodaj przedmiot
                    </button>
                  </>
                )}
                {category.rotation && showPool && (
                  <>
                    <ListToggle
                      open={listOpen}
                      onToggle={() => setListOpen(!listOpen)}
                      label={`Pula rotacji (${shownCount(category, true)}${
                        shownCount(category, true) === category.rotation.pool.length ? "" : ` z ${category.rotation.pool.length}`
                      })${category.rotation.enabled ? "" : " - rotacja wyłączona"}`}
                    />
                    {listOpen && category.rotation.pool.length > 1 && listToolbar(category, true)}
                    {listOpen &&
                      category.rotation.pool.map((it, i) =>
                        matchesPriceFilter(it, priceFilter[`${category.id}:true`] ?? "all") ? itemRow(category, true, it, i) : null
                      )}
                    <button type="button" onClick={() => addItem(category, true)}>
                      + Dodaj do puli
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="muted">{profileId ? "Brak kategorii - dodaj pierwszą albo wczytaj szablon." : "Wybierz serwer, żeby wczytać sklep."}</p>
            )}
          </section>

          <section className="card form ci-editor">
            {category && sel.kind === "cat" && renderCategory(category)}
            {category && sel.kind === "item" && renderItem(category, sel.pool, sel.index)}
            {problems.length > 0 && (
              <div className="ci-badges">
                {problems.map((p) => (
                  <span key={p} className="ci-badge warn">
                    {p}
                  </span>
                ))}
              </div>
            )}
            <div className="ci-actions">
              <button className="ci-publish" type="button" onClick={save} disabled={!unsaved}>
                <Save size={16} strokeWidth={1.75} /> Zapisz
              </button>
              <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
                Cofnij niezapisane
              </button>
            </div>
            {unsaved && <p className="muted small">masz niezapisane zmiany</p>}
          </section>
        </div>
      )}
      {tab !== "cats" && (
        <div className="ci-actions">
          <button className="ci-publish" type="button" onClick={save} disabled={!unsaved}>
            <Save size={16} strokeWidth={1.75} /> Zapisz
          </button>
          <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
            Cofnij niezapisane
          </button>
        </div>
      )}
    </div>
  );
}
