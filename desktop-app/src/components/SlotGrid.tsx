import { Move, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MaterialIcon from "./MaterialIcon";

export interface SlotContent {
  label: string;
  sublabel?: string;
  /**
   * The slot's ROLE in the layout - drives the colored top-accent line, not
   * whether it currently holds real data. Quest/item/category slots that are
   * laid out in a scattered, non-contiguous pattern (mirroring the real
   * in-game path/progression visual) rely on every slot of that role - empty
   * or not - keeping its accent line, otherwise the path visibly breaks at
   * every empty position. Use `dim` (below) to de-emphasize an empty
   * placeholder's text instead of changing its kind.
   */
  kind: "quest" | "category" | "item" | "nav" | "filler" | "amount";
  /** Quiets this slot's label (e.g. a "+" add-affordance) to a low, still-
   * visible opacity instead of full brightness, without touching `kind` -
   * so a scattered layout's role-accent line (see `kind` above) stays
   * unbroken through empty slots. Full brightness on hover regardless. */
  dim?: boolean;
  /** When set, the slot renders the real texture icon (Minecraft-style) instead of text. */
  material?: string;
  /**
   * Puste pole roli (np. pole na kategorię, w którym nic jeszcze nie stoi) ma wyglądać jak
   * zwykłe tło, ale NADAL jest polem: w trybie układu da się je usunąć i przenieść.
   * Dlatego osobna flaga zamiast podmiany `kind` na "filler" - to ostatnie znaczy
   * "tu nie ma pola" i zabiera krzyżyk usuwania.
   */
  blank?: boolean;
  /** External "picked up" highlight, for pick-up/move flows owned by the caller (not the editable-mode one below). */
  highlighted?: boolean;
  onClick?: () => void;
  /** Right-click - only fires in non-editable mode, alongside onClick (not instead of it). */
  onContextMenu?: () => void;
  /**
   * Small always-visible handle (move icon) for picking a slot up to move/swap it,
   * without needing a separate "move mode" toggle - onClick keeps doing its
   * normal thing (edit/navigate) until something is picked up, at which
   * point onClick on every other slot becomes "place it here" instead.
   * Only rendered in non-editable mode (editable mode has its own built-in
   * pickup via plain click already).
   */
  onPickUp?: () => void;
  /** Small always-visible edit handle (pencil icon), top-right corner - a discoverable click alternative to onContextMenu. */
  onEdit?: () => void;
}

interface Props {
  content: Record<number, SlotContent>;
  size?: number;
  editable?: boolean;
  iconPackDir?: string;
  onMoveSlot?: (fromSlot: number, toSlot: number) => void;
  onAddSlot?: (slot: number) => void;
  onRemoveSlot?: (slot: number) => void;
  /** Przeciąganie na zajęte pole zamienia pola miejscami (onMoveSlot musi umieć zamianę). */
  allowSwap?: boolean;
  /** Bez kolorowych pasków ról nad polami - wygląd jak w grze. */
  plain?: boolean;
  /** Podpis pustego pola po najechaniu (np. przedmiot tła), zamiast „pusty”. */
  emptyLabel?: string;
}

export default function SlotGrid({
  content,
  size = 54,
  editable,
  iconPackDir,
  onMoveSlot,
  onAddSlot,
  onRemoveSlot,
  allowSwap,
  plain,
  emptyLabel,
}: Props) {
  const [pickedUp, setPickedUp] = useState<number | null>(null);
  // Przeciąganie myszką w trybie edycji - na zdarzeniach pointer, bo w oknie Tauri na Windowsie
  // zwykłe HTML5 drag&drop przechwytuje upuszczanie plików.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const slots = Array.from({ length: size }, (_, i) => i);

  const isOccupied = (i: number) => Boolean(content[i]) && content[i].kind !== "filler";

  useEffect(() => {
    if (dragFrom === null) return;
    const finish = () => {
      const to = dragOverRef.current;
      if (to !== null && to !== dragFrom && (allowSwap || !isOccupied(to))) {
        onMoveSlot?.(dragFrom, to);
        setPickedUp(null);
      }
      setDragFrom(null);
      setDragOver(null);
      dragOverRef.current = null;
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragFrom]);

  function handleClick(i: number, occupied: boolean, c?: SlotContent) {
    // Gdy pole ma wlasna akcje (np. "postaw tu podniesiona kategorie"), ma ona
    // pierwszenstwo takze w trybie ukladu - inaczej trzeba by sie przelaczac tam i z powrotem.
    if (c?.onClick) {
      c.onClick();
      return;
    }
    if (!editable) return;
    if (occupied) {
      // Clicking the already-picked-up slot again cancels the pickup;
      // clicking a different occupied slot re-targets the pickup to it.
      setPickedUp((prev) => (prev === i ? null : i));
      return;
    }
    if (pickedUp !== null) {
      onMoveSlot?.(pickedUp, i);
      setPickedUp(null);
    } else {
      onAddSlot?.(i);
    }
  }

  return (
    <div className={`slot-grid${plain ? " slot-grid-plain" : ""}`}>
      {slots.map((i) => {
        const c = content[i];
        const occupied = Boolean(c) && c!.kind !== "filler";
        const isPickedUp = (editable && (pickedUp === i || dragFrom === i)) || Boolean(c?.highlighted);
        const isDragTarget = dragFrom !== null && dragOver === i && dragFrom !== i && (allowSwap || !occupied);
        const hasIcon = Boolean(c?.material && iconPackDir);
        return (
          <div
            key={i}
            className={`slot-cell slot-${c?.kind ?? "filler"}${c?.blank ? " slot-blank" : ""}${c?.onClick && !editable ? " slot-clickable" : ""}${
              editable ? " slot-editable" : ""
            }${editable && !occupied ? " slot-drop-target" : ""}${isPickedUp ? " slot-picked-up" : ""}${
              isDragTarget ? " slot-drag-over" : ""
            }${c?.dim ? " slot-dim" : ""}`}
            style={editable && occupied ? { cursor: dragFrom !== null ? "grabbing" : "grab" } : undefined}
            onPointerDown={(e) => {
              if (!editable || !occupied || e.button !== 0 || !onMoveSlot) return;
              if ((e.target as HTMLElement).closest("button")) return; // × usuwa, nie przeciąga
              e.preventDefault();
              setDragFrom(i);
              setDragOver(i);
              dragOverRef.current = i;
            }}
            onPointerEnter={() => {
              if (dragFrom === null) return;
              setDragOver(i);
              dragOverRef.current = i;
            }}
            onDragStart={(e) => e.preventDefault()}
            onClick={() => handleClick(i, occupied, c)}
            onContextMenu={(e) => {
              if (editable || !c?.onContextMenu) return;
              e.preventDefault();
              c.onContextMenu();
            }}
            title={
              editable
                ? occupied
                  ? isPickedUp
                    ? "Kliknij ponownie, żeby anulować"
                    : `${c!.label} - kliknij, żeby podnieść (slot ${i})`
                  : pickedUp !== null
                    ? `Kliknij, żeby tu przenieść (slot ${i})`
                    : `Kliknij, żeby dodać nowy slot (slot ${i})`
                : c
                  ? `${c.label}${c.sublabel ? " - " + c.sublabel : ""} (slot ${i})`
                  : `${emptyLabel ?? "pusty"} (slot ${i})`
            }
          >
            {c && (
              <>
                {hasIcon ? (
                  <>
                    <MaterialIcon material={c!.material!} iconPackDir={iconPackDir} className="slot-cell-icon" />
                    {c.sublabel && <div className="slot-cell-badge">{c.sublabel}</div>}
                  </>
                ) : (
                  <>
                    <div className="slot-cell-label">{c.label}</div>
                    {c.sublabel && <div className="slot-cell-sublabel">{c.sublabel}</div>}
                  </>
                )}
                {/* Puste pole roli nie dostaje krzyzyka - nie ma czego z niego usuwac. */}
                {editable && occupied && !c.blank && (
                  <button
                    type="button"
                    className="slot-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pickedUp === i) setPickedUp(null);
                      onRemoveSlot?.(i);
                    }}
                  >
                    ×
                  </button>
                )}
                {!editable && c.onPickUp && (
                  <button
                    type="button"
                    className="slot-pickup-btn"
                    title="Podnieś, żeby przenieść/zamienić"
                    onClick={(e) => {
                      e.stopPropagation();
                      c.onPickUp!();
                    }}
                  >
                    <Move size={12} strokeWidth={2} />
                  </button>
                )}
                {!editable && c.onEdit && (
                  <button
                    type="button"
                    className="slot-edit-btn"
                    title="Edytuj"
                    onClick={(e) => {
                      e.stopPropagation();
                      c.onEdit!();
                    }}
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
