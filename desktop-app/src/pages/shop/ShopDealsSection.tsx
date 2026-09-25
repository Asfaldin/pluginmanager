import { Trash2 } from "lucide-react";
import { CopyRow, HelpButton } from "../../components/EditorBits";
import type { RankBonusDraft, ShopSettingsDraft } from "../../lib/shopYaml";

interface Props {
  settings: ShopSettingsDraft;
  setSettings: (patch: Partial<ShopSettingsDraft>) => void;
  onHelp: () => void;
}

/** Pole z liczbą i jednostką obok - jak w reszcie ustawień Sklepu. */
function unitInput(value: number, onChange: (n: number) => void, unit: string, min: number, max: number, step = "1") {
  return (
    <span className="ci-unit-input">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        style={{ width: "6rem" }}
      />
      <span className="ci-unit">{unit}</span>
    </span>
  );
}

/** Ustawienia → „Promocje”: czy ogłaszać promocje na czacie. */
export function ShopSalesSection({ settings: s, setSettings, onHelp }: Props) {
  return (
    <>
      <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        Promocje <HelpButton id="shop-sales" title="Jak działają promocje" onClick={onHelp} />
      </h2>
      <p className="muted small" style={{ marginTop: "0.2rem" }}>
        Promocja obniża cenę kupna - jednego przedmiotu, kategorii albo całego sklepu, na czas albo bez końca. Uruchamiasz ją w zakładce{" "}
        <b>Eventy</b> albo komendą <code>/@shop sale</code>.
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={s.salesAnnounce} onChange={(e) => setSettings({ salesAnnounce: e.target.checked })} />
        Ogłaszaj na czacie początek i koniec promocji
      </label>
    </>
  );
}

/** Ustawienia → „Bonusy dla rang”: rabat na kupno i premia do skupu dla graczy z rangą. */
export default function ShopRanksSection({ settings: s, setSettings, onHelp }: Props) {
  const setRank = (i: number, patch: Partial<RankBonusDraft>) =>
    setSettings({ rankBonuses: s.rankBonuses.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <h2 className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        Bonusy dla rang <HelpButton id="shop-ranks" title="Jak działają bonusy dla rang" onClick={onHelp} />
      </h2>
      <p className="muted small" style={{ marginTop: "0.2rem" }}>
        Gracz z rangą płaci mniej przy kupnie i dostaje więcej za sprzedaż. Rangę daje uprawnienie podane pod nazwą - nadaj je graczom z
        tą rangą. Gracz z kilkoma rangami dostaje największy bonus. Promocja i rabat rangi się sumują (-20% i -10% = płaci 72% ceny).
      </p>
      {s.rankBonuses.map((r, i) => (
        <div key={i} className="card" style={{ padding: "0.6rem", margin: "0.4rem 0" }}>
          <div className="row" style={{ alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap", margin: 0 }}>
            <label style={{ margin: 0 }}>
              <span className="muted small">Nazwa rangi</span>
              <input
                value={r.rank}
                placeholder="np. vip"
                onChange={(e) => setRank(i, { rank: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                style={{ width: "10rem" }}
              />
            </label>
            <label style={{ margin: 0 }}>
              <span className="muted small">Rabat na kupno</span>
              {unitInput(r.buyDiscount, (n) => setRank(i, { buyDiscount: n }), "%", 0, 90, "0.5")}
            </label>
            <label style={{ margin: 0 }}>
              <span className="muted small">Premia do skupu</span>
              {unitInput(r.sellBonus, (n) => setRank(i, { sellBonus: n }), "%", 0, 90, "0.5")}
            </label>
            <button
              type="button"
              className="ci-trash"
              title="Usuń tę rangę"
              onClick={() => setSettings({ rankBonuses: s.rankBonuses.filter((_, j) => j !== i) })}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {r.rank && (
            <>
              <p className="muted small" style={{ margin: "0.4rem 0 0.2rem" }}>
                Przykład: coś za 100 zł gracz z tą rangą kupi za {Math.round((100 - r.buyDiscount) * 100) / 100} zł, a za sprzedaż wartą 100 zł
                dostanie {Math.round((100 + r.sellBonus) * 100) / 100} zł. Uprawnienie:
              </p>
              <div className="ci-protip">
                <CopyRow cmd={`mainplugins.shop.rank.${r.rank}`} what="nadaj je graczom z tą rangą" />
              </div>
            </>
          )}
        </div>
      ))}
      {s.rankBonuses.length === 0 && <p className="muted small">Brak bonusów - wszyscy płacą tyle samo.</p>}
      <button
        type="button"
        onClick={() => setSettings({ rankBonuses: [...s.rankBonuses, { rank: s.rankBonuses.length ? "" : "vip", buyDiscount: 2, sellBonus: 1 }] })}
      >
        + Dodaj rangę
      </button>
    </>
  );
}
