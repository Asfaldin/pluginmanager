import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { HelpButton } from "../../components/EditorBits";
import { MATERIALS_LIST_ID } from "../../components/ItemRefPicker";
import MaterialIcon from "../../components/MaterialIcon";
import MinecraftTextInput from "../../components/MinecraftTextInput";
import MinecraftTextPreview from "../../components/MinecraftTextPreview";
import SlotGrid, { type SlotContent } from "../../components/SlotGrid";
import { itemDisplayName } from "../../lib/itemNames";
import { placeAt, resize, swapSlots, thingAt, type SlotThing } from "../../lib/marketLayout";
import { BUTTON_IDS, BUTTON_LABELS, type MarketConfig } from "../../lib/marketYaml";
import { plural } from "../../lib/plText";

interface Props {
  config: MarketConfig;
  setConfig: (patch: Partial<MarketConfig>) => void;
  /** Tytuł z „Tekstów w grze” - gdy własny tytuł jest pusty. */
  defaultTitle: string;
  currency: string;
  iconPackDir?: string;
  onHelp: () => void;
}

/** Przykładowe oferty do podglądu - w grze w tych polach staną prawdziwe oferty graczy. */
const SAMPLE_OFFERS: Array<[string, number]> = [
  ["DIAMOND_SWORD", 1500],
  ["ELYTRA", 25000],
  ["GOLDEN_APPLE", 300],
  ["DIAMOND", 120],
  ["NETHERITE_INGOT", 4000],
  ["ENCHANTED_BOOK", 800],
  ["TOTEM_OF_UNDYING", 6000],
  ["OAK_LOG", 20],
  ["IRON_PICKAXE", 250],
  ["SHULKER_BOX", 3500],
  ["EMERALD", 90],
  ["BEACON", 20000],
  ["COOKED_BEEF", 5],
  ["ENDER_PEARL", 60],
  ["SPAWNER", 50000],
  ["BOW", 180],
  ["OBSIDIAN", 40],
  ["TRIDENT", 9000],
  ["EXPERIENCE_BOTTLE", 35],
  ["NAME_TAG", 150],
  ["SADDLE", 200],
];

const ROWS = [1, 2, 3, 4, 5, 6];

/** Zakładka „Wygląd okna”: okno Targu jak w grze - rozmiar, tytuł, tło, pola ofert i przyciski. */
export default function MarketWindowTab({ config: c, setConfig, defaultTitle, currency, iconPackDir, onHelp }: Props) {
  const [slotPick, setSlotPick] = useState<number | null>(null);
  // Podgląd tła: wolne pola jako szkło, tak jak w grze (zapamiętane na tym komputerze).
  const [showBackground, setShowBackground] = useState(() => {
    try {
      return localStorage.getItem("pm-market-bg") !== "off";
    } catch {
      return true;
    }
  });

  const set = (next: MarketConfig) => setConfig({ size: next.size, offerSlots: next.offerSlots, buttons: next.buttons });
  const offerOrder = [...c.offerSlots].filter((s) => s < c.size).sort((a, b) => a - b);
  const bg = c.background || "GRAY_STAINED_GLASS_PANE";

  const content: Record<number, SlotContent> = {};
  for (let s = 0; s < c.size; s++) {
    const t = thingAt(c, s);
    const open = () => setSlotPick(s);
    if (t === "offer") {
      const [material, price] = SAMPLE_OFFERS[offerOrder.indexOf(s) % SAMPLE_OFFERS.length];
      content[s] = { label: `Oferta (przykład: ${itemDisplayName(material)} za ${price}${currency})`, kind: "item", material, sublabel: `${price}${currency}`, onClick: open };
    } else if (t) {
      const off = t === "mailbox" && !c.mailbox;
      content[s] = off
        ? { label: "Do odebrania - skrzynka wyłączona, w grze stoi tu tło", kind: "nav", material: showBackground ? bg : undefined, dim: true, blank: true, onClick: open }
        : // blank = bez krzyżyka usuwania - przycisk musi gdzieś stać, można go tylko przenieść.
          { label: BUTTON_LABELS[t], kind: "nav", material: c.buttons[t].material, blank: true, onClick: open };
    } else {
      content[s] = { label: showBackground ? "Tło" : "", kind: "filler", blank: true, material: showBackground ? bg : undefined, onClick: open };
    }
  }

  function pickModal() {
    if (slotPick == null) return null;
    const slot = slotPick;
    const here = thingAt(c, slot);
    const close = () => setSlotPick(null);
    const choose = (what: SlotThing) => {
      set(placeAt(c, slot, what));
      close();
    };
    const isButton = here !== null && here !== "offer";
    const option = (what: SlotThing, icon: string, label: string, disabled = false) => (
      <button key={String(what)} type="button" className={`ci-slot-pick${here === what ? " active" : ""}`} disabled={disabled} onClick={() => choose(what)}>
        <MaterialIcon material={icon} iconPackDir={iconPackDir} />
        <span>{label}</span>
      </button>
    );
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
            Pole {slot + 1} - teraz: {here === "offer" ? "oferta" : here ? BUTTON_LABELS[here] : "tło"}
          </p>
          <div className="ci-slot-pick-grid">
            {option("offer", "DIAMOND_SWORD", "Oferta", isButton)}
            {option(null, bg, "Tło (puste pole)", isButton)}
          </div>
          {isButton && (
            <p className="ci-note small">
              Przycisk musi gdzieś stać. Żeby go stąd zabrać, postaw tu inny przycisk (zamienią się miejscami) albo przeciągnij go myszką na
              inne pole.
            </p>
          )}
          <div className="ci-field-title" style={{ marginTop: "0.6rem" }}>
            Przycisk
          </div>
          <div className="ci-slot-pick-grid">
            {BUTTON_IDS.map((id) => option(id, c.buttons[id].material, id === "mailbox" && !c.mailbox ? `${BUTTON_LABELS[id]} (wyłączona)` : BUTTON_LABELS[id]))}
          </div>
          <p className="muted small">Przycisk przeniesie się tutaj, a to, co tu stało, pójdzie na jego stare miejsce.</p>
        </div>
      </div>
    );
  }

  const title = (c.title.trim() || defaultTitle).replace(/\{page\}/g, "1");

  return (
    <section className="card form">
      <div className="row" style={{ alignItems: "flex-start", gap: "1rem" }}>
        <div className="ci-side-compact" style={{ flex: "0 0 20rem", maxWidth: "20rem" }}>
          <div className="card" style={{ padding: "0.6rem" }}>
            <div className="ci-field-title">Rozmiar okna</div>
            <select
              value={c.size}
              onChange={(e) => {
                const size = Number(e.target.value);
                if (size !== c.size) set(resize(c, size));
              }}
            >
              {ROWS.map((r) => (
                <option key={r} value={r * 9}>
                  {r} {plural(r, "rząd", "rzędy", "rzędów")} ({r * 9} pól)
                </option>
              ))}
            </select>
            <p className="muted small" style={{ margin: "0.3rem 0 0" }}>
              Na jednej stronie: {offerOrder.length} {plural(offerOrder.length, "oferta", "oferty", "ofert")}. Zmiana rozmiaru układa pola
              ofert od nowa, przyciski zostają na dole.
            </p>
          </div>
          <div className="card" style={{ padding: "0.6rem" }}>
            <div className="ci-field-title">Tytuł okna</div>
            <MinecraftTextInput
              value={c.title}
              onChange={(v) => setConfig({ title: v })}
              placeholder="puste = tytuł z „Teksty w grze”"
              hidePreview
              inserts={[{ code: "{page}", label: "numer strony" }]}
            />
          </div>
          <div className="card" style={{ padding: "0.6rem" }}>
            <div className="ci-field-title">Tło (wolne pola)</div>
            <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
              {c.background && <MaterialIcon material={c.background} iconPackDir={iconPackDir} />}
              <input
                list={MATERIALS_LIST_ID}
                value={c.background}
                onChange={(e) => setConfig({ background: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
                style={{ minWidth: 0, flex: 1 }}
              />
            </span>
          </div>
          <div className="card" style={{ padding: "0.6rem" }}>
            <div className="ci-field-title">Ikonki przycisków</div>
            {BUTTON_IDS.map((id) => (
              <label key={id} style={{ margin: "0.25rem 0" }}>
                <span className="small">
                  {BUTTON_LABELS[id]}
                  {id === "mailbox" && !c.mailbox && <span className="muted"> (skrzynka wyłączona)</span>}
                </span>
                <span className="row" style={{ alignItems: "center", gap: "0.4rem", margin: 0 }}>
                  {c.buttons[id].material && <MaterialIcon material={c.buttons[id].material} iconPackDir={iconPackDir} />}
                  <input
                    list={MATERIALS_LIST_ID}
                    value={c.buttons[id].material}
                    onChange={(e) => setConfig({ buttons: { ...c.buttons, [id]: { ...c.buttons[id], material: e.target.value.toUpperCase().replace(/\s+/g, "_") } } })}
                    style={{ minWidth: 0, flex: 1 }}
                  />
                </span>
              </label>
            ))}
            <p className="muted small" style={{ margin: "0.3rem 0 0" }}>
              „Zamknij” zmienia się w „Wróć do menu”, gdy gracz otworzy Targ z menu serwera.
            </p>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, marginTop: "0.2rem" }}>
          <div className="ci-grid-wrap">
            <div className="ci-grid-tools">
              <button
                type="button"
                className={`ci-view-toggle${showBackground ? " on" : ""}`}
                title={showBackground ? "Wolne pola wyglądają jak w grze - kliknij, żeby schować" : "Pokaż wolne pola jak w grze"}
                onClick={() => {
                  const next = !showBackground;
                  setShowBackground(next);
                  try {
                    localStorage.setItem("pm-market-bg", next ? "on" : "off");
                  } catch {
                    // bez localStorage - nie zapamięta
                  }
                }}
              >
                {showBackground ? <Eye size={14} strokeWidth={1.75} /> : <EyeOff size={14} strokeWidth={1.75} />} Tło
              </button>
              <HelpButton id="market-window" title="Wygląd okna" onClick={onHelp} />
            </div>
            <div className="mc-preview" style={{ marginBottom: "0.4rem", display: "inline-block", minWidth: "12rem" }}>
              <MinecraftTextPreview text={title} emptyLabel="(bez tytułu)" />
            </div>
            <SlotGrid
              content={content}
              size={c.size}
              editable
              allowSwap
              plain
              iconPackDir={iconPackDir}
              onMoveSlot={(from, to) => set(swapSlots(c, from, to))}
              onRemoveSlot={(slot) => {
                if (thingAt(c, slot) === "offer") set(placeAt(c, slot, null));
              }}
            />
            <p className="muted small">
              Kliknij pole, żeby wybrać, co ma w nim być. Przeciągnij, żeby zamienić dwa pola miejscami. Przedmioty w polach ofert to przykład -
              w grze staną tam oferty graczy.
            </p>
          </div>
        </div>
      </div>
      {pickModal()}
    </section>
  );
}
