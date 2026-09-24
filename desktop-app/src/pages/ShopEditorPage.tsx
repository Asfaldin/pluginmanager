import { desktopDir, join } from "@tauri-apps/api/path";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, Redo2, Save, Shuffle, Store, Terminal, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ConfirmButton, CopyRow, Fold, HelpButton, ListToggle, LoreEditor, StatusBar } from "../components/EditorBits";
import ItemRefPicker, { ItemDatalists, MATERIALS_LIST_ID } from "../components/ItemRefPicker";
import MaterialIcon from "../components/MaterialIcon";
import MinecraftTextInput, { type MinecraftTextHandle } from "../components/MinecraftTextInput";
import MinecraftTextPreview from "../components/MinecraftTextPreview";
import { showPrompt } from "../components/PromptModal";
import SamplePreview from "../components/SamplePreview";
import SlotGrid, { type SlotContent } from "../components/SlotGrid";
import { rconSendCommand, sftpDeleteFile, sftpDownloadFile, sftpListDir, sftpReadFile, sftpWriteFile } from "../lib/api";
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
  defaultDynamic,
  defaultSettings,
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
  displayOrder,
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
import {
  ANNOUNCE_FIELDS,
  defaultAnnounceTexts,
  fillPlaceholders,
  parseAnnounceTexts,
  patchLangFile,
  PLACEHOLDER_HELP,
  PLACEHOLDER_LABELS,
  SAMPLE_VALUES,
  sameTexts,
  type AnnounceGroup,
  type AnnounceTexts,
} from "../lib/shopAnnounce";
import { everyDays, everyMinutes, num, plural } from "../lib/plText";
import { parseSpawnerConfig } from "../lib/spawnersYaml";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

interface ShopFile {
  settings: ShopSettingsDraft;
  cats: CategoryDraft[];
  /** Teksty ogłoszeń na czacie - z lang/<język>.yml pluginu, nie z shop.yml. */
  texts: AnnounceTexts;
}

type Sel = { kind: "cat" } | { kind: "item"; pool: boolean; index: number };
type Tab = "cats" | "settings" | "stats" | "menu";
type SettingsSection = "prices" | "dynamic" | "texts";

const EMPTY: ShopFile = { settings: defaultSettings(), cats: [], texts: defaultAnnounceTexts("en") };

const ANNOUNCE_GROUPS: Array<[AnnounceGroup, string]> = [
  ["rotation", "Rotacja - nowa oferta w kategorii"],
  ["reset", "Reset cen"],
  ["event", "Eventy na skup"],
];
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

/**
 * Ikonka przycisku w podglądzie - taka, jaką ma w grze: z "Ikonek przycisków" (menus.buttons).
 * Powrót w wyborze ilości to osobny przycisk ("picker-back"), na innych ekranach - "back" (kompas).
 */
function roleMaterial(role: string, sc: string, buttons: Record<string, string>): string | undefined {
  const id =
    role === "NAV_BACK"
      ? sc === "buy-picker"
        ? "picker-back"
        : "back"
      : Object.entries(BUTTON_ROLES).find(([k, r]) => r === role && k !== "back" && k !== "picker-back")?.[0];
  return (id && buttons[id]) || conventionalRoleIcon(role);
}

/** Co to za okno w grze i po co się je ustawia - okienko "?" przy zakładkach ekranów w "Wygląd menu". */
const SCREEN_HELP: Record<string, ReactNode> = {
  "main-menu": (
    <p>
      Pierwsze okno po wpisaniu <b>/sklep</b>. Stoją w nim <b>kategorie</b> (klik otwiera kategorię) i przyciski: „Szukaj” (gracz wpisuje
      nazwę przedmiotu na czacie) oraz „Zamknij”. Tu decydujesz, gdzie która kategoria stoi.
    </p>
  ),
  "category-page": (
    <p>
      Okno po kliknięciu kategorii - lista jej <b>przedmiotów</b> do kupienia i sprzedania. Ustawiasz, w których polach stoją przedmioty,
      w jakiej kolejności, oraz przyciski: strony (gdy przedmiotów jest dużo), sortowanie (lejek), powrót do menu i zamknięcie. Z lewej
      wybierz kategorię, żeby zobaczyć jej prawdziwe przedmioty.
    </p>
  ),
  "buy-picker": (
    <p>
      Małe okno po kliknięciu przedmiotu do kupienia: gracz wybiera, <b>ile sztuk</b> kupuje (np. 1, 8, 16, 32, 64). Liczby na przyciskach
      zmieniasz z lewej, w „Przyciski ilości”. Jest tu też powrót do kategorii.
    </p>
  ),
  "search-results": (
    <p>
      Okno, które widzi gracz po użyciu <b>„Szukaj”</b> w menu głównym: wpisuje nazwę (np. „bruk”) na czacie, a sklep pokazuje wszystkie
      pasujące przedmioty <b>ze wszystkich kategorii</b>. Tu ustawiasz, w których polach pojawiają się wyniki, i gdzie stoi przycisk powrotu
      do sklepu (kompas).
    </p>
  ),
};

const ROLES_BY_SCREEN: Record<string, string[]> = {
  "main-menu": ["CATEGORY_SLOT", "SEARCH", "EXIT", "FILLER"],
  "category-page": ["ITEM_SLOT", "SORT", "NAV_PREV", "NAV_NEXT", "NAV_BACK", "EXIT", "FILLER"],
  "buy-picker": ["AMOUNT_SLOT", "NAV_BACK", "FILLER"],
  "search-results": ["ITEM_SLOT", "NAV_BACK", "FILLER"],
};

/** Pola strojenia cen dynamicznych: nazwa w kodzie, podpis, krok, podpowiedź, jednostka i mnożnik
    (100 = w pliku ułamek 0.05, a w aplikacji pokazujemy 5 %). */
const TUNING_FIELDS: Array<[keyof TuningDraft, string, string, (v: number) => string, string, number]> = [
  ["maxDropPerCycle", "Największy spadek skupu na cykl", "1", (v) => `W jednym cyklu skup spada najwyżej o ${num(v)}% (domyślnie 5)`, "%", 100],
  ["dropAtTop", "Ile razy mocniejszy spadek na maksimum", "0.1", (v) => `Na samej górze skup spada ${num(v)} razy szybciej (domyślnie 4,2)`, "razy", 1],
  ["recoverFromBelow", "Ile drogi wraca w cyklu ciszy", "5", (v) => `Zbita cena odrabia ${num(v)}% straty w każdym cyklu ciszy (domyślnie 80)`, "%", 100],
  ["risePerCycle", "Wzrost na cykl, gdy nikt nie sprzedaje", "0.5", (v) => `Gdy nikt nie sprzedaje, skup rośnie o ${num(v)}% na cykl (domyślnie 12,5)`, "%", 100],
  ["quietThreshold", "Poniżej jakiej części normy to cisza", "5", (v) => `Sprzedaż poniżej ${num(v)}% zwykłej liczy się jako „cisza” (domyślnie 10)`, "% normy", 100],
  ["cyclesToRise", "Ile cykli ciszy przed wzrostem", "1", (v) => `Cena zaczyna rosnąć po ${num(v)} ${v === 1 ? "cyklu" : "cyklach"} ciszy (domyślnie 2)`, "cykle", 1],
  ["cyclesFrozen", "Ile cykli cena stoi po zejściu z góry", "1", (v) => `Po zejściu z maksimum cena stoi ${num(v)} ${plural(v, "cykl", "cykle", "cykli")} (domyślnie 2)`, "cykle", 1],
  ["normLearnRate", "Jak szybko sklep zapomina stare cykle", "0.5", () => "Mniej = sklep dłużej pamięta stare cykle, więcej = szybciej zapomina (domyślnie 2)", "%", 100],
];

function shopDir(pluginsPath: string): string {
  return `${pluginsPath.replace(/\/+$/, "")}/MainpluginsShop`;
}

function serializeAll(f: ShopFile): string {
  return serializeShopSettings(f.settings) + f.cats.map((c) => `\n#### ${c.id}\n${serializeCategory(c)}`).join("") + `\n#### texts\n${JSON.stringify(f.texts)}`;
}

/** Kategorie w kolejności z shop.yml, reszta na końcu. */
function ordered(settings: ShopSettingsDraft, cats: CategoryDraft[]): CategoryDraft[] {
  const inOrder = settings.categoryOrder.map((id) => cats.find((c) => c.id === id)).filter((c): c is CategoryDraft => !!c);
  return [...inOrder, ...cats.filter((c) => !settings.categoryOrder.includes(c.id))];
}

function fromTemplate(t: ShopTemplate, texts: AnnounceTexts): ShopFile {
  const settings = parseShopSettings(t["shop.yml"]);
  return { settings, cats: ordered(settings, Object.entries(t.categories).map(([id, text]) => parseCategory(id, text))), texts };
}

/** Czy dwa obiekty mają te same wartości, niezależnie od kolejności pól (do wyszarzania "Przywróć domyślne"). */
function sameValues(a: unknown, b: unknown): boolean {
  const sorted = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]))
      : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function plain(text: string): string {
  return text.replace(/&[0-9a-fk-or]/gi, "");
}

/** Nazwa przedmiotu bez własnej nazwy w sklepie. `customNames` = ludzkie nazwy custom itemów (np. "Spawner: Krowa"). */
function refLabel(r: ItemRef, customNames: Record<string, string> = {}): string {
  if (r.custom != null) return customNames[r.custom] ?? `custom: ${r.custom}`;
  return (r.item ?? "STONE").toLowerCase().replace(/_/g, " ");
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
          <CopyRow cmd="/@shop price <przedmiot> buy <kwota>" what="zmienia cenę kupna za całą paczkę (np. 640 za 64 szt.) - pokaże też cenę za sztukę i zapyta o potwierdzenie" />
          <CopyRow cmd="/@shop price <przedmiot> sell <kwota>" what="zmienia cenę skupu za całą paczkę" />
          <CopyRow cmd="/@shop multiplier <przedmiot> +20" what="ręcznie zmienia skup o tyle procent (ceny dynamiczne dalej działają)" />
          <CopyRow cmd="/@shop event <przedmiot> +50 2h" what="event: skup +50% przez 2 godziny (bez czasu - aż do „off”)" />
          <CopyRow cmd="/@shop event <przedmiot> off" what="kończy event na przedmiocie" />
          <CopyRow cmd="/@shop event list" what="lista trwających eventów" />
          <CopyRow cmd="/@shop event offall" what="kończy wszystkie eventy naraz" />
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
  const textInputRef = useRef<MinecraftTextHandle>(null);
  const [textHistory, setTextHistory] = useState({ canUndo: false, canRedo: false });
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
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
    try {
      lang = readSetting(await sftpReadFile(pid, `${base}/MainpluginsCore/config.yml`), "language") ?? "en";
    } catch {
      // brak configu core - zostaje angielski
    }
    setLanguage(lang);
    let langText: string | null = null;
    try {
      langText = await sftpReadFile(pid, `${dir}/lang/${lang}.yml`);
    } catch {
      // pliku jeszcze nie ma - plugin bierze teksty z jara, czyli domyślne
    }
    const texts = parseAnnounceTexts(langText, lang);
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
    let toSend = saved;
    if (unsaved) {
      if (!(await ask("Masz niezapisane zmiany. Zapisać je i wysłać razem?", { title: "Niezapisane zmiany", kind: "warning" }))) return;
      toSend = file;
      setSaved(file);
    }
    const warnings = shopProblems(toSend.settings, toSend.cats);
    if (warnings.length && !(await ask(`Uwaga:\n- ${warnings.join("\n- ")}\n\nWysłać mimo to?`, { title: "Uwaga", kind: "warning" }))) return;
    const removed = serverCatIds.filter((id) => !toSend.cats.some((c) => c.id === id));
    if (
      removed.length &&
      !(await ask(`Z serwera zostaną usunięte kategorie: ${removed.join(", ")}. Kontynuować?`, { title: "Usunięcie kategorii", kind: "warning" }))
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
        // Czytamy plik świeżo z serwera i zmieniamy w nim tylko linijki ogłoszeń.
        const langPath = `${dir}/lang/${language}.yml`;
        let current = "";
        try {
          current = await sftpReadFile(profileId, langPath);
        } catch {
          // brak pliku - powstanie z samymi ogłoszeniami, resztę plugin weźmie z jara
        }
        await sftpWriteFile(profileId, langPath, patchLangFile(current, toSend.texts));
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

  function setTexts(patch: AnnounceTexts) {
    setFile({ ...file, texts: { ...file.texts, ...patch } });
  }

  function openTexts() {
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
    const m = file.settings.menus[sc];
    const next = removeMenuSlot(m.layout, file.settings.categoryOrder, slot);
    setSettings({ categoryOrder: next.order, menus: { ...file.settings.menus, [sc]: { ...m, layout: next.layout } } });
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
        <p className="muted small">Klucz w komendach: {itemKey(it.ref)}</p>
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
                  {numberInput(perPiece(it.buy, it.amount), (n) => set({ buy: fromPerPiece(n, it.amount) }), "0.01", 0, "$")}
                </label>
              </>
            ) : (
              <label>
                <span className="ci-field-title">Cena kupna za sztukę</span>
                {numberInput(it.buy, (n) => set({ buy: n }), "0.01", 0, "$")}
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
                  {numberInput(it.sell, (n) => set({ sell: n }), "0.01", 0, "$")}
                  <span className="muted small">Czyli {money(perPiece(it.sell, it.sellAmount))} za sztukę</span>
                </label>
              </>
            ) : (
              <label>
                <span className="ci-field-title">Cena skupu za sztukę</span>
                {numberInput(it.sell, (n) => set({ sell: n }), "0.01", 0, "$")}
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
  function shopHelpModal() {
    const close = () => {
      setShopHelp(false);
      setShopHelpDynamic(false);
      setShopHelpTexts(false);
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
            <b>Kategorie i przedmioty.</b> Każda kategoria ma własną listę przedmiotów. Gdzie stoi która kategoria i który przedmiot, ustawiasz w
            zakładce <b>Wygląd menu</b> - klikasz pole i wybierasz, co ma w nim być.
          </p>
          <p>
            <b>Ceny.</b> Kupno zawsze idzie po sztuce, skup możesz ustawić hurtem (całymi porcjami). W Ustawieniach wybierasz, czy sklep
            liczy w pełnych złotówkach, czy z groszami.
          </p>
          <Fold title="Ceny - szczegóły">
            <p className="small">
              Cenę kupna wpisujesz za jedną sztukę, a sklep przelicza ją na tyle sztuk, ile gracz wybierze. Gdy wychodzi niepełna kwota,
              zaokrągla w górę - nigdy na swoją niekorzyść.
            </p>
            <p className="small">
              „Pełne złotówki” znaczy, że najniższa możliwa cena to 1 zł, więc tanie rzeczy lepiej sprzedawać większymi porcjami. Przy
              „groszach” minimum to 0,01.
            </p>
            <p className="small">
              Skup ma jeszcze jeden bezpiecznik: w <b>Ustawieniach</b> jest sufit „skup najwyżej taka część ceny kupna” (domyślnie 90%). Nawet
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
              częściej, żeby rynek często startował od zera, albo rzadziej, żeby ceny dłużej pamiętały, co się działo. Możesz też całkiem
              wyłączyć „Automatyczny reset cen” - wtedy ceny wracają tylko po komendzie <code>/@shop resetall</code>.
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
              Czas liczy się kalendarzowo, nie od obecności graczy: data następnego losowania jest zapisana na serwerze i jest sprawdzana
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
              <b>Klik w pole</b> otwiera okienko, w którym wybierasz, co ma tam stać: kategorię (menu główne), przedmiot (strona kategorii),
              przycisk albo tło. Rzeczy możesz też przeciągać myszką. Przedmioty stoją w kolejności z ustawienia „Kolejność przedmiotów”
              (Twoja albo po cenie). Strzałki stron gracz widzi tylko wtedy, gdy jest dokąd iść.
            </p>
            <p className="small">
              Ikonki przycisków (szukanie, zamknij, sortowanie) wybierasz w sekcji „Przyciski” pod siatką. Napisy na przyciskach są na razie
              stałe - takie same w każdym sklepie.
            </p>
          </Fold>
          <p>
            <b>Statystyki.</b> Po włączeniu sklep zapisuje, co i za ile gracze sprzedają. Wszystko jest w zakładce Statystyki, razem z
            raportem do pobrania.
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
              Przyciskiem „Pobierz raport do Excela” w zakładce Statystyki zapiszesz raport na swoim komputerze - z kolumną sugestii
              („obniż cenę bazową”, „podnieś”, „ok”). Sklep liczy też wyniki dzień po dniu. Statystyki przeżywają globalny reset cen - to osobna, długa historia. Zbieranie
              można wyłączyć: stare dane zostają, nowe nie dochodzą.
            </p>
          </Fold>
          <p>
            <b>Teksty ogłoszeń.</b> To, co sklep sam pisze na czacie (nowa oferta, reset cen, eventy), zmieniasz w Ustawieniach → Teksty
            ogłoszeń.
          </p>
          <Fold title="Teksty ogłoszeń - szczegóły" open={shopHelpTexts}>
            <div className="ci-section-title">Co jest prawdziwe, a co przykładem</div>
            <p className="small">
              Tekst w czarnym okienku jest prawdziwy - dokładnie tak, tymi kolorami, pojawi się na czacie. Przykładem są tylko rzeczy{" "}
              <span className="ci-sample">podkreślone kropkami</span> (Kolekcja, Płyta: Cat, 20000, 14 dni, 50%, 2h). Najedź na nie myszką -
              dymek powie, co wstawi się tam w grze.
            </p>
            <div className="ci-section-title">Edycja</div>
            <p className="small">
              Klik w linijkę otwiera pole pod okienkiem, zmiany widać od razu. Enter albo „Gotowe” zamyka pole, „Cofnij” i „Ponów” (też
              Ctrl+Z / Ctrl+Y) cofają krok po kroku, „Przywróć domyślny” wraca do tekstu z pluginu - też da się to cofnąć. Kolor: zaznacz
              kawałek tekstu i kliknij kolorowy kwadracik; bez zaznaczenia kolor działa na to, co zaraz napiszesz. Ctrl+B pogrubia.
              Przycisk „&” z prawej pokazuje surowe kody kolorów - tylko dla zaawansowanych.
            </p>
            <div className="ci-section-title">Ramki „+ nazwa kategorii”, „+ cena” itd.</div>
            <p className="small">
              Ramka to miejsce, w które sklep w chwili ogłoszenia sam wpisze właściwą rzecz. Tekst jest jeden dla wszystkich kategorii,
              więc nie wpisuj nazwy na sztywno - „NOWA OFERTA: Kolekcja” pokazałoby się też w Blokach. Ramka pojawia się tam, gdzie stoi
              kursor; Backspace usuwa ją w całości. Przydaje się, gdy skasujesz ramkę przez przypadek, chcesz ją przestawić („Kolekcja ma
              nową ofertę!”) albo dodać gdzie indziej, np. w stopce.
            </p>
            <ul className="small">
              {Object.entries(PLACEHOLDER_LABELS).map(([k, v]) => (
                <li key={k}>
                  <b>{v}</b> - {PLACEHOLDER_HELP[k]}
                </li>
              ))}
            </ul>
            <div className="ci-section-title">Kolory nazw</div>
            <p className="small">
              Nazwa kategorii i przedmiotu wchodzi w swoim własnym kolorze - takim, jaki ma w sklepie. Kolekcja ma żółtą nazwę, więc w
              ogłoszeniu też będzie żółta. Tekst za ramką aplikacja koloruje od nowa, więc kolor nazwy nie „rozlewa się” dalej.
            </p>
            <div className="ci-section-title">Włączanie i wyłączanie</div>
            <p className="small">
              Ogłoszenie nowej oferty włączasz przy rotacji w każdej kategorii osobno, a ogłoszenia eventów i resetu cen - w Ustawieniach →
              Ceny dynamiczne. „Przywróć domyślne” obok „?” wraca do wszystkich tekstów z pluginu naraz (po drugim kliknięciu).
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
            zmienić na dowolne (np. 2, 10, 20), dodać kolejne albo usunąć: zakładka <b>Wygląd menu</b>, ekran <b>Wybór ilości</b>, ramka
            <b>Przyciski ilości</b> po lewej. Najwyżej 64, bo tyle mieści się w jednym miejscu
            w ekwipunku.
          </p>
          <p>
            <b>Skup może iść hurtem.</b> Po włączeniu tej opcji sklep odkupuje od gracza tylko całe porcje - ustawiasz, ile sztuk to
            jedna porcja i ile za nią płacisz. Reszta, która nie wypełni porcji, zostaje graczowi w ekwipunku.
          </p>
          <p>
            <b>Po co?</b> Żeby nie skupować pojedynczych sztuk za grosze i żeby ceny skupu były okrągłe. Przykład: sklep płaci 50 $ za 64
            sztuki bruku zamiast 0,78 $ za każdą.
          </p>
        </div>
      </div>
    );
  }

  /** Jak ogłoszenie nowej oferty wygląda na czacie dla tej kategorii - jej nazwa i przedmioty z puli. */
  function rotationAnnouncePreview(c: CategoryDraft, r: NonNullable<CategoryDraft["rotation"]>) {
    const num = (n: number | null) => (n == null ? "0" : Number.isInteger(n) ? String(n) : n.toFixed(2));
    const shown = r.pool.slice(0, Math.min(r.show, 3));
    const head = { category: c.name, days: String(r.everyDays) };
    const lines = shown.length
      ? shown.map((it) => ({
          item: it.name.trim() ? it.name : refLabel(it.ref, customNames),
          price: num(it.buy ?? it.sell),
          amount: String(it.buy != null ? it.amount : it.sellAmount),
        }))
      : [{ item: SAMPLE_VALUES.item, price: SAMPLE_VALUES.price, amount: SAMPLE_VALUES.amount }];
    return (
      <div className="ci-announce-preview">
        <div className="row" style={{ alignItems: "center", margin: 0 }}>
          <span style={{ flex: 1 }}>
            <span className="ci-field-title">Tak to wygląda na czacie</span>
            {!shown.length && <span className="muted small"> (przykładowy przedmiot - pula rotacyjna jest pusta)</span>}
          </span>
          <button type="button" onClick={openTexts} title="Tekst jest wspólny dla wszystkich kategorii - zmieniasz go w Ustawieniach">
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

  function statsHelpModal() {
    const close = () => setStatsHelp(false);
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Statystyki sprzedaży</h2>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p>
            Sklep zapisuje, <b>co gracze sprzedają</b>: ile sztuk, ile pieniędzy wypłacił i jak zmieniały się ceny skupu. Wszystko widać w
            tabeli poniżej.
          </p>
          <p>
            <b>Raport do Excela</b> to ta sama wiedza w tabeli, którą możesz posortować. Ostatnia kolumna, „SUGESTIA”, podpowiada, którym
            przedmiotom warto zmienić cenę - np. gdy skup czegoś prawie cały czas leży na dnie, bo gracze znoszą tego za dużo.
          </p>
          <p className="muted small">Przycisk „Pobierz raport do Excela” zapisuje go na Twoim komputerze - nie musisz niczego szukać na serwerze.</p>
        </div>
      </div>
    );
  }

  function dynamicHelpModal() {
    const close = () => setDynamicHelp(false);
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Ceny dynamiczne skupu</h2>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p>
            Sklep sam zmienia, <b>ile płaci graczom</b> za sprzedawane przedmioty. Ceny kupna się nie zmieniają - tylko skup.
          </p>
          <p>
            Gdy gracze sprzedają czegoś dużo, sklep płaci za to coraz mniej. Gdy nikt tego nie sprzedaje, cena powoli wraca w górę. Dzięki
            temu nie da się zbić fortuny, farmiąc bez końca jedną rzecz.
          </p>
          <p>
            <b>Przykład:</b> wszyscy sprzedają bruk po 50 $. Po kilku godzinach sklep płaci już 40 $, potem 30 $. Kiedy gracze przestaną,
            cena wraca do 50 $.
          </p>
          <p className="muted small">
            Poniżej ustawiasz, jak często ceny się przeliczają, o ile najwyżej mogą spaść i wzrosnąć i co ile dni wszystko wraca do normy.
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setDynamicHelp(false);
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

  function textsHelpModal() {
    const close = () => setTextsHelp(false);
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Teksty ogłoszeń na czacie</h2>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p>Wiadomości, które sklep sam wysyła na czat: nowa oferta w rotacji, reset cen i eventy.</p>

          <h3>Jak zmienić tekst</h3>
          <p>
            Kliknij linijkę w czarnym okienku i pisz w polu pod spodem. Kolor: zaznacz tekst myszką i kliknij kolorowy kwadracik przed
            polem.
          </p>

          <h3>Przyciski „+ nazwa kategorii”, „+ cena” itd.</h3>
          <p>
            Wstawiają ramkę <span className="mc-chip">nazwa kategorii</span>. W jej miejsce sklep sam wpisze to, czego dotyczy ogłoszenie:
          </p>
          <ul>
            <li>w Blokach: „NOWA OFERTA: Bloki”</li>
            <li>w Spawnerach: „NOWA OFERTA: Spawnery”</li>
          </ul>
          <p>Nazwa wchodzi w swoim kolorze - tym, który ma w kategorii.</p>

          <p className="muted small">
            <span className="ci-sample">Podkreślone kropkami</span> w okienku to tylko przykład. Zmiany działają w grze po „Wyślij na
            serwer”.
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setTextsHelp(false);
                setShopHelpTexts(true);
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

  function collectionInfoModal() {
    const r = file.cats.find((c) => c.id === "kolekcja")?.rotation;
    const close = () => setCollectionInfo(false);
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>Kolekcja - przedmioty kolekcjonerskie</h2>
            <button type="button" onClick={close}>
              Zamknij
            </button>
          </div>
          <p>
            To specjalna kategoria na rzeczy, które gracze chcą <b>mieć i zbierać</b>, a nie tylko zużyć: płyty muzyczne, głowy, rzadkie
            dekoracje. Normalnie trudno je zdobyć, a tutaj można je kupić - ale nie zawsze.
          </p>
          <p>
            Kolekcja nie ma stałych przedmiotów - wszystko siedzi w <b>puli rotacji</b>.
            {r
              ? ` Sklep co ${r.everyDays} dni losuje z niej ${r.show} przedmiotów, a reszta czeka na swoją kolej.`
              : " Sklep co kilka dni losuje z niej kilka przedmiotów, a reszta czeka na swoją kolej."}
          </p>
          <p>
            Dzięki temu każdy przedmiot staje się <b>rzadki</b>. Kto przegapi swoją płytę, może czekać tygodnie, aż wróci. Gracze zaglądają
            do sklepu, żeby sprawdzić nową ofertę, a rzeczy z Kolekcji nabierają wartości - można się nimi chwalić albo odsprzedać drożej
            na Targu komuś, kto nie zdążył.
          </p>
          <p>
            <b>Wysokie ceny są celowe.</b> To cel dla najbogatszych graczy i sposób na wyciąganie nadmiaru pieniędzy z serwera, żeby waluta
            nie traciła wartości.
          </p>
          <p className="muted small">
            Wskazówka: zostaw włączone „Ogłoś na czacie, gdy oferta się zmieni” - wtedy wszyscy wiedzą, że właśnie pojawiło się coś nowego.
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
            Wybrane przedmioty przenoszą się ze stałych do puli - przestają być dostępne zawsze. Przedmioty z puli zobaczysz i zmienisz po
            kliknięciu „Pula rotacji” nad listą w środku. Cofniesz przeniesienie przyciskiem „Wróć do stałych” przy przedmiocie z puli.
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
    const m: MenuScreenDraft = file.settings.menus[sc];
    const setMenu = (patch: Partial<MenuScreenDraft>) => setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, ...patch } } });
    const content: Record<number, SlotContent> = {};
    const catBySlot = categoryBySlot(m.layout, file.settings.categoryOrder);
    // Który przedmiot stoi w którym polu - liczone tak samo jak w pluginie (patrz previewSlotItems).
    const slotItem = previewSlotItems(sc);
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
        content[e.slot] = it
          ? {
              label: it.name.trim() ? plain(it.name) : refLabel(it.ref, customNames),
              kind: "item",
              material: it.ref.item ?? (it.ref.custom != null ? customIcon(it.ref.custom) : undefined),
              sublabel: money(perPiece(it.buy, it.amount)),
              onClick: open,
            }
          : { label: pc ? "" : "Przedmiot", kind: "item", dim: true, blank: Boolean(pc), onClick: open };
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
            const a = slotItem.get(from);
            const b = slotItem.get(to);
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
            const itemIndex = slotItem.get(slot);
            if (pc && itemIndex != null) {
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
      ["texts", "Teksty ogłoszeń", "co sklep pisze na czacie"],
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
                      : `Przedmiot skupowany za 100 $ nie spadnie poniżej ${100 - pct(d.minMultiplier)} $`
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
                        `Przedmiot skupowany za 100 $ nie urośnie powyżej ${100 + pct(d.maxMultiplier)} $`
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
                    `Przedmiot kupowany za 100 $ sklep odkupi najwyżej za ${Math.round(d.maxSellShare * 100)} $`
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
                      <p className="ci-warning small" style={{ margin: 0, flex: 1 }}>
                        <b>Uwaga:</b> domyślne wartości są przemyślane i przetestowane - zmieniaj tylko, gdy wiesz, co robisz. Jak coś
                        pójdzie nie tak, wpisz wartości domyślne podane pod każdym polem albo kliknij „Przywróć domyślne”.
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
            <>
              <h2>Teksty ogłoszeń na czacie</h2>
              <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
                <span className="muted small">Kliknij linijkę, żeby ją zmienić.</span>
                <HelpButton id="shop-announce-texts-v4" title="Jak działają teksty ogłoszeń" onClick={() => setTextsHelp(true)} />
                <ConfirmButton
                  title="Wszystkie teksty ogłoszeń wracają do tych z pluginu"
                  disabled={sameTexts(file.texts, defaultAnnounceTexts(language))}
                  onConfirm={() => {
                    setEditingText(null);
                    setTexts(defaultAnnounceTexts(language));
                  }}
                >
                  <Undo2 size={14} strokeWidth={1.75} /> Przywróć domyślne
                </ConfirmButton>
              </div>
                {ANNOUNCE_GROUPS.map(([group, title]) => {
                  const fields = ANNOUNCE_FIELDS.filter((f) => f.group === group);
                  const editing = fields.find((f) => f.key === editingText);
                  return (
                    <div key={group}>
                      <div className="ci-section-title">{title}</div>
                      <div className="mc-preview ci-chat-lines">
                        {fields.map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            className={`ci-chat-line${editingText === f.key ? " active" : ""}`}
                            title={`${f.label} - kliknij, żeby zmienić`}
                            onClick={() => setEditingText(editingText === f.key ? null : f.key)}
                          >
                            <SamplePreview text={file.texts[f.key] ?? ""} values={SAMPLE_VALUES} labels={PLACEHOLDER_LABELS} emptyLabel="(pusta linijka - nic się nie wyświetli)" />
                          </button>
                        ))}
                      </div>
                      {editing && (
                        <div className="ci-chat-edit">
                          <div className="row" style={{ alignItems: "center", margin: 0, gap: "0.4rem" }}>
                            <b style={{ marginRight: "0.4rem" }}>{editing.label}</b>
                            <button type="button" title="Cofnij (Ctrl+Z)" disabled={!textHistory.canUndo} onClick={() => textInputRef.current?.undo()}>
                              <Undo2 size={14} strokeWidth={1.75} /> Cofnij
                            </button>
                            <button type="button" title="Ponów (Ctrl+Y)" disabled={!textHistory.canRedo} onClick={() => textInputRef.current?.redo()}>
                              <Redo2 size={14} strokeWidth={1.75} /> Ponów
                            </button>
                            <button
                              type="button"
                              disabled={file.texts[editing.key] === defaultAnnounceTexts(language)[editing.key]}
                              onClick={() => textInputRef.current?.replaceAll(defaultAnnounceTexts(language)[editing.key])}
                            >
                              Przywróć domyślny
                            </button>
                            <button type="button" onClick={() => setEditingText(null)}>
                              Gotowe
                            </button>
                          </div>
                          <MinecraftTextInput
                            ref={textInputRef}
                            onHistoryChange={setTextHistory}
                            value={file.texts[editing.key] ?? ""}
                            onChange={(v) => setTexts({ [editing.key]: v })}
                            onEnter={() => setEditingText(null)}
                            hidePreview
                            inserts={editing.placeholders.map((ph) => ({ code: `{${ph}}`, label: PLACEHOLDER_LABELS[ph] }))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
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
    for (const f of ANNOUNCE_FIELDS) {
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
    const m = file.settings.menus[sc];
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
      setSettings({
        categoryOrder: cleared.order,
        menus: { ...file.settings.menus, [sc]: { ...m, layout: [...cleared.layout, entry] } },
      });
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
    const m: MenuScreenDraft = file.settings.menus[sc];
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
                            setFile({
                              ...file,
                              cats: file.cats.map((c) => (c.id === pc.id ? { ...c, items: next.items } : c)),
                              settings: { ...file.settings, menus: { ...file.settings.menus, [sc]: { ...m, layout: next.layout } } },
                            });
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
                    <MaterialIcon
                      material={role === "FILLER" ? fillerMaterial || "BLACK_STAINED_GLASS_PANE" : (roleMaterial(role, sc, file.settings.buttons) ?? "STONE")}
                      iconPackDir={iconPackDir}
                    />
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

  /**
   * Który przedmiot (numer z listy kategorii) stoi w którym polu na podglądzie - DOKŁADNIE jak w grze:
   * kolejność wg ustawienia (Twoja / po cenie), strony, wyśrodkowanie małych kategorii.
   */
  function previewSlotItems(sc: string): Map<number, number> {
    const out = new Map<number, number>();
    const pc = file.cats.find((c) => c.id === previewCat);
    if (!pc || sc !== "category-page") return out;
    const itemSlots = file.settings.menus[sc].layout.filter((e) => e.role === "ITEM_SLOT").map((e) => e.slot);
    const per = itemSlots.length;
    if (per === 0) return out;
    const order = sc === "category-page" ? displayOrder(pc.items, file.settings.categorySort) : pc.items.map((_, i) => i);
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

  /** Pasek nad siatką: co podglądamy, ile tego jest i przełączanie stron. */
  function previewBar(sc: string) {
    const pc = file.cats.find((c) => c.id === previewCat);
    if (!pc || sc !== "category-page") return null;
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

  /** Wybór ilości: lista przycisków "ile sztuk" z liczbą do zmiany - po lewej od siatki. */
  function amountPanel(sc: string) {
    const m: MenuScreenDraft = file.settings.menus[sc];
    const setMenu = (patch: Partial<MenuScreenDraft>) => setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, ...patch } } });
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
          onClick={() => {
            if (unsaved || notSent) setReloadConfirm(true);
            else load(profileId, pluginsPath);
          }}
          disabled={!profileId || busy}
        >
          ↶ Wczytaj z serwera
        </button>
        <button className="ci-publish" onClick={publish} disabled={!profileId || (!unsaved && !notSent) || busy}>
          <Save size={14} strokeWidth={1.75} /> Wyślij na serwer
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
            <p>
              Masz zmiany, których <b>nie ma na serwerze</b>. Po wczytaniu aplikacja pokaże to, co jest teraz na serwerze - a Twoje zmiany
              odłoży na bok. Do czasu następnego wczytania możesz je przywrócić jednym kliknięciem.
            </p>
            <div className="row">
              <button
                type="button"
                className="ci-danger"
                onClick={() => {
                  setReloadConfirm(false);
                  setDiscarded({ file, saved });
                  load(profileId, pluginsPath);
                }}
              >
                Tak, wczytaj z serwera
              </button>
              <button type="button" onClick={() => setReloadConfirm(false)}>
                Anuluj - zostaw moje zmiany
              </button>
            </div>
          </div>
        </div>
      )}
      {showCommands && <ShopCommandsModal file={file} onClose={() => setShowCommands(false)} />}
      <ItemDatalists materials={allMaterials} customIds={customIds} />
      {rotationHelp && rotationHelpModal()}
      {priceHelp && priceHelpModal()}
      {shopHelp && shopHelpModal()}
      {fixedHelp && fixedPriceHelpModal()}
      {dynamicHelp && dynamicHelpModal()}
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
      {statsHelp && statsHelpModal()}
      {collectionInfo && collectionInfoModal()}
      {textsHelp && textsHelpModal()}
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
