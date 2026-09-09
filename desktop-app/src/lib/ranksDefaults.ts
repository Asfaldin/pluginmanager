import type { RanksConfig } from "./types";

// Mirrors mainplugins-ranks/src/main/resources/ranks-config.yml exactly. Used to
// auto-bootstrap the server the first time this page is opened for a profile where the
// plugin hasn't run yet (no file there to read) - same idea as DEFAULT_MENU_GUI.
export const DEFAULT_RANKS_CONFIG: RanksConfig = {
  wygladu: {
    GRACZ: { prefix: "", kolorNicku: "WHITE" },
    VIP: { prefix: "&6&l[VIP] ", kolorNicku: "GOLD" },
    ADMIN: { prefix: "&c&l[ADMIN] ", kolorNicku: "RED" },
  },
};
