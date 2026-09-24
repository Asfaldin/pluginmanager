import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { quitApp } from "../lib/quitApp";
import { useAnyDirty } from "../state/DirtyContext";
import { useSidebar } from "../state/SidebarContext";

const appWindow = getCurrentWindow();

// Te same wartości co szerokość .sidebar/.sidebar.collapsed w App.css - lewy segment
// paska tytułu musi się dokładnie zgadzać, inaczej znowu widać szew zamiast jednej bryły.
const SIDEBAR_WIDTH = 220;
const SIDEBAR_WIDTH_COLLAPSED = 56;

/** Własny pasek tytułu - okno ma "decorations": false (patrz tauri.conf.json). Lewy
    segment ma dokładnie szerokość i kolor paska bocznego (patrz useSidebar) - dzięki temu
    sidebar wygląda, jakby sięgał od samej góry okna, a marka appki (logo/RSMCMANAGER/BETA,
    patrz Layout.tsx) siedzi w jednej ciągłej bryle zamiast pod osobnym, pustym paskiem.
    Prawy segment zostaje w kolorze treści (--bg), żeby pasek nie kontrastował z contentem.
    `data-tauri-drag-region` zastępuje przeciąganie okna, które normalnie daje natywny
    pasek - Tauri obsługuje to wbudowanie (też podwójny klik = maksymalizacja). Krzyżyk
    woła quitApp() (destroy() + pytanie o niezapisane zmiany) zamiast close() - close()
    idzie przez zdarzenie onCloseRequested w CloseGuard.tsx, które bywa zawodne (patrz
    komentarz przy dawnym quitApp w SettingsPage.tsx), więc krzyżyk używa tej samej,
    sprawdzonej ścieżki co "Zamknij aplikację" w Ustawieniach. */
export default function TitleBar() {
  const { collapsed } = useSidebar();
  const anyDirty = useAnyDirty();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="titlebar">
      <div
        className="titlebar-drag titlebar-drag-sidebar"
        data-tauri-drag-region
        style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH }}
      />
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="titlebar-controls">
        <button type="button" onClick={() => appWindow.minimize()} title="Minimalizuj">
          <Minus size={14} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => appWindow.toggleMaximize()} title={maximized ? "Przywróć" : "Maksymalizuj"}>
          <Square size={11} strokeWidth={2} />
        </button>
        <button type="button" className="titlebar-close" onClick={() => quitApp(anyDirty)} title="Zamknij">
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
