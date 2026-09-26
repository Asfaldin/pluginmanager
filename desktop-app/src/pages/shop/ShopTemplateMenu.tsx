import { Package, Sparkles, Square } from "lucide-react";
import TemplateMenu, { type UserTemplateEntry } from "../../components/TemplateMenu";
import type { ShopTemplateId } from "../../lib/shopTemplates";
import { plural } from "../../lib/plText";

interface Props {
  /** Co jest teraz w edytorze 1:1: id gotowego szablonu albo "user:<id>"; null = sklep zmieniony, własny. */
  current: string | null;
  labels: Record<ShopTemplateId, string>;
  userTemplates: Array<Omit<UserTemplateEntry, "detail"> & { categories: number }>;
  disabled?: boolean;
  /** Gotowy szablon, "user:<id>", "file" albo "save". */
  onPick: (id: string) => void;
  onRemoveUser: (id: string) => void;
  onExportUser?: (id: string) => void;
  onRenameUser?: (id: string) => void;
  onQuickSave?: () => void;
  unsent?: boolean;
}

const DESC: Record<ShopTemplateId, string> = {
  big: "10 kategorii, rotacja, spawnery - od razu do gry",
  small: "4 kategorie po 8 przedmiotów, okrągłe ceny - baza do przerobienia na swój",
  empty: "bez kategorii - budujesz wszystko sam",
};

const ICON = {
  big: <Sparkles size={16} strokeWidth={1.75} />,
  small: <Package size={16} strokeWidth={1.75} />,
  empty: <Square size={16} strokeWidth={1.75} />,
};

/** Wybór szablonu Sklepu - wspólne menu (components/TemplateMenu) z danymi Sklepu. */
export default function ShopTemplateMenu({ current, labels, userTemplates, disabled, onPick, onRemoveUser, onExportUser, onRenameUser, onQuickSave, unsent }: Props) {
  return (
    <TemplateMenu
      current={current}
      choices={(Object.keys(labels) as ShopTemplateId[]).map((id) => ({ id, label: labels[id], desc: DESC[id], icon: ICON[id] }))}
      what="sklep"
      title="Szablony sklepu"
      userTemplates={userTemplates.map((t) => ({ ...t, detail: `${t.categories} ${plural(t.categories, "kategoria", "kategorie", "kategorii")}` }))}
      disabled={disabled}
      onPick={onPick}
      onRemoveUser={onRemoveUser}
      onExportUser={onExportUser}
      onRenameUser={onRenameUser}
      onQuickSave={onQuickSave}
      unsent={unsent}
    />
  );
}
