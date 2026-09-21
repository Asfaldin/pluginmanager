// Prawdziwa struktura zależności Mainplugins - dwa poziomy, oba wyciągnięte z kodu, nie
// zgadywane:
//
//  - RING_IDS   - pluginy z zależnością na mainplugins-core w pom.xml (potrzebują go na
//                 classpath, więc nie odpalą się bez niego na serwerze) - łączą się z
//                 Core na diagramie.
//  - PLUGIN_LINKS - węższy, dokładniejszy sygnał: kto REALNIE woła serwis innego
//                 pluginu w czasie działania (CoreAPI.get*Service() + kto go
//                 .register(*Service.class) - zobacz git grep w Mainplugins). To są
//                 dodatkowe, "ciekawsze" połączenia między konkretnymi pluginami,
//                 rysowane jako osobne cięciwy na diagramie.
//
// Aktualizować ręcznie, jeśli ktoś doda/usunie moduł albo integrację - ten sam
// obowiązek co miał dawny PluginGraph.tsx.

export const RING_IDS = [
  "chatfilter",
  "crates",
  "dungeons",
  "fishing",
  "generators",
  "hud",
  "market",
  "quests",
  "ranks",
  "redstone",
  "shop",
  "skyblock",
  "spawn",
  "spawners",
  "tools",
];

export const STANDALONE_IDS = ["announcer", "farming", "menu", "teleport"];

/** id pluginu -> lista id pluginów, z których korzysta (przez wspólny serwis) - patrz
    komentarz wyżej. Rysowane jako dodatkowe cięciwy między węzłami na pierścieniu. */
export const PLUGIN_LINKS: Record<string, string[]> = {
  dungeons: ["crates"],
  fishing: ["crates"],
  tools: ["crates"],
  chatfilter: ["ranks"],
  hud: ["ranks"],
  generators: ["tools"],
  skyblock: ["spawn"],
  spawners: ["skyblock"],
  ranks: ["quests"],
};
