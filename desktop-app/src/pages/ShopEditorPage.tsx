import { desktopDir, join } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ask } from "../components/AskModal";
import {
  CollectionInfoModal,
  DynamicHelpModal,
  FixedPriceHelpModal,
  PriceHelpModal,
  RotationHelpModal,
  ShopGuideModal,
  StatsHelpModal,
  TextsHelpModal,
  SCREEN_HELP,
} from "./shop/ShopHelpModals";
import ShopCommandsModal from "./shop/ShopCommandsModal";
import ShopTextsSection from "./shop/ShopTextsSection";
import {
  BUTTON_ROLES,
  EMPTY,
  GOAT_HORNS,
  ROLES_BY_SCREEN,
  TUNING_FIELDS,
  fromTemplate,
  money,
  ordered,
  plain,
  refLabel,
  roleMaterial,
  sameValues,
  serializeAll,
  setCurrencySign,
  shopDir,
  type Sel,
  type SettingsSection,
  type ShopFile,
  type Tab,
} from "./shop/shopPageShared";
import { ArrowDown, ArrowUp, CircleAlert, Download, Eye, EyeOff, Redo2, Save, Shuffle, Store, Terminal, Trash2, TriangleAlert, Undo2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CommandTip, ConfirmButton, Fold, HelpButton, ListToggle, LoreEditor, StatusBar } from "../components/EditorBits";
import ItemRefPicker, { ItemDatalists, MATERIALS_LIST_ID } from "../components/ItemRefPicker";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import { showPrompt } from "../components/PromptModal";
import SlotGrid, { type SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpDeleteFile, sftpDownloadFile, sftpListDir, sftpReadFile, sftpWriteFile } from "../lib/api";
import { readCurrency, readSetting } from "../lib/coreSettings";
import { idFromName } from "../lib/cratesYaml";
import { loadItemCatalog } from "../lib/itemCatalogRemote";
import type { ItemRef } from "../lib/itemRef";
import { itemKey, parseDynamicPrices, parseSalesStats, type SalesStatEntry } from "../lib/shopStats";
import { shopTemplateChoices, shopTemplateFor } from "../lib/shopTemplates";
import {
  BUTTON_LABELS,
  categoryBySlot,
  defaultDynamic,
  defaultTuning,
  detectSort,
  fromPerPiece,
  isLotted,
  matchesPriceFilter,
  ensureCategorySlots,
  hideCategoryFromMenu,
  placeCategoryAt,
  removeMenuSlot,
  swapItems,
  activeRotation,
  displayOrder,
  parseRotationState,
  pageSlots,
  placeItemAt,
  switchLot,
  type LotSnapshot,
  moveBackFromPool,
  moveToPool,
  newCategory,
  newItem,
  parseCategory,
  parseShopSettings,
  perPiece,
  randomPick,
  rotationSlotsOf,
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
} from "../lib/shopYaml";
import {
  changedTexts,
  fillPlaceholders,
  parseAnnounceTexts,
  patchLangFile,
  SAMPLE_VALUES,
  sameTexts,
  TEXT_FIELDS,
  type AnnounceTexts,
} from "../lib/shopAnnounce";
import { everyDays, everyMinutes, plural } from "../lib/plText";
import { parseSpawnerConfig } from "../lib/spawnersYaml";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

export default function ShopEditorPage() {
  const { profiles, loading: profilesLoading, activeProfileId: profileId, setActiveProfileId: setProfileId } = useProfiles();
  const [pluginsPath, setPluginsPath] = useState("");
  const [file, setFile] = useState<ShopFile>(EMPTY);
  // Cofnij / Ponów dla całej strony (przyciski u góry i Ctrl+Z / Ctrl+Y poza polami tekstowymi).
  // Szybkie zmiany jedna po drugiej (np. pisanie ceny) łączą się w jeden krok.
  const historyRef = useRef<{ past: ShopFile[]; future: ShopFile[]; prev: ShopFile; lastPush: number; skip: boolean }>({
    past: [],
    future: [],
    prev: EMPTY,
    lastPush: 0,
    skip: false,
  });
  const [, setHistoryTick] = useState(0);
  const [saved, setSaved] = useState<ShopFile>(EMPTY);
  const [serverFile, setServerFile] = useState<ShopFile>(EMPTY);
  const [serverCatIds, setServerCatIds] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("cats");
  const [catId, setCatId] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>({ kind: "cat" });
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("$");
  // Co z puli rotacji plugin ma teraz wylosowane (rotation.yml na serwerze) - do podglądu strony kategorii.
  const [rotationState, setRotationState] = useState<Record<string, number[]>>({});
  const [customIds, setCustomIds] = useState<string[]>([]);
  // Custom item -> zwykły materiał do ikonki: z katalogu itemów, a spawnery ze Spawnerów po prostu jako spawner.
  const [customIcons, setCustomIcons] = useState<Record<string, string>>({});
  // Custom item -> ludzka nazwa: z katalogu itemów, a spawnery jako "Spawner: Krowa" (nazwa ze Spawnerów).
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  // Co jest na serwerze: czy wgrany plugin Spawnery i czy udało się wczytać katalog itemów.
  // null = nie wiadomo (np. nie dało się przejrzeć folderu) - wtedy nie straszymy ostrzeżeniami.
  const [spawnersInstalled, setSpawnersInstalled] = useState<boolean | null>(null);
  const [catalogIds, setCatalogIds] = useState<Set<string> | null>(null);
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
  const [dynamicHelp, setDynamicHelp] = useState(false);
  const [statsHelp, setStatsHelp] = useState(false);
  const [collectionInfo, setCollectionInfo] = useState(false);
  const [textsHelp, setTextsHelp] = useState(false);
  // "Zmień tekst" przy rotacji otwiera sekcję tekstów w Ustawieniach i do niej przewija.
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("prices");
  // "Wczytaj z serwera": pytanie z czerwonym przyciskiem i kopia wyrzuconych zmian do przywrócenia.
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [discarded, setDiscarded] = useState<{ file: ShopFile; saved: ShopFile } | null>(null);
  // Ktory tekst ogloszenia jest teraz edytowany (klik w linijke w okienku czatu).
  const [editingText, setEditingText] = useState<string | null>(null);
  // Ceny odłożone przy odznaczaniu "Da się kupić / sprzedać" i przy przełączaniu "po kilka sztuk" -
  // ponowne zaznaczenie przywraca DOKŁADNIE to, co było, zamiast liczyć nową cenę (i gubić grosze na przeliczeniach).
  const priceMemoryRef = useRef(
    new Map<
      string,
      {
        buy?: { buy: number; amount: number };
        sell?: { sell: number; sellAmount: number };
        single?: LotSnapshot;
        lotted?: LotSnapshot;
      }
    >()
  );
  // Duze okienko "Jak dziala sklep" otwarte od razu na rozwinietych cenach dynamicznych.
  const [shopHelpDynamic, setShopHelpDynamic] = useState(false);
  // To samo dla tekstów ogłoszeń ("Dowiedz się więcej" z małego "?").
  const [shopHelpTexts, setShopHelpTexts] = useState(false);
  const [poolPickCat, setPoolPickCat] = useState<string | null>(null);
  const [poolPickBack, setPoolPickBack] = useState(false);
  // Ktora liste widac w srodkowej kolumnie: stale przedmioty czy pula rotacji.
  const [showPool, setShowPool] = useState(false);
  // "Włącz rotację" w zakładce puli otwiera sekcję Rotacja w prawym panelu.
  const [rotationFoldOpen, setRotationFoldOpen] = useState(false);
  // Przełącznik [Przedmioty | Pula rotacji] da się schować (np. ktoś nie używa rotacji) - zapamiętane na tym komputerze.
  const [rotationTabs, setRotationTabs] = useState(() => {
    try {
      return localStorage.getItem("pm-shop-rotation-tabs") !== "hidden";
    } catch {
      return true;
    }
  });
  function toggleRotationTabs() {
    const next = !rotationTabs;
    setRotationTabs(next);
    if (!next) setShowPool(false);
    try {
      localStorage.setItem("pm-shop-rotation-tabs", next ? "shown" : "hidden");
    } catch {
      // bez localStorage - po prostu nie zapamięta
    }
  }
  // Lista w srodkowej kolumnie da sie zwinac (jak lista zadan w Questach).
  const [listOpen, setListOpen] = useState(true);
  // Co jest "podniesione" z listy obok siatki: kategoria albo rola pola (Szukaj, Zamknij, Tło).
  const [picked, setPicked] = useState<{ cat?: string; role?: string } | null>(null);
  // Klik w pole siatki (gdy nic nie jest podniesione) otwiera okienko "co ma tu być".
  const [slotPick, setSlotPick] = useState<{ sc: string; slot: number } | null>(null);
  const [sortHelp, setSortHelp] = useState(false);
  const [screenHelp, setScreenHelp] = useState(false);
  // Przycisk ilości, przy którym ktoś wpisał więcej niż 64 - pokazujemy tam czerwoną informację.
  const [amountWarn, setAmountWarn] = useState<number | null>(null);
  // Podgląd tła w siatce: puste pola jako szare szkło, tak jak w grze (zapamiętane na tym komputerze).
  const [showBackground, setShowBackground] = useState(() => {
    try {
      return localStorage.getItem("pm-shop-menu-bg") !== "off";
    } catch {
      return true;
    }
  });
  // Kategoria pokazywana w podgladzie strony kategorii (jej przedmioty w polach).
  const [previewCat, setPreviewCat] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  // Nowy przycisk ilości startuje od 1 szt. - liczbę zmienia się w ramce "Przyciski ilości" obok siatki.
  const amountValue = 1;
  // Material stawianego tla - wybierasz raz na dole i klikasz pola w siatce.
  const [fillerMaterial, setFillerMaterial] = useState("BLACK_STAINED_GLASS_PANE");
  const [sortBy, setSortBy] = useState<Record<string, { by: "buy" | "sell"; dir: "asc" | "desc" }>>({});
  const [priceFilter, setPriceFilter] = useState<Record<string, PriceFilter>>({});
  const [trashConfirm, setTrashConfirm] = useState<string | null>(null);
  const [screen, setScreen] = useState("main-menu");
  // Podniesiona kategoria/przycisk dotyczy tylko okna, w którym ją wybrano - zmiana karty kończy wybór.
  useEffect(() => {
    setPicked(null);
    setSlotPick(null);
  }, [screen, tab]);
  // Strona kategorii zawsze pokazuje jakąś kategorię - na start pierwszą z listy (także po jej usunięciu).
  useEffect(() => {
    if (screen !== "category-page" || !file.cats.length) return;
    if (!previewCat || !file.cats.some((c) => c.id === previewCat)) {
      setPreviewCat(file.cats[0].id);
      setPreviewPage(0);
    }
  }, [screen, previewCat, file.cats]);
  const autoLoadedRef = useRef(false);
  const { iconPackDir, allMaterials } = useIconPack(setStatus);

  const unsaved = useMemo(() => serializeAll(file) !== serializeAll(saved), [file, saved]);
  const notSent = useMemo(() => serializeAll(saved) !== serializeAll(serverFile), [saved, serverFile]);
  useDirtyTracking(unsaved || notSent);
  const category = file.cats.find((c) => c.id === catId) ?? null;

  useEffect(() => {
    setTrashConfirm(null);
  }, [catId, sel, tab]);

  useEffect(() => {
    setRotationFoldOpen(false);
  }, [catId]);

  useEffect(() => {
    const h = historyRef.current;
    if (h.skip) {
      h.skip = false;
      h.prev = file;
      setHistoryTick((t) => t + 1);
      return;
    }
    if (file === h.prev) return;
    const now = Date.now();
    if (now - h.lastPush > 700) {
      h.past.push(h.prev);
      if (h.past.length > 100) h.past.shift();
    }
    h.lastPush = now;
    h.future = [];
    h.prev = file;
    setHistoryTick((t) => t + 1);
  }, [file]);

  function undoFile() {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(file);
    h.skip = true;
    h.lastPush = 0;
    setFile(prev);
  }

  function redoFile() {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(file);
    h.skip = true;
    h.lastPush = 0;
    setFile(next);
  }

  // Ctrl+Z / Ctrl+Y dla całej strony - ale nie w polach tekstowych, one mają własne cofanie.
  // Ctrl+S zapisuje wszędzie, także w trakcie pisania w polu.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (unsaved) save();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, .mc-rich")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoFile();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redoFile();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function load(pid: string, path: string) {
    if (!pid || !path) return;
    setBusy(true);
    setStatus(null);
    const base = path.replace(/\/+$/, "");
    const dir = shopDir(path);
    let lang = "en";
    let cur = "$";
    try {
      const coreConfig = await sftpReadFile(pid, `${base}/MainpluginsCore/config.yml`);
      lang = readSetting(coreConfig, "language") ?? "en";
      cur = readCurrency(coreConfig);
    } catch {
      // brak configu core - zostaje angielski i "$"
    }
    setLanguage(lang);
    setCurrencySign(cur);
    setCurrency(cur);
    let langText: string | null = null;
    try {
      langText = await sftpReadFile(pid, `${dir}/lang/${lang}.yml`);
    } catch {
      // pliku jeszcze nie ma - plugin bierze teksty z jara, czyli domyślne
    }
    const texts = parseAnnounceTexts(langText, lang);
    try {
      setRotationState(parseRotationState(await sftpReadFile(pid, `${dir}/rotation.yml`)));
    } catch {
      setRotationState({}); // losowania jeszcze nie było
    }
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
      const f = { settings, cats: ordered(settings, cats), texts };
      historyRef.current = { past: [], future: [], prev: f, lastPush: 0, skip: true };
      setFile(f);
      setSaved(f);
      setServerFile(f);
      setServerCatIds(ids);
      setCatId(f.cats[0]?.id ?? null);
      setSel({ kind: "cat" });
    } catch {
      // Na serwerze nie ma jeszcze nowego sklepu - pokazujemy Mały (jak plugin przy pierwszym starcie).
      const f = fromTemplate(shopTemplateFor(lang), texts);
      historyRef.current = { past: [], future: [], prev: f, lastPush: 0, skip: true };
      setFile(f);
      setSaved(f);
      setServerFile({ ...EMPTY, texts });
      setServerCatIds([]);
      setCatId(f.cats[0]?.id ?? null);
      setSel({ kind: "cat" });
      setStatus(`Na serwerze nie ma jeszcze sklepu - wczytano domyślny (język: ${lang}). Kliknij „Wyślij na serwer”, żeby go tam zapisać.`);
    } finally {
      setBusy(false);
    }
    refreshStats(pid, path);
    const ids = new Set<string>();
    const icons: Record<string, string> = {};
    const names: Record<string, string> = {};
    try {
      const catalog = (await loadItemCatalog(pid, path)).items;
      catalog.forEach((it) => {
        ids.add(it.id);
        icons[it.id] = it.material;
        if (plain(it.name).trim()) names[it.id] = plain(it.name).trim();
      });
      setCatalogIds(new Set(catalog.map((it) => it.id)));
    } catch {
      // katalog opcjonalny
      setCatalogIds(null);
    }
    try {
      const jars = (await sftpListDir(pid, base)).filter((e) => !e.is_dir).map((e) => e.name);
      setSpawnersInstalled(jars.some((n) => /^mainplugins-spawners.*\.jar$/i.test(n)));
    } catch {
      setSpawnersInstalled(null);
    }
    try {
      parseSpawnerConfig(await sftpReadFile(pid, `${base}/MainpluginsSpawners/spawnery-typy.yml`)).typy.forEach((t) => {
        ids.add(`spawner_${t.id.toLowerCase()}`);
        names[`spawner_${t.id.toLowerCase()}`] = `Spawner: ${t.nazwaPojedyncza}`;
      });
    } catch {
      // bez Spawnerów nie ma ich na liście
    }
    setCustomIcons(icons);
    setCustomNames(names);
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
    // "Wyślij na serwer" = wyślij to, co widać - niezapisane zmiany zapisują się przy okazji, bez pytania.
    const toSend = file;
    if (unsaved) setSaved(file);
    const warnings = shopProblems(toSend.settings, toSend.cats);
    if (warnings.length && !(await ask(`Uwaga:\n- ${warnings.join("\n- ")}\n\nWysłać mimo to?`, { title: "Uwaga", kind: "warning" }))) return;
    const removed = serverCatIds.filter((id) => !toSend.cats.some((c) => c.id === id));
    // Zawsze pytamy - wysyłka od razu zmienia sklep graczom. Czerwony przycisk, gdy znikają całe kategorie.
    if (
      !(await ask("Na pewno chcesz wysłać wszystkie zmiany? Zmiany będą od razu widoczne na serwerze.", {
        title: "Wysłać zmiany na serwer?",
        kind: "warning",
        okLabel: "Wyślij",
        danger: removed.length > 0,
      }))
    )
      return;
    setBusy(true);
    setStatus(null);
    const dir = shopDir(pluginsPath);
    try {
      await sftpWriteFile(profileId, `${dir}/shop.yml`, serializeShopSettings(toSend.settings));
      for (const c of toSend.cats) await sftpWriteFile(profileId, `${dir}/categories/${c.id}.yml`, serializeCategory(c));
      for (const id of removed) await sftpDeleteFile(profileId, `${dir}/categories/${id}.yml`);
      const textsChanged = !sameTexts(toSend.texts, serverFile.texts);
      if (textsChanged) {
        // Czytamy plik świeżo z serwera i zmieniamy w nim tylko linijki zmienionych tekstów.
        const langPath = `${dir}/lang/${language}.yml`;
        let current = "";
        try {
          current = await sftpReadFile(profileId, langPath);
        } catch {
          // brak pliku - powstanie z samymi zmienionymi tekstami, resztę plugin weźmie z jara
        }
        await sftpWriteFile(profileId, langPath, patchLangFile(current, changedTexts(toSend.texts, serverFile.texts)));
      }
      setServerFile(toSend);
      setServerCatIds(toSend.cats.map((c) => c.id));
      let msg = "Wysłano na serwer.";
      try {
        await rconSendCommand(profileId, "@shop reload");
        msg += " Sklep na serwerze wczytany od nowa - zmiany już działają.";
        // Teksty z lang/ wczytuje od nowa core, nie sam Sklep.
        if (textsChanged) await rconSendCommand(profileId, "@reloadlang");
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

  /** Pobiera raport sprzedaży (plik do Excela, który plugin sam robi na serwerze) do wybranego folderu. */
  async function downloadReport() {
    if (!profileId || !pluginsPath) return;
    let folder: string | null = null;
    try {
      const picked = await openDialog({ directory: true, defaultPath: await desktopDir(), title: "Gdzie zapisać raport sprzedaży?" });
      folder = typeof picked === "string" ? picked : null;
    } catch (e) {
      setStatus(String(e));
      return;
    }
    if (!folder) return;
    const day = new Date().toISOString().slice(0, 10);
    const target = await join(folder, `raport-sklepu-${day}.csv`);
    try {
      await sftpDownloadFile(profileId, `${shopDir(pluginsPath)}/stats.csv`, target);
      setStatus(`Zapisano raport: ${target} - otwórz go w Excelu.`);
    } catch {
      setStatus("Raportu jeszcze nie ma na serwerze - sklep tworzy go sam, gdy gracze zaczną coś sprzedawać. Spróbuj później.");
    }
  }

  async function loadTemplate(id: string) {
    const t = shopTemplateChoices(language).find((x) => x.id === id);
    if (!t) return;
    const confirmed = await ask(
      `Wczytać szablon „${t.label}”? Sklep w edytorze zostanie zastąpiony (na serwerze nic się nie zmieni, dopóki nie wyślesz).`,
      { title: "Wczytać szablon?", kind: "warning" }
    );
    if (!confirmed) return;
    const f = fromTemplate(t.template, file.texts);
    setFile(f);
    setCatId(f.cats[0]?.id ?? null);
    setSel({ kind: "cat" });
    setTab("cats");
    setStatus(`Wczytano szablon „${t.label}”. Kliknij „Zapisz”, a potem „Wyślij na serwer”.`);
  }

  // ---- zmiany ----

  /** Otwiera przewodnik "Jak działa sklep", od razu z rozwiniętą wybraną częścią. */
  function openGuide(part: "dynamic" | "texts") {
    setShopHelpDynamic(part === "dynamic");
    setShopHelpTexts(part === "texts");
    setShopHelp(true);
  }

  function setTexts(patch: AnnounceTexts) {
    setFile({ ...file, texts: { ...file.texts, ...patch } });
  }

  function openTexts(key: string | null = null) {
    setEditingText(key);
    setTab("settings");
    setSettingsSection("texts");
  }

  function setSettings(patch: Partial<ShopSettingsDraft>) {
    const next = { ...file.settings, ...patch };
    // Kategoria w menu zawsze ma swoje pole (np. po dodaniu nowej albo przywróceniu do menu).
    const main = next.menus["main-menu"];
    const layout = ensureCategorySlots(main.layout, next.categoryOrder, main.size);
    if (layout.length !== main.layout.length) next.menus = { ...next.menus, "main-menu": { ...main, layout } };
    setFile({ ...file, settings: next });
  }

  /**
   * Kategorie i menu to dwie różne rzeczy: `cats` to wszystko, co jest w sklepie, a
   * `categoryOrder` to te, które mają ikonkę w menu (i w jakiej kolejności). Kategoria
   * poza menu dalej działa - plugin ją wczytuje, tylko gracz nie widzi jej kafelka.
   * Nowa kategoria wchodzi do menu, skasowana z niego wypada; reszta zostaje jak była.
   */
  function setCats(cats: CategoryDraft[]) {
    const ids = cats.map((c) => c.id);
    const main = file.settings.menus["main-menu"];
    // Usunięta kategoria zabiera swoje pole - inne zostają na swoich miejscach (bez przeskakiwania).
    let menu = { layout: main.layout, order: file.settings.categoryOrder };
    for (const id of file.settings.categoryOrder.filter((x) => !ids.includes(x))) menu = hideCategoryFromMenu(menu.layout, menu.order, id);
    const added = ids.filter((id) => !menu.order.includes(id));
    const order = [...menu.order, ...added];
    // Nowa kategoria dostaje pierwsze wolne pole w menu.
    const layout = ensureCategorySlots(menu.layout, order, main.size);
    setFile({
      ...file,
      cats,
      settings: { ...file.settings, categoryOrder: order, menus: { ...file.settings.menus, "main-menu": { ...main, layout } } },
    });
  }

  /** Kategoria znika z menu, ale zostaje w sklepie - można ją później postawić z powrotem. */
  function hideFromMenu(id: string) {
    const main = file.settings.menus["main-menu"];
    const next = hideCategoryFromMenu(main.layout, file.settings.categoryOrder, id);
    setSettings({ categoryOrder: next.order, menus: { ...file.settings.menus, "main-menu": { ...main, layout: next.layout } } });
  }

  /** Usuwa pole z układu ekranu; kategoria z tego pola wypada z menu, a inne zostają na swoich polach. */
  function clearSlot(sc: string, slot: number) {
    const next = removeMenuSlot(menuOf(sc).layout, file.settings.categoryOrder, slot);
    setScreenLayout(sc, { layout: next.layout }, next.order);
  }

  /** Strona kategorii: kategoria, której układ teraz edytujemy (brak = wspólny układ). */
  function layoutCat(sc: string): CategoryDraft | undefined {
    return sc === "category-page" ? file.cats.find((c) => c.id === previewCat) : undefined;
  }

  /** Kategoria, do której trafiają zmiany układu - brak, gdy jest wspólny układ albo nic nie wybrano. */
  function ownLayoutCat(sc: string): CategoryDraft | undefined {
    return file.settings.sharedCategoryLayout ? undefined : layoutCat(sc);
  }

  /** Okno, które widać w edytorze: układ podglądanej kategorii (własny albo startowy) albo wspólny. */
  function menuOf(sc: string): MenuScreenDraft {
    return ownLayoutCat(sc)?.layout ?? file.settings.menus[sc];
  }

  /**
   * Zmiana okna. Strona kategorii bez wspólnego układu: zmiana trafia TYLKO do wybranej kategorii,
   * inne zostają jak były. Wspólny układ albo brak wybranej kategorii - menus.category-page.
   */
  function setScreenLayout(sc: string, patch: Partial<MenuScreenDraft>, order?: string[]) {
    const pc = ownLayoutCat(sc);
    if (pc) {
      updateCategory(pc.id, { layout: { ...menuOf(sc), ...patch } });
      return;
    }
    setSettings({ ...(order ? { categoryOrder: order } : {}), menus: { ...file.settings.menus, [sc]: { ...file.settings.menus[sc], ...patch } } });
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
    // Wraca na swoje miejsce: kolejność stałych z serwera (a jak tam kategorii nie ma - z zapisanej).
    const home = serverFile.cats.find((x) => x.id === c.id) ?? saved.cats.find((x) => x.id === c.id);
    const next = moveBackFromPool(c, indexes, home?.items.map((it) => it.ref) ?? []);
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

  /** Materiał do ikonki custom itemu; spawnery ze Spawnerów (spawner_zombie itd.) wyglądają jak zwykły spawner. */
  function customIcon(id: string): string | undefined {
    return customIcons[id] ?? (id.toLowerCase().startsWith("spawner_") ? "SPAWNER" : undefined);
  }

  /** Czemu custom item NIE pokaże się w sklepie (albo null, gdy wszystko gra albo nie wiadomo). */
  function customProblem(r: ItemRef): string | null {
    if (r.custom == null) return null;
    const id = r.custom;
    if (id.toLowerCase().startsWith("spawner_")) {
      if (spawnersInstalled === false)
        return "Na serwerze nie ma pluginu Spawnery - ten spawner nie pokaże się w sklepie. Wgrasz go w „Twoje pluginy”.";
      if (spawnersInstalled && Object.keys(customNames).some((k) => k.startsWith("spawner_")) && !customNames[id]) return "Plugin Spawnery nie zna takiego spawnera - ten przedmiot nie pokaże się w sklepie.";
      return null;
    }
    if (catalogIds && !catalogIds.has(id) && !customIds.includes(id)) return "Tego przedmiotu nie ma w zakładce „Custom itemy” - nie pokaże się w sklepie.";
    return null;
  }

  const pickerIcons = Object.fromEntries(customIds.map((id) => [id, customIcon(id)]).filter((e): e is [string, string] => !!e[1]));

  function iconOf(r: ItemRef) {
    const look = r.custom != null ? customIcon(r.custom) : undefined;
    if (look) return <MaterialIcon material={look} iconPackDir={iconPackDir} />;
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
    if (trashConfirm === key) return <div key={key}>{confirmRow("Usunąć ten przedmiot?", () => removeItem(c, pool, i))}</div>;
    const active = sel.kind === "item" && sel.pool === pool && sel.index === i;
    return (
      <div key={key} className="ci-cat-row">
        <button type="button" className={`ci-item${active ? " active" : ""}`} onClick={() => setSel({ kind: "item", pool, index: i })}>
          {iconOf(it.ref)}
          <span className="ci-item-text">
            <span className="ci-item-name">
              {it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref, customNames)}
            </span>
            <span className="small muted">{priceText(it)}</span>
            {((it.buy != null && it.sell != null && it.sell / it.sellAmount >= it.buy / it.amount) || customProblem(it.ref)) && (
              <span className="ci-badges">
                {it.buy != null && it.sell != null && it.sell / it.sellAmount >= it.buy / it.amount && <span className="ci-badge warn">skup ≥ kupno</span>}
                {customProblem(it.ref) && (
                  <span className="ci-badge warn" title={customProblem(it.ref) ?? ""}>
                    nie pokaże się w sklepie
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
        {pool && (
          <button type="button" title="Wróć do stałych - przedmiot znów będzie w sklepie zawsze" onClick={() => moveBack(c, [i])}>
            <Undo2 size={14} strokeWidth={1.75} />
          </button>
        )}
        {!pool && c.rotation?.enabled && (
          <button
            type="button"
            className="ci-row-action"
            title="Do puli rotacji - sklep będzie ten przedmiot losował co jakiś czas, zamiast mieć go zawsze"
            onClick={() => {
              updateCategory(c.id, movedToPool(c, [i]));
              if (sel.kind === "item" && !sel.pool) setSel({ kind: "cat" });
            }}
          >
            <Shuffle size={15} strokeWidth={1.75} />
          </button>
        )}
        {trashButton(key, "Usuń przedmiot")}
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

  /** Okienko z liczbą; `unit` (np. "min", "%", "dni") stoi zaraz obok, żeby było wiadomo, w czym to jest. */
  function numberInput(value: number | null, onChange: (n: number) => void, step = "0.01", min = 0, unit?: string) {
    const input = (
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        style={{ width: "8rem" }}
      />
    );
    if (!unit) return input;
    return (
      <span className="ci-unit-input">
        {input}
        <span className="ci-unit">{unit}</span>
      </span>
    );
  }

  // ---- prawy panel: pozycja ----

  function renderItem(c: CategoryDraft, pool: boolean, index: number) {
    const it = listOf(c, pool)[index];
    if (!it) return null;
    const set = (patch: Partial<ShopItemDraft>) => updateItem(c, pool, index, patch);
    const lotted = isLotted(it);
    const rounding = file.settings.rounding;
    const memKey = `${c.id}|${pool}|${itemKey(it.ref)}|${it.instrument}`;
    const mem = priceMemoryRef.current.get(memKey) ?? {};
    priceMemoryRef.current.set(memKey, mem);
    // Odłożona cena w innym przeliczeniu (inna porcja) - dokładnie, gdy porcja się zgadza.
    const restore = (price: number, fromLot: number, toLot: number) =>
      fromLot === toLot ? price : Math.round(((price * Math.max(1, toLot)) / Math.max(1, fromLot)) * 100) / 100;
    const toggleLotted = (on: boolean) => {
      const now = { amount: it.amount, sellAmount: it.sellAmount, buy: it.buy, sell: it.sell };
      const back = on ? mem.lotted : mem.single;
      if (on) mem.single = now;
      else mem.lotted = now;
      set(switchLot(now, on, back));
    };
    return (
      <>
        <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          {iconOf(it.ref)} {it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref, customNames)}
          <span className="muted small">{pool ? "(pula rotacji)" : ""}</span>
          <span style={{ flex: 1 }} />
          {pool && (
            <button type="button" title="Przedmiot wraca na stałą listę kategorii" onClick={() => moveBack(c, [index])}>
              Wróć do stałych
            </button>
          )}
          {!pool && c.rotation?.enabled && (
            <button
              type="button"
              title="Przedmiot przestaje być w sklepie zawsze - sklep będzie go losował co jakiś czas (rotacja tej kategorii)"
              onClick={() => {
                const poolSize = c.rotation?.pool.length ?? 0;
                updateCategory(c.id, movedToPool(c, [index]));
                if (!rotationTabs) toggleRotationTabs();
                setShowPool(true);
                setSel({ kind: "item", pool: true, index: poolSize });
              }}
            >
              <Shuffle size={14} strokeWidth={1.75} /> Do puli rotacji
            </button>
          )}
          <button type="button" title="Wyżej" onClick={() => moveItem(c, pool, index, -1)} disabled={index === 0}>
            <ArrowUp size={14} />
          </button>
          <button type="button" title="Niżej" onClick={() => moveItem(c, pool, index, 1)} disabled={index === listOf(c, pool).length - 1}>
            <ArrowDown size={14} />
          </button>
        </h2>
        <CommandTip
          commands={[
            { cmd: `/@shop info ${itemKey(it.ref)}`, what: "ceny i stan rynku tego przedmiotu" },
            { cmd: `/@shop event ${itemKey(it.ref)} +50 2h`, what: "event: skup +50% przez 2 godziny" },
            { cmd: `/@shop event ${itemKey(it.ref)} off`, what: "kończy event na tym przedmiocie" },
            { cmd: `/@shop reset ${itemKey(it.ref)}`, what: "skup wraca do normy" },
          ]}
        />
        {customProblem(it.ref) && (
          <div className="ci-error ci-error-big">
            <TriangleAlert size={22} strokeWidth={2} />
            <div>
              <b>Ten przedmiot nie działa</b>
              <p>{customProblem(it.ref)}</p>
              <Link to="/tools" className="ci-error-link">
                Przejdź do „Twoje pluginy” →
              </Link>
            </div>
          </div>
        )}
        {/* Gdy przedmiot i tak nie działa, jego ustawienia są wyszarzone i rozmyte - nie ma czego edytować. */}
        <div className={customProblem(it.ref) ? "ci-disabled" : undefined} aria-disabled={!!customProblem(it.ref)} inert={!!customProblem(it.ref)}>
        <Fold title="Przedmiot" open>
          <ItemRefPicker value={it.ref} onChange={(r) => set({ ref: r.custom != null ? { custom: r.custom } : { item: r.item } })} materials={allMaterials} customIds={customIds} iconPackDir={iconPackDir} customIcons={pickerIcons} />
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
              checked={it.buy != null}
              // Cena w pliku jest za cały stack, a pole w aplikacji za sztukę - startowa "1" musi
              // być za sztukę, inaczej przy stacku 64 pokazywało się 0.02.
              onChange={(e) => {
                if (!e.target.checked) {
                  if (it.buy != null) mem.buy = { buy: it.buy, amount: it.amount };
                  set({ buy: null });
                } else set({ buy: mem.buy ? restore(mem.buy.buy, mem.buy.amount, it.amount) : fromPerPiece(20, it.amount) });
              }}
            />
            Da się kupić
          </label>
          {it.buy != null &&
            (lotted ? (
              <>
                <label>
                  <span className="ci-field-title">Cena kupna za sztukę</span>
                  {numberInput(perPiece(it.buy, it.amount), (n) => set({ buy: fromPerPiece(n, it.amount) }), "0.01", 0, currency.trim())}
                </label>
              </>
            ) : (
              <label>
                <span className="ci-field-title">Cena kupna za sztukę</span>
                {numberInput(it.buy, (n) => set({ buy: n }), "0.01", 0, currency.trim())}
              </label>
            ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={it.sell != null}
              // Startowy skup to polowa ceny kupna (za sztuke), zeby nowy przedmiot od razu byl
              // sensowny i nie zapalal ostrzezenia "skup >= kupno". Bez ceny kupna: 10 za sztuke.
              onChange={(e) => {
                if (!e.target.checked) {
                  if (it.sell != null) mem.sell = { sell: it.sell, sellAmount: it.sellAmount };
                  set({ sell: null });
                } else
                  set({
                    sell: mem.sell
                      ? restore(mem.sell.sell, mem.sell.sellAmount, it.sellAmount)
                      : fromPerPiece((perPiece(it.buy, it.amount) ?? 20) / 2, it.sellAmount),
                  });
              }}
            />
            Da się sprzedać
          </label>
          {it.sell != null && (
            <label className="checkbox ci-sub-option">
              <input
                type="checkbox"
                checked={lotted}
                onChange={(e) => toggleLotted(e.target.checked)}
              />
              Skup po kilka sztuk naraz
              <HelpButton id="shop-price-portion" title="Po co to jest" onClick={() => setPriceHelp(true)} />
            </label>
          )}
          {it.sell != null &&
            (lotted ? (
              <>
                <label>
                  <span className="ci-field-title">Gracz sprzedaje po</span>
                  {numberInput(it.sellAmount, (n) => set({ sellAmount: Math.max(1, Math.floor(n)) }), "1", 1, "szt. naraz")}
                  <span className="muted small">Sprzedaje tylko pełne {it.sellAmount} szt. - to, co zostanie ponad nie, zostaje mu w ekwipunku</span>
                </label>
                <label>
                  <span className="ci-field-title">Cena skupu za {it.sellAmount} szt.</span>
                  {numberInput(it.sell, (n) => set({ sell: n }), "0.01", 0, currency.trim())}
                  <span className="muted small">Czyli {money(perPiece(it.sell, it.sellAmount))} za sztukę</span>
                </label>
              </>
            ) : (
              <label>
                <span className="ci-field-title">Cena skupu za sztukę</span>
                {numberInput(it.sell, (n) => set({ sell: n }), "0.01", 0, currency.trim())}
              </label>
            ))}
          <label className="checkbox">
            <input type="checkbox" checked={!it.dynamic} onChange={(e) => set({ dynamic: !e.target.checked })} />
            Cena stała
            <HelpButton id="shop-fixed-price" title="Po co to jest" onClick={() => setFixedHelp(true)} />
          </label>
          <p className="ci-note small">
            {rounding === "whole" ? (
              <>
                <b>Pełne złotówki:</b> niepełna porcja zaokrągla się w górę do złotówki. Zmienisz to w Ustawieniach → Ceny.
              </>
            ) : (
              <>
                <b>Z groszami:</b> ceny liczą się co do grosza. Zmienisz to w Ustawieniach → Ceny.
              </>
            )}
          </p>
          {it.buy != null && it.sell != null && it.sell / it.sellAmount >= it.buy / it.amount && (
            <p className="ci-badge warn">Skup za sztukę jest co najmniej taki jak kupno - gracze zarobią na kupowaniu i sprzedawaniu w kółko.</p>
          )}
        </Fold>
        </div>
      </>
    );
  }

  // ---- prawy panel: kategoria ----

  function renderCategory(c: CategoryDraft) {
    return (
      <>
        <h2>
          <MinecraftTextPreview text={c.name} emptyLabel={c.id} />{" "}
          {c.id === "kolekcja" && (
            <>
              {" "}
              <HelpButton id="shop-collection-info" kind="info" title="Na czym polega Kolekcja" onClick={() => setCollectionInfo(true)} />
            </>
          )}
        </h2>
        <CommandTip
          commands={[
            { cmd: `/shop ${c.id}`, what: "gracz od razu otwiera tę kategorię" },
            { cmd: `/@shop npc create ${c.id} ${c.name}`, what: "stawia w Twoim miejscu NPC, który otwiera tę kategorię" },
            { cmd: `/@shop sign ${c.id}`, what: "patrzysz na tabliczkę - po kliknięciu otwiera tę kategorię" },
            { cmd: `/@shop open <gracz> ${c.id}`, what: "otwiera graczowi tę kategorię (do NPC z innych pluginów i menu serwera)" },
            ...(c.rotation?.enabled ? [{ cmd: `/@shop rotation force ${c.id}`, what: "losuje od razu nową ofertę rotacji" }] : []),
          ]}
        />
        <Fold title="Nazwa i ikonka" open>
          <label>
            Nazwa
            <MinecraftTextInput value={c.name} onChange={(v) => updateCategory(c.id, { name: v })} placeholder="&e&lNazwa kategorii" />
          </label>
          <div className="ci-section-title">Ikonka w menu głównym</div>
          <ItemRefPicker value={c.icon} onChange={(ref) => updateCategory(c.id, { icon: ref.custom != null ? { custom: ref.custom } : { item: ref.item } })} materials={allMaterials} customIds={customIds} iconPackDir={iconPackDir} customIcons={pickerIcons} />
        </Fold>
        <Fold key={`rot-${c.id}-${rotationFoldOpen}`} title="Rotacja" open={rotationFoldOpen || undefined}>
          {renderRotationSettings(c)}
        </Fold>
      </>
    );
  }

  /** Wszystko o rotacji kategorii (włącznik, ilość, dni, pula, ogłoszenie) - sekcja "Rotacja" w prawym panelu. */
  function renderRotationSettings(c: CategoryDraft) {
    const r = c.rotation;
    return (
      <>
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
            <HelpButton id="shop-rotation" title="Po co jest rotacja" onClick={() => setRotationHelp(true)} />
          </label>
          {r?.enabled && (
            <>
              <label>
                <span className="ci-field-title">Ilość przedmiotów w rotacji</span>
                {numberInput(r.show, (n) => updateCategory(c.id, { rotation: { ...r, show: Math.max(1, Math.floor(n)) } }), "1", 1, "szt.")}
                <span className="muted small">
                  W sklepie naraz widać {r.show} {plural(r.show, "przedmiot wylosowany", "przedmioty wylosowane", "przedmiotów wylosowanych")} z
                  puli
                </span>
              </label>
              <label>
                <span className="ci-field-title">Co ile dni nowa oferta</span>
                {numberInput(r.everyDays, (n) => updateCategory(c.id, { rotation: { ...r, everyDays: Math.max(1, Math.floor(n)) } }), "1", 1, "dni")}
                <span className="muted small">Sklep losuje nowe przedmioty {everyDays(r.everyDays)}</span>
              </label>
              <div className="ci-field-title" style={{ marginTop: "0.6rem" }}>
                Pula - z czego sklep losuje
              </div>
              <p className="muted small">
                Pula ma {r.pool.length} {plural(r.pool.length, "przedmiot", "przedmioty", "przedmiotów")}, stałych jest {c.items.length}.
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
                  title="Losuje 5 przedmiotów z kategorii i przenosi je do puli"
                  onClick={() => updateCategory(c.id, movedToPool(c, randomPick(5, c.items.length)))}
                  disabled={c.items.length === 0}
                >
                  Wypełnij losowo
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
              </div>
              <label className="checkbox" style={{ marginTop: "0.6rem" }}>
                <input
                  type="checkbox"
                  checked={r.announce}
                  onChange={(e) => updateCategory(c.id, { rotation: { ...r, announce: e.target.checked } })}
                />
                Ogłoś na czacie, gdy oferta się zmieni
              </label>
              {r.announce && rotationAnnouncePreview(c, r)}
            </>
          )}
      </>
    );
  }

  // ---- okienka rotacji ----

  /** Ogolne wytlumaczenie: z czego sklep sie sklada i jakie ma systemy. */
  function rotationAnnouncePreview(c: CategoryDraft, r: NonNullable<CategoryDraft["rotation"]>) {
    const num = (n: number | null) => (n == null ? "0" : Number.isInteger(n) ? String(n) : n.toFixed(2));
    const shown = r.pool.slice(0, Math.min(r.show, 3));
    const head = { category: c.name, days: String(r.everyDays) };
    const lines = shown.length
      ? shown.map((it) => ({
          item: it.name.trim() ? it.name : refLabel(it.ref, customNames),
          price: num(it.buy ?? it.sell),
          amount: String(it.buy != null ? it.amount : it.sellAmount),
          currency,
        }))
      : [{ item: SAMPLE_VALUES.item, price: SAMPLE_VALUES.price, amount: SAMPLE_VALUES.amount, currency }];
    return (
      <div className="ci-announce-preview">
        <div className="row" style={{ alignItems: "center", margin: 0 }}>
          <span style={{ flex: 1 }}>
            <span className="ci-field-title">Tak to wygląda na czacie</span>
            {!shown.length && <span className="muted small"> (przykładowy przedmiot - pula rotacyjna jest pusta)</span>}
          </span>
          <button type="button" onClick={() => openTexts("rotation.broadcast-header")} title="Tekst jest wspólny dla wszystkich kategorii - zmieniasz go w Ustawieniach">
            Zmień tekst
          </button>
        </div>
        <div className="mc-preview ci-chat-lines">
          <div>
            <MinecraftTextPreview text={fillPlaceholders(file.texts["rotation.broadcast-header"] ?? "", head)} emptyLabel="(pusty nagłówek)" />
          </div>
          {lines.map((ph, i) => (
            <div key={i}>
              <MinecraftTextPreview text={fillPlaceholders(file.texts["rotation.broadcast-item"] ?? "", ph)} emptyLabel="(pusta linijka)" />
            </div>
          ))}
          {r.show > lines.length && shown.length > 0 && <div className="muted small">... i jeszcze {r.show - lines.length} takich linijek</div>}
          <div>
            <MinecraftTextPreview text={fillPlaceholders(file.texts["rotation.broadcast-footer"] ?? "", head)} emptyLabel="(pusta stopka)" />
          </div>
        </div>
      </div>
    );
  }

  /** Żółte ostrzeżenie przy cenach dynamicznych - od razu w Ustawieniach, nad polami z liczbami. */
  function dynamicWarning() {
    return (
      <p className="ci-warning small">
        <b>Uwaga:</b> to ustawienia dla zaawansowanych i łatwo tu coś przesadzić - np. za duży spadek sprawi, że sprzedawanie przestanie
        się opłacać, a za duży wzrost da graczom łatwy sposób na zarobek. Wartości domyślne są przemyślane i przetestowane, dlatego
        zalecamy ostrożność: zmieniaj po trochę i obserwuj, jak reaguje ekonomia serwera.
      </p>
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
                    <span className="ci-item-name">{it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref, customNames)}</span>
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
    const m: MenuScreenDraft = menuOf(sc);
    const setMenu = (patch: Partial<MenuScreenDraft>) => setScreenLayout(sc, patch);
    const content: Record<number, SlotContent> = {};
    const catBySlot = categoryBySlot(m.layout, file.settings.categoryOrder);
    // Który przedmiot stoi w którym polu - liczone tak samo jak w pluginie (patrz previewSlotItems).
    const slotItem = previewSlotItems(sc);
    const roleAt = (slot: number) => m.layout.find((e) => e.slot === slot)?.role;
    /** Pole z przedmiotem z rotacji (k = który z wylosowanych). */
    const rotatingContent = (pc: CategoryDraft, k: number, onClick: () => void): SlotContent => {
      const rotIt = activeRotation(pc, rotationState[pc.id])[k];
      return rotIt
        ? {
            label: `${rotIt.name.trim() ? plain(rotIt.name) : refLabel(rotIt.ref, customNames)} (z rotacji - zniknie przy następnym losowaniu)`,
            kind: "item",
            material: rotIt.ref.item ?? (rotIt.ref.custom != null ? customIcon(rotIt.ref.custom) : undefined),
            sublabel: money(perPiece(rotIt.buy, rotIt.amount)),
            rotating: true,
            onClick,
          }
        : { label: "Z rotacji - przedmiot wylosuje się sam z puli", sublabel: "?", kind: "item", rotating: true, onClick };
    };
    for (const e of m.layout) {
      if (e.role === "CATEGORY_SLOT") {
        const catId = catBySlot.get(e.slot);
        const cat = file.cats.find((c) => c.id === catId);
        content[e.slot] = {
          label: cat ? plain(cat.name) : "Wolne miejsce na kategorię",
          kind: "category",
          // Puste pole ma wygladac jak tlo, ale zostaje polem (da sie je usunac w trybie ukladu).
          // W grze stoi tam szare szklo, wiec przy podgladzie tla pokazujemy je tak samo.
          blank: !cat,
          material: cat ? cat.icon.item : showBackground ? "GRAY_STAINED_GLASS_PANE" : undefined,
          dim: !cat,
          // Klikniecie pola stawia tu to, co podniesione z listy obok (dziala tez w trybie ukladu).
          onClick: picked ? () => placePicked(sc, e.slot) : () => setSlotPick({ sc, slot: e.slot }),
          highlighted: Boolean(picked) && !cat,
        };
      } else if (e.role === "ITEM_SLOT") {
        const pc = sc === "category-page" ? file.cats.find((c) => c.id === previewCat) : undefined;
        const idx = slotItem.get(e.slot);
        const it = pc && idx != null ? pc.items[idx] : undefined;
        const open = picked ? () => placePicked(sc, e.slot) : () => setSlotPick({ sc, slot: e.slot });
        if (pc && idx != null && idx >= pc.items.length) {
          content[e.slot] = rotatingContent(pc, idx - pc.items.length, open);
          continue;
        }
        content[e.slot] = it
          ? {
              label: it.name.trim() ? plain(it.name) : refLabel(it.ref, customNames),
              kind: "item",
              material: it.ref.item ?? (it.ref.custom != null ? customIcon(it.ref.custom) : undefined),
              sublabel: money(perPiece(it.buy, it.amount)),
              onClick: open,
            }
          : { label: pc ? "" : "Przedmiot", kind: "item", dim: true, blank: Boolean(pc), onClick: open };
      } else if (e.role === "ROTATION_SLOT") {
        // Własne miejsce na rotację: wylosowane przedmioty stoją tu po kolei, reszta pól zostaje pusta.
        const pc = layoutCat(sc);
        const idx = slotItem.get(e.slot);
        const open = picked ? () => placePicked(sc, e.slot) : () => setSlotPick({ sc, slot: e.slot });
        content[e.slot] =
          pc && idx != null
            ? rotatingContent(pc, idx - pc.items.length, open)
            : { label: "Miejsce na przedmiot z rotacji (teraz puste)", kind: "item", rotating: true, dim: true, onClick: open };
      } else if (e.role === "AMOUNT_SLOT") {
        // Pole "ile sztuk kupic" - liczy sie sama liczba, a kamien i tak byl obrazkiem na niby.
        content[e.slot] = {
          label: String(e.amount ?? 1),
          sublabel: "szt.",
          kind: "amount",
          onClick: picked ? () => placePicked(sc, e.slot) : () => setSlotPick({ sc, slot: e.slot }),
        };
      } else if (e.role === "FILLER") {
        content[e.slot] = {
          label: "Tło",
          kind: "nav",
          material: e.material ?? "GRAY_STAINED_GLASS_PANE",
          onClick: picked ? () => placePicked(sc, e.slot) : () => setSlotPick({ sc, slot: e.slot }),
        };
      } else {
        content[e.slot] = {
          label: ROLE_LABELS[e.role] ?? e.role,
          kind: "nav",
          material: roleMaterial(e.role, sc, file.settings.buttons),
          onClick: picked ? () => placePicked(sc, e.slot) : () => setSlotPick({ sc, slot: e.slot }),
        };
      }
    }
    // Puste pola też są klikalne: z podniesioną rzeczą - "postaw tutaj", bez niej - okienko wyboru.
    for (let i = 0; i < m.size; i++) {
      if (content[i]) continue;
      // Plugin wypełnia wszystkie wolne pola szarym szkłem - podgląd tła pokazuje to samo.
      const bg = showBackground ? { material: "GRAY_STAINED_GLASS_PANE", label: "Tło (szare szkło)" } : { label: "" };
      content[i] = picked
        ? { ...bg, kind: "filler", blank: true, highlighted: true, onClick: () => placePicked(sc, i) }
        : { ...bg, kind: "filler", blank: true, onClick: () => setSlotPick({ sc, slot: i }) };
    }
    return (
      <>
        <div className="ci-grid-wrap">
        {/* Podgląd tła i "?" o tym ekranie - w lewym górnym rogu obok siatki. */}
        <div className="ci-grid-tools">
        <button
          type="button"
          className={`ci-view-toggle${showBackground ? " on" : ""}`}
          title={showBackground ? "Wolne pola wyglądają jak w grze (szare szkło) - kliknij, żeby schować" : "Pokaż wolne pola jak w grze (szare szkło)"}
          onClick={() => {
            const next = !showBackground;
            setShowBackground(next);
            try {
              localStorage.setItem("pm-shop-menu-bg", next ? "on" : "off");
            } catch {
              // bez localStorage - nie zapamięta
            }
          }}
        >
          {showBackground ? <Eye size={14} strokeWidth={1.75} /> : <EyeOff size={14} strokeWidth={1.75} />} Tło
        </button>
        <HelpButton id={`shop-screen-${sc}`} title={`Co to jest: ${SCREEN_LABELS[sc]}`} onClick={() => setScreenHelp(true)} />
        </div>
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
            // Pola rotacji przesuwa się jak przyciski - przedmioty z rotacji wypełniają je same po kolei.
            if (roleAt(from) === "ROTATION_SLOT" || roleAt(to) === "ROTATION_SLOT") {
              setMenu({ layout: m.layout.map((e) => (e.slot === from ? { ...e, slot: to } : e.slot === to ? { ...e, slot: from } : e)) });
              return;
            }
            const a = slotItem.get(from);
            const b = slotItem.get(to);
            const swap = (l: typeof m.layout) => l.map((e) => (e.slot === from ? { ...e, slot: to } : e.slot === to ? { ...e, slot: from } : e));
            if (pc && ((a ?? -1) >= pc.items.length || (b ?? -1) >= pc.items.length)) {
              // Bez pól rotacji stoi ona za stałymi. Pierwsze przeciągnięcie przedmiotu z rotacji zamienia
              // jego obecne miejsca w pola rotacji - od teraz da się je stawiać gdziekolwiek.
              const rotAt = new Set([...slotItem].filter(([, i]) => i >= pc.items.length).map(([s]) => s));
              setMenu({ layout: swap(m.layout.map((e) => (rotAt.has(e.slot) ? { ...e, role: "ROTATION_SLOT" } : e))) });
              return;
            }
            if (pc && a != null && b != null && file.settings.categorySort === "order") {
              updateCategory(pc.id, { items: swapItems(pc.items, a, b) });
              return;
            }
            setMenu({ layout: m.layout.map((e) => (e.slot === from ? { ...e, slot: to } : e.slot === to ? { ...e, slot: from } : e)) });
          }}
          onRemoveSlot={(slot) => {
            // Na polu z przedmiotem z podglądu × usuwa sam przedmiot ze sklepu (Cofnij/Ctrl+Z go przywraca).
            // Usuwanie pola przesuwało wszystkie przedmioty o jedno miejsce.
            const pc = file.cats.find((c) => c.id === previewCat);
            if (roleAt(slot) === "ROTATION_SLOT") {
              clearSlot(sc, slot);
              return;
            }
            const itemIndex = slotItem.get(slot);
            if (pc && itemIndex != null) {
              if (itemIndex >= pc.items.length) return; // przedmiot z rotacji - usuwa się go z puli, nie z podglądu
              removeItem(pc, false, itemIndex);
              return;
            }
            // Na polu z kategorią × chowa kategorię z menu (zostaje w sklepie), a pole robi się tłem.
            // Na pustym polu i na przyciskach × usuwa samo pole z układu.
            const hidden = categoryBySlot(m.layout, file.settings.categoryOrder).get(slot);
            const isCat = m.layout.some((e) => e.slot === slot && e.role === "CATEGORY_SLOT");
            if (isCat && hidden) hideFromMenu(hidden);
            else clearSlot(sc, slot);
          }}
        />
        </div>
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

  /** Jedno ustawienie w linijce: nazwa z lewej, okienko z jednostką z prawej, przykład pod spodem. */
  function fieldRow(title: string, input: ReactNode, hint?: string) {
    return (
      <label className="ci-field-row">
        <span className="ci-field-title">{title}</span>
        {input}
        {hint && <span className="muted small ci-field-hint">{hint}</span>}
      </label>
    );
  }

  function renderSettings() {
    const s = file.settings;
    const d = s.dynamic;
    const setDyn = (patch: Partial<typeof d>) => setSettings({ dynamic: { ...d, ...patch } });
    const sections: Array<[SettingsSection, string, string]> = [
      ["prices", "Ceny", s.rounding === "whole" ? "pełne złotówki" : "z groszami"],
      ["dynamic", "Ceny dynamiczne", d.enabled ? "włączone" : "wyłączone"],
      ["texts", "Teksty w grze", "wszystko, co sklep pisze graczom"],
    ];
    return (
      <div className="ci-settings-layout">
        <aside className="card ci-cats">
          <div className="ci-section-title">Ustawienia</div>
          {sections.map(([id, label, sub]) => (
            <button key={id} type="button" className={`ci-cat ci-settings-nav${settingsSection === id ? " active" : ""}`} onClick={() => setSettingsSection(id)}>
              <span className="ci-item-name">{label}</span>
              <span className="muted small">{sub}</span>
            </button>
          ))}
        </aside>
        <section className="card form ci-settings-panel">
          {settingsSection === "prices" && (
            <>
              <h2>Ceny</h2>
              <div className="ci-field-title">Zaokrąglanie ceny za sztukę</div>
              <label className="checkbox">
                <input type="radio" checked={s.rounding === "whole"} onChange={() => setSettings({ rounding: "whole" })} />
                Pełne złotówki (1 sztuka z „64 za 10” kosztuje 1)
              </label>
              <label className="checkbox">
                <input type="radio" checked={s.rounding === "cents"} onChange={() => setSettings({ rounding: "cents" })} />
                Grosze (1 sztuka z „64 za 10” kosztuje 0.16)
              </label>
            </>
          )}

          {settingsSection === "dynamic" && (
            <>
              <h2>Ceny dynamiczne skupu</h2>
              <label className="checkbox">
                <input type="checkbox" checked={d.enabled} onChange={(e) => setDyn({ enabled: e.target.checked })} />
                Włącz ceny dynamiczne skupu
                <HelpButton id="shop-dynamic-toggle" title="Jak działają ceny dynamiczne" onClick={() => setDynamicHelp(true)} />
                {d.enabled && (
                  <ConfirmButton
                    title="Wszystkie liczby, ogłoszenia i strojenie cen dynamicznych wracają do wartości domyślnych"
                    disabled={sameValues({ ...d, enabled: true }, defaultDynamic())}
                    onConfirm={() => setSettings({ dynamic: { ...defaultDynamic(), enabled: d.enabled } })}
                  >
                    <Undo2 size={14} strokeWidth={1.75} /> Przywróć domyślne
                  </ConfirmButton>
                )}
              </label>
              {d.enabled && (
                <>
                  {dynamicWarning()}
                  {fieldRow(
                    "Co ile minut przeliczać",
                    numberInput(d.cycleMinutes, (n) => setDyn({ cycleMinutes: Math.max(1, Math.floor(n)) }), "1", 1, "min"),
                    `Ceny skupu przeliczają się ${everyMinutes(d.cycleMinutes)}`
                  )}
                  {fieldRow(
                    "Skup może spaść najwyżej o",
                    numberInput(pct(d.minMultiplier), (n) => setDyn({ minMultiplier: fromPct(-Math.abs(n)) }), "5", 0, "%"),
                    pct(d.minMultiplier) >= 100
                      ? "Skup może spaść do zera!"
                      : `Przedmiot skupowany za ${money(100)} nie spadnie poniżej ${money(100 - pct(d.minMultiplier))}`
                  )}
                  <label className="checkbox ci-toggle-row">
                    <input
                      type="checkbox"
                      checked={d.maxMultiplier > 1}
                      // Wyłączone = górna granica równa zwykłej cenie (plugin: max-multiplier 1). Włączenie wraca do 50%.
                      onChange={(e) => setDyn({ maxMultiplier: e.target.checked ? defaultDynamic().maxMultiplier : 1 })}
                    />
                    Skup może rosnąć ponad zwykłą cenę
                  </label>
                  {d.maxMultiplier > 1
                    ? fieldRow(
                        "Skup może wzrosnąć najwyżej o",
                        numberInput(pct(d.maxMultiplier), (n) => setDyn({ maxMultiplier: fromPct(Math.max(1, Math.abs(n))) }), "5", 1, "%"),
                        `Przedmiot skupowany za ${money(100)} nie urośnie powyżej ${money(100 + pct(d.maxMultiplier))}`
                      )
                    : <p className="muted small ci-toggle-off">Skup tylko spada - nigdy nie da więcej niż zwykła cena z cennika.</p>}
                  <label className="checkbox ci-toggle-row">
                    <input
                      type="checkbox"
                      checked={d.resetDays > 0}
                      // Wyłączone = reset-days 0 (plugin nie resetuje cen sam). Włączenie wraca do 14 dni.
                      onChange={(e) => setDyn({ resetDays: e.target.checked ? defaultDynamic().resetDays : 0 })}
                    />
                    Automatyczny reset cen
                  </label>
                  {d.resetDays > 0 ? (
                    fieldRow(
                      "Co ile dni wszystkie ceny wracają do normy",
                      numberInput(d.resetDays, (n) => setDyn({ resetDays: Math.max(1, Math.floor(n)) }), "1", 1, "dni"),
                      `Skup wszystkiego wraca do zwykłej ceny ${everyDays(d.resetDays)}`
                    )
                  ) : (
                    <p className="ci-warning small">
                      <b>Uwaga:</b> bez resetu ceny nigdy same nie wrócą do normy. Rzeczy, które da się farmić bez końca (bruk, drewno), mogą
                      na zawsze utknąć z niskim skupem - ustaw im „Cenę stałą” albo zrób reset ręcznie komendą /@shop resetall.
                    </p>
                  )}
                  {fieldRow(
                    "Skup najwyżej taka część ceny kupna",
                    numberInput(Math.round(d.maxSellShare * 100), (n) => setDyn({ maxSellShare: Math.min(1, n / 100) }), "5", 0, "% ceny kupna"),
                    `Przedmiot kupowany za ${money(100)} sklep odkupi najwyżej za ${money(Math.round(d.maxSellShare * 100))}`
                  )}
                  <div className="ci-field-title" style={{ marginTop: "0.6rem" }}>
                    Ogłoszenia na czacie
                  </div>
                  <label className="checkbox">
                    <input type="checkbox" checked={d.announceEvents} onChange={(e) => setDyn({ announceEvents: e.target.checked })} />
                    Gdy zaczyna się albo kończy event (/@shop event)
                  </label>
                  {d.resetDays > 0 && (
                    <label className="checkbox">
                      <input type="checkbox" checked={d.announceReset} onChange={(e) => setDyn({ announceReset: e.target.checked })} />
                      Gdy wszystkie ceny wracają do normy
                    </label>
                  )}
                  <Fold title="Strojenie (zaawansowane)">
                    <div className="row" style={{ alignItems: "center", gap: "0.6rem" }}>
                      <p className="ci-error small" style={{ margin: 0, flex: 1, display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                        <CircleAlert size={18} strokeWidth={2.25} style={{ color: "var(--danger)", flexShrink: 0 }} />
                        <span>
                          <b>Uwaga:</b> domyślne wartości są przemyślane i przetestowane - zmieniaj tylko, gdy wiesz, co robisz. Jak coś
                          pójdzie nie tak, wpisz wartości domyślne podane pod każdym polem albo kliknij „Przywróć domyślne”.
                        </span>
                      </p>
                      <ConfirmButton
                        title="Tylko te 8 liczb strojenia wraca do wartości domyślnych"
                        disabled={sameValues(d.tuning, defaultTuning())}
                        onConfirm={() => setDyn({ tuning: defaultTuning() })}
                      >
                        <Undo2 size={14} strokeWidth={1.75} /> Przywróć domyślne
                      </ConfirmButton>
                    </div>
                    {TUNING_FIELDS.map(([field, label, step, hint, unit, scale]) => (
                      <div key={field}>
                        {fieldRow(
                          label,
                          numberInput(
                            Math.round(d.tuning[field] * scale * 1000) / 1000,
                            (n) => setDyn({ tuning: { ...d.tuning, [field]: Math.round((n / scale) * 1e6) / 1e6 } }),
                            step,
                            0,
                            unit
                          ),
                          hint(Math.round(d.tuning[field] * scale * 1000) / 1000)
                        )}
                      </div>
                    ))}
                  </Fold>
                </>
              )}
            </>
          )}

          {settingsSection === "texts" && (
            <ShopTextsSection
              texts={file.texts}
              setTexts={setTexts}
              language={language}
              currency={currency}
              focusKey={editingText}
              onHelp={() => setTextsHelp(true)}
            />
          )}
        </section>
        {settingsChangesPanel()}
      </div>
    );
  }

  /** Lista ustawień, które różnią się od tego, co jest teraz na serwerze - każde da się cofnąć osobno. */
  function settingsChanges(): Array<{ key: string; section: SettingsSection; label: string; from: string; to: string; revert: () => void }> {
    const a = serverFile.settings;
    const b = file.settings;
    const da = a.dynamic;
    const db = b.dynamic;
    const out: Array<{ key: string; section: SettingsSection; label: string; from: string; to: string; revert: () => void }> = [];
    const add = (key: string, section: SettingsSection, label: string, from: string, to: string, revert: () => void) => {
      if (from !== to) out.push({ key, section, label, from, to, revert });
    };
    const setD = (patch: Partial<typeof db>) => setSettings({ dynamic: { ...db, ...patch } });
    const yesNo = (v: boolean) => (v ? "tak" : "nie");
    const round = (r: string) => (r === "whole" ? "pełne złotówki" : "z groszami");
    add("rounding", "prices", "Zaokrąglanie", round(a.rounding), round(b.rounding), () => setSettings({ rounding: a.rounding }));
    add("dyn-enabled", "dynamic", "Ceny dynamiczne", da.enabled ? "włączone" : "wyłączone", db.enabled ? "włączone" : "wyłączone", () =>
      setD({ enabled: da.enabled })
    );
    add("cycle", "dynamic", "Co ile minut przeliczać", `${da.cycleMinutes} min`, `${db.cycleMinutes} min`, () => setD({ cycleMinutes: da.cycleMinutes }));
    add("min", "dynamic", "Skup może spaść o", `${pct(da.minMultiplier)} %`, `${pct(db.minMultiplier)} %`, () => setD({ minMultiplier: da.minMultiplier }));
    const growth = (m: number) => (m > 1 ? `${pct(m)} %` : "nie rośnie");
    const reset = (dd: number) => (dd > 0 ? `co ${dd} dni` : "wyłączony");
    add("max", "dynamic", "Wzrost skupu", growth(da.maxMultiplier), growth(db.maxMultiplier), () => setD({ maxMultiplier: da.maxMultiplier }));
    add("reset", "dynamic", "Automatyczny reset cen", reset(da.resetDays), reset(db.resetDays), () => setD({ resetDays: da.resetDays }));
    add("share", "dynamic", "Skup najwyżej", `${Math.round(da.maxSellShare * 100)} %`, `${Math.round(db.maxSellShare * 100)} %`, () =>
      setD({ maxSellShare: da.maxSellShare })
    );
    add("ann-events", "dynamic", "Ogłoszenie eventów", yesNo(da.announceEvents), yesNo(db.announceEvents), () => setD({ announceEvents: da.announceEvents }));
    add("ann-reset", "dynamic", "Ogłoszenie resetu cen", yesNo(da.announceReset), yesNo(db.announceReset), () => setD({ announceReset: da.announceReset }));
    for (const [field, label, , , unit, scale] of TUNING_FIELDS) {
      const show = (v: number) => `${Math.round(v * scale * 1000) / 1000} ${unit}`;
      add(`tune-${field}`, "dynamic", `Strojenie: ${label}`, show(da.tuning[field]), show(db.tuning[field]), () =>
        setD({ tuning: { ...db.tuning, [field]: da.tuning[field] } })
      );
    }
    for (const f of TEXT_FIELDS) {
      add(`text-${f.key}`, "texts", `Tekst: ${f.label}`, serverFile.texts[f.key] ?? "", file.texts[f.key] ?? "", () =>
        setTexts({ [f.key]: serverFile.texts[f.key] ?? "" })
      );
    }
    return out;
  }

  function settingsChangesPanel() {
    const changes = settingsChanges();
    const noShopOnServer = serverCatIds.length === 0;
    return (
      <aside className="card ci-changes">
        <div className="ci-section-title">Zmiany do wysłania</div>
        {noShopOnServer ? (
          <p className="muted small">Na serwerze nie ma jeszcze sklepu - wszystko pójdzie przy pierwszym wysłaniu.</p>
        ) : changes.length === 0 ? (
          <p className="muted small">Wszystko jak na serwerze - nic nie zmieniłeś.</p>
        ) : (
          <>
            {changes.map((ch) => (
              <div key={ch.key} className="ci-change">
                <button type="button" className="ci-change-text" title="Pokaż to ustawienie" onClick={() => setSettingsSection(ch.section)}>
                  <span className="ci-change-label">{ch.label}</span>
                  {ch.section === "texts" ? (
                    <span className="small">zmieniony</span>
                  ) : (
                    <span className="small">
                      <span className="muted">{ch.from}</span> → <b>{ch.to}</b>
                    </span>
                  )}
                </button>
                <button type="button" className="ci-change-undo" title="Cofnij tę zmianę (wróć do tego, co jest na serwerze)" onClick={ch.revert}>
                  <Undo2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <p className="muted small" style={{ marginBottom: 0 }}>
              Żeby zmiany zadziałały w grze: „Zapisz” na dole, potem „Wyślij na serwer” u góry.
            </p>
          </>
        )}
      </aside>
    );
  }

  /** Stawia to, co podniesione z listy obok, w klikniętym polu. */
  function placePicked(sc: string, slot: number, what: { cat?: string; role?: string } | null = picked) {
    if (!what) return;
    const picked = what;
    const m = menuOf(sc);
    if (picked.role) {
      const role = picked.role;
      const entry =
        role === "AMOUNT_SLOT"
          ? { slot, role, amount: Math.max(1, Math.floor(amountValue)) }
          : role === "FILLER"
            ? { slot, role, material: fillerMaterial || "BLACK_STAINED_GLASS_PANE" }
            : { slot, role };
      // Stara zawartość pola znika (kategoria z niego wypada z menu, inne zostają na swoich polach).
      const cleared = removeMenuSlot(m.layout, file.settings.categoryOrder, slot);
      setScreenLayout(sc, { layout: [...cleared.layout, entry] }, cleared.order);
      setPicked(null);
      return;
    }
    if (!picked.cat) return;
    // Kategoria idzie dokładnie w kliknięte pole - patrz placeCategoryAt.
    const next = placeCategoryAt(m.layout, file.settings.categoryOrder, picked.cat, slot);
    setSettings({ categoryOrder: next.order, menus: { ...file.settings.menus, [sc]: { ...m, layout: next.layout } } });
    setPicked(null);
  }

  /** Okienko po kliknięciu pola siatki: wybierasz, co ma w nim stać (kategoria, przycisk, tło) albo je czyścisz. */
  function slotPickModal() {
    if (!slotPick) return null;
    const { sc, slot } = slotPick;
    const m: MenuScreenDraft = menuOf(sc);
    const close = () => setSlotPick(null);
    const entry = m.layout.find((e) => e.slot === slot);
    const catHere = entry?.role === "CATEGORY_SLOT" ? categoryBySlot(m.layout, file.settings.categoryOrder).get(slot) : undefined;
    const place = (what: { cat?: string; role?: string }) => {
      placePicked(sc, slot, what);
      close();
    };
    const roles = (ROLES_BY_SCREEN[sc] ?? []).filter((r) => r !== "CATEGORY_SLOT");
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Co ma być w tym polu?</h2>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            {SCREEN_LABELS[sc] ?? sc}, pole {slot + 1}
            {entry ? ` - teraz: ${catHere ? plain(file.cats.find((c) => c.id === catHere)?.name ?? catHere) : (ROLE_LABELS[entry.role] ?? entry.role)}` : " - teraz puste"}
          </p>
          {sc === "category-page" &&
            (() => {
              const pc = file.cats.find((c) => c.id === previewCat);
              if (!pc) return <p className="muted small">Wybierz kategorię z listy po lewej, żeby wstawiać jej przedmioty w pola.</p>;
              const here = previewSlotItems(sc).get(slot);
              return (
                <>
                  <div className="ci-field-title">
                    Przedmiot z kategorii <MinecraftTextPreview text={pc.name} emptyLabel={pc.id} />
                  </div>
                  {file.settings.categorySort !== "order" ? (
                    <p className="ci-note small">
                      Przedmioty ustawiają się teraz same po cenie. Żeby wstawiać je w wybrane pola, ustaw „Kolejność przedmiotów: Twoja
                      kolejność” po lewej, pod listą kategorii.
                    </p>
                  ) : (
                    <div className="ci-slot-pick-grid">
                      {pc.items.map((it, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`ci-slot-pick${here === i ? " active" : ""}`}
                          onClick={() => {
                            const next = placeItemAt(m.layout, pc.items, i, slot, previewPage);
                            // Nowe pole na przedmiot zmienia układ - tylko tej kategorii albo wspólny (suwak).
                            const layoutChanged = JSON.stringify(next.layout) !== JSON.stringify(m.layout);
                            if (layoutChanged && file.settings.sharedCategoryLayout)
                              setFile({
                                ...file,
                                cats: file.cats.map((c) => (c.id === pc.id ? { ...c, items: next.items } : c)),
                                settings: { ...file.settings, menus: { ...file.settings.menus, [sc]: { ...m, layout: next.layout } } },
                              });
                            else updateCategory(pc.id, { items: next.items, ...(layoutChanged ? { layout: { ...m, layout: next.layout } } : {}) });
                            close();
                          }}
                        >
                          {iconOf(it.ref)}
                          <span>{it.name.trim() ? <MinecraftTextPreview text={it.name} /> : refLabel(it.ref, customNames)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          {(ROLES_BY_SCREEN[sc] ?? []).includes("CATEGORY_SLOT") && (
            <>
              <div className="ci-field-title">Kategoria</div>
              <div className="ci-slot-pick-grid">
                {file.cats.map((c) => {
                  const inMenu = file.settings.categoryOrder.includes(c.id);
                  return (
                    <button key={c.id} type="button" className={`ci-slot-pick${catHere === c.id ? " active" : ""}`} onClick={() => place({ cat: c.id })}>
                      {iconOf(c.icon)}
                      <span>
                        <MinecraftTextPreview text={c.name} emptyLabel={c.id} />
                        {!inMenu && <span className="muted small"> (poza menu)</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {roles.length > 0 && (
            <>
              <div className="ci-field-title" style={{ marginTop: "0.6rem" }}>
                Przycisk
              </div>
              <div className="ci-slot-pick-grid">
                {roles.map((role) => (
                  <button key={role} type="button" className={`ci-slot-pick${entry?.role === role ? " active" : ""}`} onClick={() => place({ role })}>
                    {role === "ROTATION_SLOT" ? (
                      <span className="slot-rotating-badge slot-rotating-badge-inline">
                        <Shuffle size={10} strokeWidth={2.5} />
                      </span>
                    ) : (
                      <MaterialIcon
                        material={role === "FILLER" ? fillerMaterial || "BLACK_STAINED_GLASS_PANE" : (roleMaterial(role, sc, file.settings.buttons) ?? "STONE")}
                        iconPackDir={iconPackDir}
                      />
                    )}
                    <span>
                      {ROLE_LABELS[role] ?? role}
                      {role === "AMOUNT_SLOT" && <span className="muted small"> ({Math.max(1, Math.floor(amountValue))} szt.)</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {entry && (
            <div className="row" style={{ marginTop: "0.8rem" }}>
              <button
                type="button"
                className="ci-danger"
                onClick={() => {
                  clearSlot(sc, slot);
                  close();
                }}
              >
                <Trash2 size={14} strokeWidth={1.75} /> {catHere ? "Zabierz kategorię z tego pola" : "Wyczyść pole"}
              </button>
            </div>
          )}
          <p className="muted small" style={{ marginBottom: 0 }}>
            Rzeczy w siatce możesz też przeciągać myszką, żeby je przestawić.
          </p>
        </div>
      </div>
    );
  }

  /** Ustawienia pól wybranego ekranu (ile sztuk, własne tło) - siedzą pod listą po lewej. */
  function layoutExtras(sc: string) {
    const m: MenuScreenDraft = menuOf(sc);
    const setMenu = (patch: Partial<MenuScreenDraft>) => setScreenLayout(sc, patch);
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

  /**
   * Który przedmiot (numer z listy kategorii) stoi w którym polu na podglądzie - DOKŁADNIE jak w grze:
   * kolejność wg ustawienia (Twoja / po cenie), strony, wyśrodkowanie małych kategorii.
   */
  function previewSlotItems(sc: string): Map<number, number> {
    const out = new Map<number, number>();
    const pc = file.cats.find((c) => c.id === previewCat);
    if (!pc || sc !== "category-page") return out;
    const layout = menuOf(sc).layout;
    const itemSlots = layout.filter((e) => e.role === "ITEM_SLOT").map((e) => e.slot);
    const rot = activeRotation(pc, rotationState[pc.id]);
    // Są pola rotacji: wylosowane stoją w nich po kolei (od lewej, od góry) na każdej stronie, stałe osobno.
    const rotSlots = rotationSlotsOf(layout);
    if (rotSlots.length) {
      rot.forEach((_, k) => k < rotSlots.length && out.set(rotSlots[k], pc.items.length + k));
      if (itemSlots.length === 0) return out;
      const fixed = displayOrder(pc.items, file.settings.categorySort);
      const pages = Math.max(1, Math.ceil(fixed.length / itemSlots.length));
      const start = Math.min(previewPage, pages - 1) * itemSlots.length;
      for (let i = start; i < Math.min(start + itemSlots.length, fixed.length); i++) out.set(itemSlots[i - start], fixed[i]);
      return out;
    }
    const per = itemSlots.length;
    if (per === 0) return out;
    // Jak w grze: stałe przedmioty, a za nimi to, co akurat wylosowała rotacja (numery od pc.items.length).
    const known = rot.every((x) => x != null) ? (rot as ShopItemDraft[]) : [];
    const order = [
      ...displayOrder([...pc.items, ...known], file.settings.categorySort),
      ...(known.length ? [] : rot.map((_, k) => pc.items.length + k)),
    ];
    const pages = Math.max(1, Math.ceil(order.length / per));
    const page = Math.min(previewPage, pages - 1);
    const slots = sc === "category-page" ? pageSlots(itemSlots, order.length, pages === 1 && file.settings.centerSmall) : itemSlots;
    const start = page * per;
    for (let i = start; i < Math.min(start + per, order.length); i++) out.set(slots[i - start], order[i]);
    return out;
  }

  /** Pod listą kategorii (strona kategorii): w jakiej kolejności stoją przedmioty. */
  function categoryPageOptions() {
    const s = file.settings;
    return (
      <div className="card" style={{ padding: "0.6rem", marginTop: "0.6rem" }}>
        <label style={{ margin: 0 }}>
          <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
            <span className="muted small">Kolejność przedmiotów</span>
            <HelpButton id="shop-category-sort" title="Jak stoją przedmioty w oknie" onClick={() => setSortHelp(true)} />
          </span>
          <select value={s.categorySort} onChange={(e) => setSettings({ categorySort: e.target.value as "order" | "buy" | "sell" })}>
            <option value="order">Twoja kolejność</option>
            <option value="buy">Od najtańszego kupna</option>
            <option value="sell">Od najwyższego skupu</option>
          </select>
        </label>
      </div>
    );
  }

  /**
   * Suwak "Wspólny układ". Włączenie: wszystkie kategorie dostają jeden układ - ten z wybranej kategorii
   * (jeśli ma własny), inaczej dotychczasowy startowy; własne układy znikają (Cofnij/Ctrl+Z je przywraca).
   * Wyłączenie: każda kategoria zaczyna od tego wspólnego i dalej zmienia się osobno.
   */
  function setSharedLayout(on: boolean) {
    if (!on) {
      setSettings({ sharedCategoryLayout: false });
      return;
    }
    const src = layoutCat("category-page")?.layout ?? null;
    setFile({
      ...file,
      cats: file.cats.map((c) => ({ ...c, layout: null })),
      settings: {
        ...file.settings,
        sharedCategoryLayout: true,
        menus: src ? { ...file.settings.menus, "category-page": src } : file.settings.menus,
      },
    });
  }

  /** Pasek nad siatką: co podglądamy, ile tego jest i przełączanie stron. */
  function previewBar(sc: string) {
    if (sc !== "category-page") return null;
    const pc = layoutCat(sc);
    const shared = file.settings.sharedCategoryLayout;
    const switchRow = (
      <div className="row" style={{ alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
        <label className="pm-switch" title="Włączone: jeden układ dla wszystkich kategorii. Wyłączone: każda kategoria ma swój.">
          <input type="checkbox" checked={shared} onChange={(e) => setSharedLayout(e.target.checked)} />
          <span className="pm-switch-track" />
          <span className="small">Wspólny układ dla wszystkich kategorii</span>
        </label>
        <span className="muted small">
          {shared
            ? "(włączony - zmiana w siatce zmienia wszystkie kategorie)"
            : pc
              ? "(wyłączony - zmieniasz tylko tę kategorię)"
              : "(wyłączony - kliknij kategorię po lewej, żeby ustawić jej układ)"}
        </span>
      </div>
    );
    if (!pc) return switchRow;
    const m = menuOf(sc);
    const perPage = m.layout.filter((e) => e.role === "ITEM_SLOT").length;
    const rotCount = activeRotation(pc, rotationState[pc.id]).length;
    const rotSlots = rotationSlotsOf(m.layout);
    const total = pc.items.length + rotCount;
    // Z polami rotacji strony liczy się tylko ze stałych - rotacja stoi na swoich polach na każdej stronie.
    const paged = rotSlots.length ? pc.items.length : total;
    const pages = perPage > 0 ? Math.max(1, Math.ceil(paged / perPage)) : 0;
    const page = Math.min(previewPage, Math.max(0, pages - 1));
    const r = pc.rotation;
    return (
      <>
      {switchRow}
      {r?.enabled && rotSlots.length > 0 && rotSlots.length < r.show && (
        <p className="ci-warning small" style={{ marginTop: 0 }}>
          Rotacja pokazuje {r.show} {plural(r.show, "przedmiot", "przedmioty", "przedmiotów")}, a pól rotacji jest {rotSlots.length}. Dodaj jeszcze{" "}
          {r.show - rotSlots.length} {plural(r.show - rotSlots.length, "pole", "pola", "pól")} (klik w pole → „Przedmiot z rotacji”) albo zmniejsz liczbę w
          zakładce Kategorie - inaczej część wylosowanych przedmiotów się nie pokaże.
        </p>
      )}
      {!r?.enabled && rotSlots.length > 0 && (
        <p className="ci-note small" style={{ marginTop: 0 }}>
          Ta kategoria nie ma włączonej rotacji - pola rotacji zostaną w grze puste (tło).
        </p>
      )}
      <div className="row" style={{ alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
        <MinecraftTextPreview text={pc.name} emptyLabel={pc.id} />
        <span className="muted small">
          {total} przedmiotów{perPage > 0 ? `, po ${perPage} na stronie` : " - brak pól na przedmioty"}
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
      {rotCount > 0 && (
        <div className="row" style={{ alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
          <span className="shop-rotation-legend">
            <span className="slot-rotating-badge">
              <Shuffle size={10} strokeWidth={2.5} />
            </span>
            <span>
              <b>
                {rotCount} {plural(rotCount, "przykładowy przedmiot", "przykładowe przedmioty", "przykładowych przedmiotów")} z puli rotacji.
              </b>{" "}
              W grze co jakiś czas losują się tu nowe.{" "}
              {!rotSlots.length && "Teraz stoją za stałymi przedmiotami - przeciągnij któryś, żeby postawić je, gdzie chcesz."}
            </span>
          </span>
          <HelpButton id="shop-rotation-preview" title="Po co jest rotacja" onClick={() => setRotationHelp(true)} />
        </div>
      )}
      </>
    );
  }

  /** Rozmiar okna i tryb przesuwania pól - pod listą, żeby nie rozpychać góry siatki. */
  function screenToolbar(sc: string) {
    const m: MenuScreenDraft = menuOf(sc);
    const setMenu = (patch: Partial<MenuScreenDraft>) => setScreenLayout(sc, patch);
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

  /** Wybór ilości: lista przycisków "ile sztuk" z liczbą do zmiany - po lewej od siatki. */
  function amountPanel(sc: string) {
    const m: MenuScreenDraft = menuOf(sc);
    const setMenu = (patch: Partial<MenuScreenDraft>) => setScreenLayout(sc, patch);
    const amounts = m.layout.filter((e) => e.role === "AMOUNT_SLOT").sort((a, b) => a.slot - b.slot);
    const setAmount = (slot: number, n: number) => {
      // Więcej niż 64 się nie da (pełny stack) - ustawiamy 64 i mówimy o tym przy polu.
      setAmountWarn(n > 64 ? slot : null);
      setMenu({ layout: m.layout.map((e) => (e.slot === slot && e.role === "AMOUNT_SLOT" ? { ...e, amount: Math.min(64, Math.max(1, Math.floor(n))) } : e)) });
    };
    const addButton = () => {
      // Nowy przycisk w pierwszym wolnym polu rzędu, w którym są już przyciski (albo środkowego rzędu).
      const used = new Set(m.layout.map((e) => e.slot));
      const row = amounts.length ? Math.floor(amounts[0].slot / 9) : Math.floor(m.size / 9 / 2);
      const inRow = Array.from({ length: 9 }, (_, i) => row * 9 + i).filter((x) => x < m.size && !used.has(x));
      const anywhere = Array.from({ length: m.size }, (_, i) => i).filter((x) => !used.has(x));
      const slot = inRow[0] ?? anywhere[0];
      if (slot == null) return;
      setMenu({ layout: [...m.layout, { slot, role: "AMOUNT_SLOT", amount: 1 }] });
    };
    return (
      <div className="card" style={{ padding: "0.6rem", marginTop: "0.6rem" }}>
        <div className="ci-field-title">Przyciski ilości</div>
        <p className="muted small" style={{ margin: "0.2rem 0 0.4rem" }}>
          Ile sztuk kupuje gracz po kliknięciu przycisku. Najwięcej 64 szt. na przycisk.
        </p>
        {amounts.map((e, i) => (
          <div key={e.slot}>
          <div className="row" style={{ alignItems: "center", gap: "0.4rem", margin: "0.25rem 0", flexWrap: "nowrap" }}>
            <span className="muted small" style={{ minWidth: "4.5rem" }}>
              Przycisk {i + 1}
            </span>
            {numberInput(e.amount ?? 1, (n) => setAmount(e.slot, n), "1", 1, "szt.")}
            <button type="button" className="ci-trash" title="Usuń ten przycisk" onClick={() => clearSlot(sc, e.slot)}>
              <Trash2 size={15} />
            </button>
          </div>
          {amountWarn === e.slot && <p className="ci-error small" style={{ margin: "0 0 0.3rem" }}>Najwięcej można 64 szt. (pełny stack) - ustawiono 64.</p>}
          </div>
        ))}
        {amounts.length === 0 && <p className="muted small">Brak przycisków - gracz nie będzie mógł nic kupić.</p>}
        <button type="button" onClick={addButton} style={{ marginTop: "0.3rem" }}>
          + Dodaj przycisk
        </button>
      </div>
    );
  }

  /** Lista kategorii obok siatki: klikasz kategorię, potem pole - i tam stanie. */
  function pickerPanel(sc: string) {
    // W menu glownym lista sluzy do stawiania kategorii, na stronie kategorii - do podgladu
    // jej przedmiotow w polach. Reszta (przyciski, tlo, ilosc) stawia sie z sekcji na dole.
    // Wyniki wyszukiwania pokazują przedmioty z całego sklepu (to, co gracz wpisze) - lista kategorii tam nic nie daje.
    const preview = sc === "category-page";
    if (sc !== "main-menu" && !preview) return null;
    const order = file.settings.categoryOrder;
    return (
      // position: static - lista ma stac w miejscu przy przewijaniu (ci-cats domyslnie sie przykleja).
      <aside className="card ci-cats" style={{ minWidth: 0, padding: "0.6rem", position: "static" }}>
        <p className="muted small">
          {preview
            ? "Kliknij kategorię, żeby zobaczyć jej przedmioty w polach. Potem kliknij pole i wybierz przedmiot albo przeciągnij go myszką."
            : "Kliknij pole w siatce i wybierz, co ma tam stać. Możesz też przeciągać myszką, a krzyżykiem usuwać."}
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
                    ? previewCat !== c.id && (setPreviewCat(c.id), setPreviewPage(0))
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
              {screen === "category-page" && categoryPageOptions()}
              {screen === "buy-picker" && amountPanel(screen)}
              {screen === "search-results" && (
                <div className="card" style={{ padding: "0.6rem", marginTop: "0.6rem" }}>
                  <div className="ci-field-title">Wyniki wyszukiwania</div>
                  <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                    Pola „Przedmiot” to miejsca na przedmioty pasujące do tego, co gracz wpisze w „Szukaj”. Kliknij pole, żeby dodać albo
                    usunąć miejsce.
                  </p>
                </div>
              )}
              {screenToolbar(screen)}
              {layoutExtras(screen)}
            </div>
            {/* Siatka odrobine nizej niz lista obok - inaczej lepi sie do gornej krawedzi karty. */}
            <div style={{ flex: 1, minWidth: 0, marginTop: "0.2rem" }}>
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
          {/* Przyciski ilości edytuje się w ramce "Przyciski ilości" po lewej od siatki (ekran Wybór ilości). */}
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
    file.cats.forEach((c) => [...c.items, ...(c.rotation?.pool ?? [])].forEach((it) => names.set(itemKey(it.ref), it.name.trim() ? plain(it.name) : refLabel(it.ref, customNames))));
    const q = statsFilter.toLowerCase();
    const rows = stats
      .filter((s) => !q || s.key.toLowerCase().includes(q) || (names.get(s.key) ?? "").toLowerCase().includes(q))
      .sort((a, b) => b.sztukLacznie - a.sztukLacznie);
    return (
      <section className="card">
        <h2>Statystyki sprzedaży</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={file.settings.statsEnabled}
            onChange={(e) => setSettings({ statsEnabled: e.target.checked })}
          />
          Zbieraj statystyki sprzedaży
          <HelpButton id="shop-stats" title="Co dają statystyki" onClick={() => setStatsHelp(true)} />
        </label>
        <p className="muted small">
          Dane prosto z serwera - tylko podgląd.{" "}
          {file.settings.statsEnabled ? "" : "Zbieranie jest wyłączone, więc nowe dane się nie pojawiają (zaznacz wyżej, zapisz i wyślij na serwer)."}
        </p>
        <div className="row">
          <input placeholder="Szukaj po nazwie lub kluczu..." value={statsFilter} onChange={(e) => setStatsFilter(e.target.value)} />
          <button type="button" onClick={() => refreshStats()} disabled={!profileId}>
            Odśwież
          </button>
          <button type="button" onClick={downloadReport} disabled={!profileId} title="Zapisz raport sprzedaży do Excela na tym komputerze">
            <Download size={14} strokeWidth={1.75} /> Pobierz raport do Excela
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
      <div className="ci-page-intro">
        <p className="muted">Kategorie i przedmioty sklepu serwerowego: ceny kupna i skupu, rotacja, ceny dynamiczne i wygląd menu.</p>
        <select value="" onChange={(e) => loadTemplate(e.target.value)} disabled={!profileId} title="Gotowe sklepy - podmieniają cały sklep w edytorze">
          <option value="">Wczytaj szablon...</option>
          {shopTemplateChoices(language).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row ci-toolbar">
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
        <HelpButton id="shop-how-it-works" title="Przewodnik: jak działa sklep, krok po kroku" label="Jak działa sklep" onClick={() => setShopHelp(true)} />
        <span style={{ flex: 1 }} />
        {unsaved && <span className="muted small">masz niezapisane zmiany</span>}
        {notSent && !unsaved && <span className="muted small">zapisane, jeszcze niewysłane</span>}
        <button type="button" title="Cofnij ostatnią zmianę (Ctrl+Z)" onClick={undoFile} disabled={historyRef.current.past.length === 0}>
          <Undo2 size={14} strokeWidth={1.75} /> Cofnij
        </button>
        <button type="button" title="Ponów cofniętą zmianę (Ctrl+Y)" onClick={redoFile} disabled={historyRef.current.future.length === 0}>
          <Redo2 size={14} strokeWidth={1.75} /> Ponów
        </button>
        <button
          type="button"
          title="Wczytuje sklep od nowa prosto z serwera - np. gdy ktoś zmienił coś w grze komendą"
          onClick={() => setReloadConfirm(true)}
          disabled={!profileId || busy}
        >
          ↶ Wczytaj z serwera
        </button>
        <button type="button" title="Zapisuje wszystkie zmiany w aplikacji - na serwer trafią po „Wyślij na serwer” (Ctrl+S)" onClick={save} disabled={!unsaved}>
          <Save size={14} strokeWidth={1.75} /> Zapisz
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || (!unsaved && !notSent) || busy}>
          <Upload size={14} strokeWidth={1.75} /> Wyślij na serwer
        </button>
      </div>
      {status && <StatusBar text={status} onClose={() => setStatus(null)} />}
      {discarded && (
        <div className="ci-restore-bar">
          <span>Wczytano sklep z serwera - Twoje niewysłane zmiany zostały odłożone na bok.</span>
          <button
            type="button"
            className="ci-publish"
            onClick={() => {
              setFile(discarded.file);
              setSaved(discarded.saved);
              setDiscarded(null);
            }}
          >
            <Undo2 size={14} strokeWidth={1.75} /> Przywróć moje zmiany
          </button>
          <button type="button" onClick={() => setDiscarded(null)}>
            Nie, wyrzuć je
          </button>
        </div>
      )}
      {reloadConfirm && (
        <div className="modal-overlay" onClick={() => setReloadConfirm(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Wczytać sklep z serwera?</h2>
            {unsaved || notSent ? (
              <p>
                Masz zmiany, których <b>nie ma na serwerze</b>. Po wczytaniu aplikacja pokaże to, co jest teraz na serwerze - a Twoje zmiany
                odłoży na bok. Do czasu następnego wczytania możesz je przywrócić jednym kliknięciem.
              </p>
            ) : (
              <p>
                Aplikacja wczyta sklep od nowa prosto z serwera - np. gdy ktoś zmienił coś w grze komendą. Nic nie stracisz: wszystkie Twoje
                zmiany są już na serwerze.
              </p>
            )}
            <div className="row">
              <button
                type="button"
                className={unsaved || notSent ? "ci-danger" : "ci-publish"}
                onClick={() => {
                  setReloadConfirm(false);
                  if (unsaved || notSent) setDiscarded({ file, saved });
                  load(profileId, pluginsPath);
                }}
              >
                Tak, wczytaj z serwera
              </button>
              <button type="button" onClick={() => setReloadConfirm(false)}>
                {unsaved || notSent ? "Anuluj - zostaw moje zmiany" : "Anuluj"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCommands && <ShopCommandsModal file={file} onClose={() => setShowCommands(false)} />}
      <ItemDatalists materials={allMaterials} customIds={customIds} />
      {rotationHelp && <RotationHelpModal onClose={() => setRotationHelp(false)} />}
      {priceHelp && <PriceHelpModal onClose={() => setPriceHelp(false)} />}
      {shopHelp && (
        <ShopGuideModal
          openDynamic={shopHelpDynamic}
          openTexts={shopHelpTexts}
          onClose={() => {
            setShopHelp(false);
            setShopHelpDynamic(false);
            setShopHelpTexts(false);
          }}
        />
      )}
      {fixedHelp && (
        <FixedPriceHelpModal
          onClose={() => setFixedHelp(false)}
          onMore={() => {
            setFixedHelp(false);
            openGuide("dynamic");
          }}
        />
      )}
      {dynamicHelp && (
        <DynamicHelpModal
          onClose={() => setDynamicHelp(false)}
          onMore={() => {
            setDynamicHelp(false);
            openGuide("dynamic");
          }}
        />
      )}
      {slotPickModal()}
      {screenHelp && (
        <div className="modal-overlay" onClick={() => setScreenHelp(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 style={{ margin: 0, flex: 1 }}>{SCREEN_LABELS[screen]}</h2>
              <button type="button" onClick={() => setScreenHelp(false)}>
                Zamknij
              </button>
            </div>
            {SCREEN_HELP[screen]}
            <p className="muted small">
              Klik w pole siatki pozwala wybrać, co ma w nim stać. Rzeczy przeciągasz myszką, a krzyżykiem usuwasz. Wolne pola to w grze tło.
            </p>
          </div>
        </div>
      )}
      {sortHelp && (
        <div className="modal-overlay" onClick={() => setSortHelp(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 style={{ margin: 0, flex: 1 }}>Jak stoją przedmioty w oknie</h2>
              <button type="button" onClick={() => setSortHelp(false)}>
                Zamknij
              </button>
            </div>
            <p>
              Sklep wkłada przedmioty po kolei w <b>pola na przedmioty</b> - od lewej do prawej, z góry na dół. Które pola to są, decydujesz
              Ty: kliknij pole i wybierz przedmiot albo „Przedmiot”. Pola bez przedmiotu to tło.
            </p>
            <p>
              <b>Twoja kolejność</b> - przedmioty stoją dokładnie tak, jak je ustawisz. <b>Od najtańszego kupna / od najwyższego skupu</b> -
              sklep sam układa je po cenie.
            </p>
            <p className="muted small">
              Gracz i tak może przełączyć sortowanie lejkiem w grze. Drugie kliknięcie tego samego wraca do kolejności ustawionej tutaj.
            </p>
          </div>
        </div>
      )}
      {statsHelp && <StatsHelpModal onClose={() => setStatsHelp(false)} />}
      {collectionInfo && <CollectionInfoModal r={file.cats.find((c) => c.id === "kolekcja")?.rotation} onClose={() => setCollectionInfo(false)} />}
      {textsHelp && (
        <TextsHelpModal
          onClose={() => setTextsHelp(false)}
          onMore={() => {
            setTextsHelp(false);
            openGuide("texts");
          }}
        />
      )}
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
                <div key={c.id}>{confirmRow(`Usunąć kategorię ${plain(c.name) || c.id}?`, () => removeCategory(c.id))}</div>
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
                    {(() => {
                      const hidden = [...c.items, ...(c.rotation?.pool ?? [])].filter((it) => customProblem(it.ref)).length;
                      return hidden > 0 ? (
                        <span
                          className="ci-cat-error"
                          title={`${hidden} ${plural(hidden, "przedmiot nie pokaże", "przedmioty nie pokażą", "przedmiotów nie pokaże")} się w sklepie - kliknij kategorię, żeby zobaczyć które`}
                        >
                          <TriangleAlert size={13} strokeWidth={2} /> {hidden}
                        </span>
                      ) : null;
                    })()}
                    <span
                      className="ci-prize-count"
                      title={c.rotation ? `${c.items.length} stałych + ${c.rotation.pool.length} w puli rotacji` : `${c.items.length} przedmiotów`}
                    >
                      <Store size={12} strokeWidth={2} /> {c.items.length + (c.rotation?.pool.length ?? 0)}
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
                  {trashButton(`cat:${c.id}`, `Usuń kategorię ${plain(c.name) || c.id}`)}
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
                <ListToggle open={rotationTabs} onToggle={toggleRotationTabs} label="Rotacja" />
                {rotationTabs && (
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
                    Pula rotacji {category.rotation?.enabled ? `(${category.rotation.pool.length})` : "(wyłączona)"}
                  </button>
                </div>
                )}
                {(!showPool || !rotationTabs) && (
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
                {showPool && rotationTabs && !category.rotation?.enabled && (
                  <div className="ci-rotation-off">
                    <p className="muted small">Rotacja w tej kategorii jest wyłączona.</p>
                    <button
                      type="button"
                      className="ci-publish"
                      onClick={() => {
                        const r = category.rotation;
                        updateCategory(category.id, {
                          rotation: r ? { ...r, enabled: true } : { enabled: true, show: 5, everyDays: 14, announce: true, pool: [], raw: {} },
                        });
                        setSel({ kind: "cat" });
                        setRotationFoldOpen(true);
                      }}
                    >
                      <Shuffle size={14} strokeWidth={1.75} /> Włącz rotację
                    </button>
                  </div>
                )}
                {category.rotation?.enabled && showPool && rotationTabs && (
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
              <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
                Cofnij niezapisane
              </button>
            </div>
          </section>
        </div>
      )}
      {tab !== "cats" && (
        <div className="ci-actions">
          <button type="button" onClick={() => setFile(saved)} disabled={!unsaved}>
            Cofnij niezapisane
          </button>
        </div>
      )}
    </div>
  );
}
