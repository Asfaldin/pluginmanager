import type { ChatFilterConfig } from "./types";

// Mirrors mainplugins-chatfilter/src/main/resources/chatfilter-config.yml exactly. Used
// to auto-bootstrap the server the first time this page is opened for a profile where
// the plugin hasn't run yet (no file there to read) - same idea as DEFAULT_MENU_GUI.
export const DEFAULT_CHATFILTER_CONFIG: ChatFilterConfig = {
  antySpam: { enabled: true, cooldownSekundy: 5 },
  antyCaps: { enabled: true, minDlugosc: 8, progProcent: 60, exemptRangi: ["ADMIN"] },
  dlugoscWiadomosci: { enabled: true, limitZnakow: 128, exemptRangi: ["ADMIN"] },
  antyReklama: {
    enabled: true,
    koncowkiDomen: ["pl", "com", "net", "org", "gg", "io", "eu", "de", "co", "xyz", "info", "tv", "me", "shop", "site", "online", "club", "top", "biz"],
    exemptRangi: ["ADMIN"],
  },
  powtorzonaWiadomosc: { enabled: true, exemptRangi: ["ADMIN"] },
  powtarzajaceZnaki: { enabled: true, minPowtorzen: 5, exemptRangi: ["ADMIN"] },
};
