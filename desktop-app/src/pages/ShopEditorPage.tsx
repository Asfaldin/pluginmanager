import { ArrowDown, ArrowUp, Save, Store, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CopyRow, Fold, LoreEditor } from "../components/EditorBits";
import ItemRefPicker from "../components/ItemRefPicker";
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
  defaultSettings,
  fromPerPiece,
  isLotted,
  newCategory,
  newItem,
  parseCategory,
  parseShopSettings,
  perPiece,
  ROLE_LABELS,
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
import { parseSpawnerConfig } from "../lib/spawnersYaml";
import { useIconPack } from "../lib/useIconPack";
import { useDirtyTracking } from "../state/DirtyContext";
import { useProfiles } from "../state/ProfilesContext";

interface ShopFile {
  settings: ShopSettingsDraft;
  cats: CategoryDraft[];
}

type Sel = { kind: "cat" } | { kind: "item"; pool: boolean; index: number };
type Tab = "cats" | "settings" | "stats";

const EMPTY: ShopFile = { settings: defaultSettings(), cats: [] };
const GOAT_HORNS = ["ponder_goat_horn", "sing_goat_horn", "seek_goat_horn", "feel_goat_horn", "admire_goat_horn", "call_goat_horn", "yearn_goat_horn", "dream_goat_horn"];
const ROLES_BY_SCREEN: Record<string, string[]> = {
  "main-menu": ["CATEGORY_SLOT", "SEARCH", "EXIT", "FILLER"],
  "category-page": ["ITEM_SLOT", "SORT", "NAV_PREV", "NAV_NEXT", "NAV_BACK", "EXIT", "FILLER"],
  "buy-picker": ["AMOUNT_SLOT", "NAV_BACK", "FILLER"],
  "search-results": ["ITEM_SLOT", "NAV_BACK", "FILLER"],
};

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

function money(n: number | null): string {
  if (n == null) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
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
          <CopyRow cmd="/@shop price <przedmiot> buy <kwota>" what="zmienia cenę kupna paczki (zapis w pliku kategorii)" />
          <CopyRow cmd="/@shop price <przedmiot> sell <kwota>" what="zmienia cenę skupu paczki" />
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
  const [trashConfirm, setTrashConfirm] = useState<string | null>(null);
  const [screen, setScreen] = useState("main-menu");
  const [layoutEdit, setLayoutEdit] = useState(false);
  const [addRole, setAddRole] = useState("CATEGORY_SLOT");
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

  function setCats(cats: CategoryDraft[]) {
    setFile({ ...file, cats, settings: { ...file.settings, categoryOrder: cats.map((c) => c.id) } });
  }

  function updateCategory(id: string, patch: Partial<CategoryDraft>) {
    setFile({ ...file, cats: file.cats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
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

  function moveCategory(id: string, dir: -1 | 1) {
    const i = file.cats.findIndex((c) => c.id === id);
    const to = i + dir;
    if (i < 0 || to < 0 || to >= file.cats.length) return;
    const cats = [...file.cats];
    [cats[i], cats[to]] = [cats[to], cats[i]];
    setCats(cats);
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
        <Trash2 size={14} strokeWidth={1.75} />
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
    if (it.buy != null) parts.push(isLotted(it) && it.amount > 1 ? `kupno ${money(it.buy)} za ${it.amount} szt.` : `kupno ${money(it.buy)}`);
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
        {trashButton(key, "Usuń pozycję")}
      </div>
    );
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
          <button type="button" title="Wyżej" onClick={() => moveItem(c, pool, index, -1)} disabled={index === 0}>
            <ArrowUp size={14} />
          </button>
          <button type="button" title="Niżej" onClick={() => moveItem(c, pool, index, 1)} disabled={index === listOf(c, pool).length - 1}>
            <ArrowDown size={14} />
          </button>
        </h2>
        <p className="muted small">Klucz w komendach: {itemKey(it.ref)}</p>
        <Fold title="Przedmiot" open>
          <ItemRefPicker value={it.ref} onChange={(r) => set({ ref: r.custom != null ? { custom: r.custom } : { item: r.item } })} materials={allMaterials} customIds={customIds} />
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
            Ceny w paczkach (np. 64 sztuki za 640)
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={it.buy != null} onChange={(e) => set({ buy: e.target.checked ? 1 : null })} />
            Da się kupić
          </label>
          {it.buy != null &&
            (lotted ? (
              <div className="row" style={{ alignItems: "center" }}>
                Kupno: paczka {numberInput(it.amount, (n) => set({ amount: Math.max(1, Math.floor(n)) }), "1", 1)} szt. za {numberInput(it.buy, (n) => set({ buy: n }))}
                <span className="muted small">= {money(perPiece(it.buy, it.amount))} za sztukę</span>
              </div>
            ) : (
              <label>
                Cena kupna za sztukę {numberInput(it.buy, (n) => set({ buy: n }))}
              </label>
            ))}
          <label className="checkbox">
            <input type="checkbox" checked={it.sell != null} onChange={(e) => set({ sell: e.target.checked ? 0.5 : null })} />
            Da się sprzedać
          </label>
          {it.sell != null &&
            (lotted ? (
              <div className="row" style={{ alignItems: "center" }}>
                Skup: paczka {numberInput(it.sellAmount, (n) => set({ sellAmount: Math.max(1, Math.floor(n)) }), "1", 1)} szt. za {numberInput(it.sell, (n) => set({ sell: n }))}
                <span className="muted small">= {money(perPiece(it.sell, it.sellAmount))} za sztukę</span>
              </div>
            ) : (
              <label>
                Cena skupu za sztukę {numberInput(it.sell, (n) => set({ sell: n }))}
              </label>
            ))}
          <p className="muted small">
            {rounding === "whole"
              ? "Sklep liczy w pełnych złotówkach (Ustawienia): część paczki zaokrągla się w górę do złotówki."
              : "Sklep liczy z groszami (Ustawienia)."}{" "}
            Gracz sprzedaje tylko pełne paczki skupu - reszta zostaje mu w ekwipunku.
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
          <ItemRefPicker value={c.icon} onChange={(ref) => updateCategory(c.id, { icon: ref.custom != null ? { custom: ref.custom } : { item: ref.item } })} materials={allMaterials} customIds={customIds} />
        </Fold>
        <Fold title="Rotacja (oferta zmieniająca się co kilka dni)" open={r != null}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={r?.enabled ?? false}
              onChange={(e) =>
                updateCategory(c.id, {
                  rotation: r ? { ...r, enabled: e.target.checked } : { enabled: true, show: 5, everyDays: 14, pool: [], raw: {} },
                })
              }
            />
            Włącz rotację
          </label>
          <p className="muted small">
            Co kilka dni sklep losuje kilka pozycji z puli i pokazuje je w tej kategorii obok zwykłych pozycji. Pozycja, która była w ofercie,
            przez 5 kolejnych losowań „odpoczywa”.
          </p>
          {r && (
            <>
              <label>
                Ile pozycji naraz {numberInput(r.show, (n) => updateCategory(c.id, { rotation: { ...r, show: Math.max(1, Math.floor(n)) } }), "1", 1)}
              </label>
              <label>
                Co ile dni nowa oferta {numberInput(r.everyDays, (n) => updateCategory(c.id, { rotation: { ...r, everyDays: Math.max(1, Math.floor(n)) } }), "1", 1)}
              </label>
              <p className="muted small">Pula ma {r.pool.length} pozycji - edytujesz je na liście w środku, pod zwykłymi pozycjami.</p>
            </>
          )}
        </Fold>
      </>
    );
  }

  // ---- ustawienia ----

  function layoutEditor(sc: string) {
    const m: MenuScreenDraft = file.settings.menus[sc];
    const setMenu = (patch: Partial<MenuScreenDraft>) => setSettings({ menus: { ...file.settings.menus, [sc]: { ...m, ...patch } } });
    const content: Record<number, SlotContent> = {};
    let n = 0;
    for (const e of m.layout) {
      if (e.role === "CATEGORY_SLOT") {
        const cat = file.cats.find((c) => c.id === file.settings.categoryOrder[n++]);
        content[e.slot] = { label: cat ? plain(cat.name) : "(wolne)", kind: "category", material: cat?.icon.item, dim: !cat };
      } else if (e.role === "ITEM_SLOT") {
        content[e.slot] = { label: "Przedmiot", kind: "item", dim: true };
      } else if (e.role === "AMOUNT_SLOT") {
        content[e.slot] = { label: `${e.amount ?? 1} szt.`, kind: "item", material: "STONE", sublabel: String(e.amount ?? 1) };
      } else if (e.role === "FILLER") {
        content[e.slot] = { label: "Tło", kind: "nav", material: e.material ?? "GRAY_STAINED_GLASS_PANE" };
      } else {
        content[e.slot] = { label: ROLE_LABELS[e.role] ?? e.role, kind: "nav", material: conventionalRoleIcon(e.role) };
      }
    }
    const roles = ROLES_BY_SCREEN[sc];
    const role = roles.includes(addRole) ? addRole : roles[0];
    const amounts = m.layout.filter((e) => e.role === "AMOUNT_SLOT");
    const fillers = m.layout.filter((e) => e.role === "FILLER");
    return (
      <>
        <div className="row" style={{ alignItems: "center" }}>
          <label className="row" style={{ alignItems: "center", margin: 0 }}>
            Rozmiar okna
            <select value={m.size} onChange={(e) => setMenu({ size: Number(e.target.value), layout: m.layout.filter((x) => x.slot < Number(e.target.value)) })}>
              {[9, 18, 27, 36, 45, 54].map((s) => (
                <option key={s} value={s}>
                  {s / 9} rzędy ({s} pól)
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={layoutEdit ? "ci-publish" : undefined} onClick={() => setLayoutEdit(!layoutEdit)}>
            {layoutEdit ? "Gotowe" : "Zmień układ"}
          </button>
          {layoutEdit && (
            <>
              <select value={role} onChange={(e) => setAddRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    Dodawane: {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <span className="muted small">Kliknij wolne pole, żeby dodać. Przeciągnij pole, żeby przenieść.</span>
            </>
          )}
        </div>
        <SlotGrid
          content={content}
          size={m.size}
          editable={layoutEdit}
          allowSwap
          plain
          iconPackDir={iconPackDir}
          onMoveSlot={(from, to) => setMenu({ layout: m.layout.map((e) => (e.slot === from ? { ...e, slot: to } : e.slot === to ? { ...e, slot: from } : e)) })}
          onAddSlot={(slot) =>
            setMenu({
              layout: [...m.layout, role === "AMOUNT_SLOT" ? { slot, role, amount: 1 } : role === "FILLER" ? { slot, role, material: "BLACK_STAINED_GLASS_PANE" } : { slot, role }],
            })
          }
          onRemoveSlot={(slot) => setMenu({ layout: m.layout.filter((e) => e.slot !== slot) })}
        />
        {amounts.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <div className="ci-section-title">Ile sztuk na przyciskach</div>
            {amounts.map((e) => (
              <label key={e.slot} className="row" style={{ alignItems: "center" }}>
                Pole {e.slot}:
                {numberInput(e.amount ?? 1, (v) => setMenu({ layout: m.layout.map((x) => (x.slot === e.slot ? { ...x, amount: Math.max(1, Math.floor(v)) } : x)) }), "1", 1)} szt.
              </label>
            ))}
          </div>
        )}
        {fillers.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <div className="ci-section-title">Własne tło na polach</div>
            {fillers.map((e) => (
              <label key={e.slot} className="row" style={{ alignItems: "center" }}>
                Pole {e.slot}:
                {materialInput(e.material ?? "", (v) => setMenu({ layout: m.layout.map((x) => (x.slot === e.slot ? { ...x, material: v } : x)) }), `shop-filler-${sc}-${e.slot}`)}
              </label>
            ))}
          </div>
        )}
      </>
    );
  }

  function materialInput(value: string, onPick: (m: string) => void, listId: string) {
    return (
      <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
        {value && <MaterialIcon material={value} iconPackDir={iconPackDir} />}
        <input list={listId} value={value} onChange={(e) => onPick(e.target.value.toUpperCase().replace(/\s+/g, "_"))} style={{ minWidth: "14rem" }} />
        <datalist id={listId}>
          {allMaterials.map((mm) => (
            <option key={mm} value={mm} />
          ))}
        </datalist>
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
            Pełne złotówki (1 sztuka z paczki „64 za 10” kosztuje 1)
          </label>
          <label className="checkbox">
            <input type="radio" checked={s.rounding === "cents"} onChange={() => setSettings({ rounding: "cents" })} />
            Grosze (1 sztuka z paczki „64 za 10” kosztuje 0.16)
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
                Najniższy skup (część zwykłej ceny) {numberInput(d.minMultiplier, (n) => setDyn({ minMultiplier: n }), "0.05")}
                <span className="muted small">np. 0.5 = połowa</span>
              </label>
              <label>
                Najwyższy skup (część zwykłej ceny) {numberInput(d.maxMultiplier, (n) => setDyn({ maxMultiplier: n }), "0.05")}
                <span className="muted small">np. 1.5 = półtora raza</span>
              </label>
              <label>
                Co ile dni wszystkie ceny wracają do normy {numberInput(d.resetDays, (n) => setDyn({ resetDays: Math.max(1, Math.floor(n)) }), "1", 1)}
              </label>
              <label>
                Skup najwyżej taka część ceny kupna {numberInput(d.maxSellShare, (n) => setDyn({ maxSellShare: Math.min(1, n) }), "0.05")}
                <span className="muted small">0.9 = skup nigdy nie da więcej niż 90% ceny kupna</span>
              </label>
            </>
          )}
        </Fold>
        <Fold title="Statystyki sprzedaży">
          <label className="checkbox">
            <input type="checkbox" checked={s.statsEnabled} onChange={(e) => setSettings({ statsEnabled: e.target.checked })} />
            Zbieraj statystyki (stats.yml + raport stats.csv do Excela z podpowiedziami cen)
          </label>
        </Fold>
        <Fold title="Wygląd menu" open>
          <div className="row">
            {SCREENS.map((sc) => (
              <button key={sc} type="button" className={screen === sc ? "ci-publish" : undefined} onClick={() => setScreen(sc)}>
                {SCREEN_LABELS[sc]}
              </button>
            ))}
          </div>
          {layoutEditor(screen)}
        </Fold>
        <Fold title="Przyciski (wygląd)">
          {Object.keys(BUTTON_LABELS).map((b) => (
            <label key={b}>
              {BUTTON_LABELS[b]}
              {materialInput(s.buttons[b] ?? "", (v) => setSettings({ buttons: { ...s.buttons, [b]: v } }), `shop-btn-${b}`)}
            </label>
          ))}
          <p className="muted small">Teksty przycisków i tytuły okien są w plikach językowych pluginu (lang/en.yml, lang/pl.yml).</p>
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
                      <td>{m == null ? "100%" : `${Math.round(m * 100)}%${m > 1.02 ? " ▲" : m < 0.98 ? " ▼" : ""}`}</td>
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
        <select value="" onChange={(e) => loadTemplate(e.target.value)} disabled={!profileId} title="Gotowe sklepy">
          <option value="">Wczytaj szablon...</option>
          {shopTemplateChoices(language).map((t) => (
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
      {showCommands && <ShopCommandsModal file={file} onClose={() => setShowCommands(false)} />}

      <div className="row">
        <button type="button" className={tab === "cats" ? "ci-publish" : undefined} onClick={() => setTab("cats")}>
          Kategorie
        </button>
        <button type="button" className={tab === "settings" ? "ci-publish" : undefined} onClick={() => setTab("settings")}>
          Ustawienia
        </button>
        <button type="button" className={tab === "stats" ? "ci-publish" : undefined} onClick={() => setTab("stats")}>
          Statystyki
        </button>
      </div>

      {tab === "settings" && renderSettings()}
      {tab === "stats" && renderStats()}

      {tab === "cats" && (
        <div className="ci-layout ci-layout-crates ci-layout-quests">
          <aside className="card ci-cats">
            <div className="ci-section-title">Kategorie</div>
            {file.cats.map((c, i) =>
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
                    <span className="ci-prize-count" title={`${c.items.length} pozycji`}>
                      <Store size={12} strokeWidth={2} /> {c.items.length}
                    </span>
                  </button>
                  <button type="button" className="ci-trash" title="Wyżej w menu" onClick={() => moveCategory(c.id, -1)} disabled={i === 0}>
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
                <div className="ci-group">Pozycje ({category.items.length})</div>
                {category.items.map((it, i) => itemRow(category, false, it, i))}
                <button type="button" onClick={() => addItem(category, false)}>
                  + Dodaj przedmiot
                </button>
                {category.rotation && (
                  <>
                    <div className="ci-group" style={{ marginTop: "0.8rem" }}>
                      Pula rotacji ({category.rotation.pool.length}){category.rotation.enabled ? "" : " - rotacja wyłączona"}
                    </div>
                    {category.rotation.pool.map((it, i) => itemRow(category, true, it, i))}
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
