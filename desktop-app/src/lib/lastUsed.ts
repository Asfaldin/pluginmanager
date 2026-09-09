// Remembers the last server + remote path picked on a given tool page, so
// reopening that page can auto-load instead of making the user reselect
// the server and click "Wczytaj" again every time.

export interface LastUsed {
  profileId: string;
  remotePath: string;
}

function storageKey(pageKey: string): string {
  return `pluginmanager:lastUsed:${pageKey}`;
}

export function getLastUsed(pageKey: string): LastUsed | null {
  try {
    const raw = localStorage.getItem(storageKey(pageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.profileId === "string" && typeof parsed?.remotePath === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setLastUsed(pageKey: string, value: LastUsed): void {
  try {
    localStorage.setItem(storageKey(pageKey), JSON.stringify(value));
  } catch {
    // localStorage unavailable - not remembering is a harmless degradation
  }
}
