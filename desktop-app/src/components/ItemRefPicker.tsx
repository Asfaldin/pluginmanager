
import type { ItemRef } from "../lib/cratesYaml";
import { getIconPackDir } from "../lib/materialIcons";
import MaterialIcon from "./MaterialIcon";

interface Props {
  value: ItemRef;
  onChange: (r: ItemRef) => void;
  materials: string[];
  customIds: string[];
  showAmount?: boolean;
  /** Górna granica ilości (domyślnie 64 - stack). */
  maxAmount?: number;
  /** Paczka tekstur na ikonki; bez tego bierzemy tę wspólną, ustawioną raz dla całej aplikacji. */
  iconPackDir?: string;
  /** Wygląd custom itemów: id -> zwykły materiał do ikonki (np. spawner_zombie -> SPAWNER). */
  customIcons?: Record<string, string>;
}

// Podpowiedzi (ponad 1500 przedmiotow) siedza w JEDNEJ liscie na cala strone - strona
// rysuje <ItemDatalists> raz, a wszystkie pola tylko sie do niej odwoluja. Wczesniej kazde
// pole robilo wlasna kopie przy kazdym przerysowaniu i strona sie przez to zacinala.
export const MATERIALS_LIST_ID = "app-materials";
export const CUSTOM_LIST_ID = "app-custom-items";

/** Wspólne listy podpowiedzi - strona z polami wyboru przedmiotu rysuje to raz. */
export function ItemDatalists({ materials, customIds }: { materials: string[]; customIds: string[] }) {
  return (
    <>
      <datalist id={MATERIALS_LIST_ID}>
        {materials.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id={CUSTOM_LIST_ID}>
        {customIds.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

/** Wybór przedmiotu: zwykły item Minecrafta albo custom item z katalogu (items/). */
export default function ItemRefPicker({ value, onChange, customIds, showAmount, maxAmount, iconPackDir, customIcons }: Props) {
  const custom = value.custom != null;
  const pack = iconPackDir ?? getIconPackDir();
  return (
    <div className="row" style={{ alignItems: "center" }}>
      {custom ? (
        customIcons?.[value.custom ?? ""] ? (
          <MaterialIcon material={customIcons[value.custom ?? ""]} iconPackDir={pack} />
        ) : (
          <span className="ci-badge">custom</span>
        )
      ) : (
        <MaterialIcon material={value.item ?? ""} iconPackDir={pack} />
      )}
      <select
        value={custom ? "custom" : "item"}
        onChange={(e) =>
          onChange(
            e.target.value === "custom"
              ? { custom: customIds[0] ?? "", amount: value.amount }
              : { item: "STONE", amount: value.amount }
          )
        }
      >
        <option value="item">Zwykły item</option>
        <option value="custom">Custom item</option>
      </select>
      <input
        list={custom ? CUSTOM_LIST_ID : MATERIALS_LIST_ID}
        value={custom ? value.custom : (value.item ?? "")}
        onChange={(e) =>
          onChange(custom ? { ...value, custom: e.target.value } : { ...value, item: e.target.value.toUpperCase() })
        }
        style={{ flex: 1 }}
      />
      {showAmount && (
        <input
          type="number"
          min={1}
          max={maxAmount ?? 64}
          title="Ilość"
          value={value.amount ?? 1}
          onChange={(e) => onChange({ ...value, amount: Math.max(1, Number(e.target.value)) })}
          style={{ width: "4.5rem" }}
        />
      )}
    </div>
  );
}
