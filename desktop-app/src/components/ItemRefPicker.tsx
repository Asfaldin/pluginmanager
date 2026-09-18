import { useId } from "react";
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
}

/** Wybór przedmiotu: zwykły item Minecrafta albo custom item z katalogu (items/). */
export default function ItemRefPicker({ value, onChange, materials, customIds, showAmount, maxAmount, iconPackDir }: Props) {
  const listId = useId();
  const custom = value.custom != null;
  const pack = iconPackDir ?? getIconPackDir();
  return (
    <div className="row" style={{ alignItems: "center" }}>
      {custom ? <span className="ci-badge">custom</span> : <MaterialIcon material={value.item ?? ""} iconPackDir={pack} />}
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
        list={listId}
        value={custom ? value.custom : (value.item ?? "")}
        onChange={(e) =>
          onChange(custom ? { ...value, custom: e.target.value } : { ...value, item: e.target.value.toUpperCase() })
        }
        style={{ flex: 1 }}
      />
      <datalist id={listId}>
        {(custom ? customIds : materials).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
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
