import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Tauri's WebView2 shows a browser-style right-click menu (Reload, Back,
// Forward, Inspect...) by default, which breaks the "this is a real desktop
// app" feel. Suppress it everywhere except editable fields, where the
// native Cut/Copy/Paste menu is still genuinely useful.
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const isEditable = target.closest("input, textarea, [contenteditable='true']");
  if (!isEditable) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
