import { Image, type LucideIcon } from "lucide-react";

/** Puste "pole" tam, gdzie docelowo ma być prawdziwe zdjęcie/grafika (PLUGIN_ART,
    PLUGIN_FEATURES[].image itd.) - dopóki ich nie ma, karta produktu/kroku ma się rzucać
    w oczy jako miejsce NA obrazek, nie wyglądać jak sam tekst. Przycinane do tego samego
    16:9 co prawdziwe zdjęcia (patrz .plugin-card-art/.plugin-detail-art w App.css), więc
    podmiana na realną grafikę później nic w layoucie nie zmienia. `icon` (domyślnie zwykła
    ikona obrazka) - przekaż ikonę konkretnego pluginu (PLUGIN_ICONS), żeby siatka kart nie
    wyglądała identycznie wszędzie, mimo braku prawdziwych zdjęć. */
export default function ImagePlaceholder({ label, className, icon: Icon = Image }: { label?: string; className?: string; icon?: LucideIcon }) {
  return (
    <div className={className ? `image-placeholder ${className}` : "image-placeholder"}>
      <Icon size={28} strokeWidth={1.5} />
      {label && <span>{label}</span>}
    </div>
  );
}
