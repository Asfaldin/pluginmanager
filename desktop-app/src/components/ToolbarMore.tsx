import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

// Every editor page used to stack profile picker + icon-pack status + publish/
// revert + presets + RCON as 4-5 always-visible rows above the actual grid -
// the same boilerplate repeated on every page, pushing the thing people
// actually look at (the grid) below a wall of controls. This tucks the
// less-frequently-touched bits (icon pack management, presets, RCON) behind
// one toggle, so the primary row (profile + publish/revert) stays short and
// the grid shows up right underneath it.
export default function ToolbarMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="toolbar-more">
      <button type="button" className="toolbar-more-toggle" onClick={() => setOpen((o) => !o)}>
        <Settings2 size={14} strokeWidth={1.75} /> Więcej {open ? <ChevronUp size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
      </button>
      {open && <div className="toolbar-more-panel">{children}</div>}
    </div>
  );
}
