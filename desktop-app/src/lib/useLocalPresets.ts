import { useState } from "react";

export interface Preset<T> {
  name: string;
  savedAt: number;
  content: T;
}

function storageKey(namespace: string, scope: string) {
  return `preset:${namespace}:${scope}`;
}

function readPresets<T>(namespace: string, scope: string): Preset<T>[] {
  try {
    const raw = localStorage.getItem(storageKey(namespace, scope));
    return raw ? (JSON.parse(raw) as Preset<T>[]) : [];
  } catch {
    return [];
  }
}

function writePresets<T>(namespace: string, scope: string, presets: Preset<T>[]) {
  try {
    localStorage.setItem(storageKey(namespace, scope), JSON.stringify(presets));
  } catch {
    // ignore quota/serialization errors - presets are a local convenience, not critical data
  }
}

// Local presets are a per-editor "save a version of my work locally" safety
// net, independent of the server: never written by editing, never touched by
// publish/revert-to-server. `namespace` identifies the editor (e.g. "shop",
// "quests"); `scope` further separates presets that shouldn't mix (per
// profile, or per profile+tier/file for pages with more than one target).
export function useLocalPresets<T>(namespace: string) {
  const [presets, setPresets] = useState<Preset<T>[]>([]);
  const [selectedName, setSelectedName] = useState("");

  function load(scope: string) {
    setPresets(readPresets<T>(namespace, scope));
    setSelectedName("");
  }

  function saveAs(scope: string, name: string, content: T) {
    const next = [...presets.filter((p) => p.name !== name), { name, savedAt: Date.now(), content }];
    setPresets(next);
    writePresets(namespace, scope, next);
    setSelectedName(name);
  }

  function remove(scope: string, name: string) {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    writePresets(namespace, scope, next);
    if (selectedName === name) setSelectedName("");
  }

  function find(name: string): T | undefined {
    return presets.find((p) => p.name === name)?.content;
  }

  return { presets, selectedName, setSelectedName, load, saveAs, remove, find };
}
