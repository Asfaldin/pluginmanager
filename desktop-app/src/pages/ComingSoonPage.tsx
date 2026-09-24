import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  icon: LucideIcon;
  description?: string;
}

/** Placeholder dla zakładek, które są w planach, ale jeszcze nie gotowe do pokazania -
    strona istnieje w nawigacji (użytkownik wie, że to nadchodzi), ale bez połowicznej,
    niedopracowanej funkcjonalności w środku. */
export default function ComingSoonPage({ title, icon: Icon, description }: Props) {
  return (
    <div
      className="page"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "calc(100vh - 6rem)" }}
    >
      <Icon size={32} strokeWidth={1.5} style={{ opacity: 0.5, margin: "0.5rem 0" }} />
      <h1 style={{ margin: "0 0 0.5rem" }}>{title}</h1>
      <h2 style={{ margin: "0 0 0.5rem" }}>Już wkrótce</h2>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}
