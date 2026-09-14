import { useId } from "react";
import { emptyReward, REWARD_TYPES, type Reward, type RewardType } from "../lib/rewards";

interface Props {
  value: Reward[];
  onChange: (list: Reward[]) => void;
  materials: string[];
  customIds: string[];
  crateIds: string[];
  keyIds: string[];
  /** Id tytułów (sekcja titles w quests.yml) - podpowiedzi dla nagrody „Tytuł”. */
  titleIds?: string[];
  /** Wewnątrz nagrody zastępczej - bez kolejnego poziomu fallbacku. */
  nested?: boolean;
}

const WITH_AMOUNT = new Set(["item", "custom", "crate", "key"]);

function options(type: string, p: Props): string[] {
  if (type === "item") return p.materials;
  if (type === "custom") return p.customIds;
  if (type === "crate") return p.crateIds;
  if (type === "key") return p.keyIds;
  if (type === "title") return p.titleIds ?? [];
  return [];
}

function placeholder(type: string): string {
  if (type === "money") return "kwota, np. 500";
  if (type === "command") return "np. give {player} cake";
  if (type === "title") return "id tytułu";
  if (type === "unlock") return "nazwa, np. kowal";
  return "wybierz z listy";
}

/** Wspólny edytor listy nagród (format "rewards:" z core) - ten sam w każdym edytorze aplikacji. */
export default function RewardEditor(props: Props) {
  const { value, onChange, nested } = props;
  const baseId = useId();

  function set(i: number, patch: Partial<Reward>) {
    onChange(value.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  return (
    <div>
      {value.length === 0 && <p className="muted small">Brak nagród - dodaj co najmniej jedną.</p>}
      {value.map((r, i) => (
        <div key={i} className="card" style={{ padding: "0.6rem", marginBottom: "0.5rem" }}>
          <div className="row">
            <select
              value={r.type}
              onChange={(e) => set(i, { ...emptyReward(e.target.value as RewardType), fallback: r.fallback })}
            >
              {REWARD_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
              {!REWARD_TYPES.some((t) => t.type === r.type) && <option value={r.type}>{r.type}</option>}
            </select>
            <input
              list={`${baseId}-${i}`}
              value={r.value}
              placeholder={placeholder(r.type)}
              onChange={(e) =>
                set(i, {
                  value:
                    r.type === "item"
                      ? e.target.value.toUpperCase()
                      : r.type === "unlock"
                        ? e.target.value.toLowerCase().replace(/\s+/g, "_")
                        : e.target.value,
                })
              }
              style={{ flex: 1 }}
            />
            <datalist id={`${baseId}-${i}`}>
              {options(r.type, props).map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            {WITH_AMOUNT.has(r.type) && (
              <input
                type="number"
                min={1}
                title="Ilość"
                value={r.amount}
                onChange={(e) => set(i, { amount: Math.max(1, Number(e.target.value)) })}
                style={{ width: "4.5rem" }}
              />
            )}
            <button type="button" onClick={() => onChange(value.filter((_, ri) => ri !== i))}>
              Usuń
            </button>
          </div>
          <div className="row">
            <label className="checkbox">
              <input type="checkbox" checked={r.silent} onChange={(e) => set(i, { silent: e.target.checked })} />
              Bez wiadomości na czacie
            </label>
            {!nested && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={r.fallback.length > 0}
                  onChange={(e) => set(i, { fallback: e.target.checked ? [emptyReward("money")] : [] })}
                />
                Nagroda zastępcza (gdy tej nie da się dać)
              </label>
            )}
          </div>
          {!nested && r.fallback.length > 0 && (
            <div style={{ marginLeft: "1.2rem" }}>
              <div className="ci-section-title">Zamiast tego</div>
              <RewardEditor {...props} value={r.fallback} onChange={(fb) => set(i, { fallback: fb })} nested />
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, emptyReward("money")])}>
        + Dodaj nagrodę
      </button>
    </div>
  );
}
