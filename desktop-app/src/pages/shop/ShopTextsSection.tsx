import GameTextsSection from "../../components/GameTextsSection";
import { defaultAnnounceTexts, PLACEHOLDER_LABELS, SAMPLE_VALUES, TEXT_FIELDS, TEXT_GROUPS, type AnnounceTexts } from "../../lib/shopAnnounce";

interface Props {
  texts: AnnounceTexts;
  setTexts: (patch: AnnounceTexts) => void;
  language: string;
  currency: string;
  /** Który tekst ma być od razu otwarty (np. po „Zmień tekst” przy rotacji). */
  focusKey?: string | null;
  onHelp: () => void;
}

/** Ustawienia Sklepu → „Teksty w grze” (wspólna sekcja z danymi Sklepu). */
export default function ShopTextsSection({ texts, setTexts, language, currency, focusKey, onHelp }: Props) {
  return (
    <GameTextsSection
      texts={texts}
      setTexts={setTexts}
      fields={TEXT_FIELDS}
      groups={TEXT_GROUPS}
      defaults={defaultAnnounceTexts(language)}
      placeholderLabels={PLACEHOLDER_LABELS}
      sampleValues={SAMPLE_VALUES}
      currency={currency}
      focusKey={focusKey}
      helpId="shop-texts-v5"
      onHelp={onHelp}
    />
  );
}
