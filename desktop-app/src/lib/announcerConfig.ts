import * as yaml from "js-yaml";

// Model 1:1 z Mainplugins/mainplugins-announcer (AnnouncerConfig.java + model/*.java) po
// dużej rozbudowie tego pluginu - grupy z własnym harmonogramem, eventy (mosty z innych
// pluginów przez ServerAnnounceEvent), onboarding nowych graczy, integracja z Discordem,
// "kliknij aby odebrać" nagrody. Parser/serializer tutaj musi się zgadzać z tamtym kodem
// co do joty (nazwy kluczy YAML, wartości domyślne) - patrz komentarze przy każdym polu.

export type ChannelName = "CHAT" | "ACTIONBAR" | "TITLE" | "BOSSBAR";
export const ALL_CHANNELS: ChannelName[] = ["CHAT", "ACTIONBAR", "TITLE", "BOSSBAR"];

export type OrderingName = "SEQUENTIAL" | "RANDOM" | "WEIGHTED";
export const ALL_ORDERINGS: OrderingName[] = ["SEQUENTIAL", "RANDOM", "WEIGHTED"];

export const ALL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DayName = (typeof ALL_DAYS)[number];

export interface ClaimSpec {
  limit: number;
  windowSeconds: number;
  button: string;
  already: string;
  full: string;
  claimed: string;
  commands: string[];
}

export interface AnnMessage {
  id: string;
  text: string;
  weight: number;
  enabled: boolean;
  permission: string;
  worlds: string[];
  minPlayers: number;
  condition: string;
  channels: ChannelName[];
  /** null = dziedzicz z grupy, "" = świadomie brak dźwięku, "wartość" = własny dźwięk. */
  sound: string | null;
  minimessage: boolean;
  center: boolean;
  /** null = dziedzicz z grupy. */
  discord: boolean | null;
  titleFadeIn: number;
  titleStay: number;
  titleFadeOut: number;
  bossbarColor: string;
  bossbarSeconds: number;
  clickType: string;
  clickValue: string;
  hover: string;
  claim: ClaimSpec | null;
}

export interface ScheduleWindow {
  days: DayName[];
  /** "HH:mm-HH:mm" albo "" = cała doba. */
  timeRange: string;
}

export interface AnnGroup {
  name: string;
  /** <=0 = użyj globalnego interval-seconds. */
  intervalSeconds: number;
  ordering: OrderingName;
  noRepeat: boolean;
  prefix: string;
  channels: ChannelName[];
  sound: string;
  discord: boolean;
  frame: boolean;
  schedule: ScheduleWindow;
  messages: AnnMessage[];
}

export interface EventSpec {
  key: string;
  enabled: boolean;
  text: string;
  channels: ChannelName[];
  sound: string;
  cooldownSeconds: number;
  discord: boolean;
}

export interface OnboardingStep {
  delaySeconds: number;
  text: string;
  channels: ChannelName[];
}

export interface AnnouncerConfig {
  intervalSeconds: number;
  defaultOrder: OrderingName;
  placeholdersEnabled: boolean;
  /** "HH:mm-HH:mm" albo "" = brak ciszy nocnej. */
  quietHours: string;
  discordWebhookUrl: string;
  discordUsername: string;
  discordAvatarUrl: string;
  groups: AnnGroup[];
  events: EventSpec[];
  onboardingEnabled: boolean;
  onboarding: OnboardingStep[];
}

export const EMPTY_SCHEDULE: ScheduleWindow = { days: [], timeRange: "" };

export const EMPTY_MESSAGE: AnnMessage = {
  id: "",
  text: "",
  weight: 1,
  enabled: true,
  permission: "",
  worlds: [],
  minPlayers: 0,
  condition: "",
  channels: [],
  sound: null,
  minimessage: false,
  center: false,
  discord: null,
  titleFadeIn: 10,
  titleStay: 60,
  titleFadeOut: 10,
  bossbarColor: "BLUE",
  bossbarSeconds: 8,
  clickType: "",
  clickValue: "",
  hover: "",
  claim: null,
};

export const EMPTY_GROUP: AnnGroup = {
  name: "",
  intervalSeconds: 0,
  ordering: "SEQUENTIAL",
  noRepeat: true,
  prefix: "",
  channels: [],
  sound: "",
  discord: false,
  frame: false,
  schedule: EMPTY_SCHEDULE,
  messages: [],
};

export const EMPTY_EVENT: EventSpec = {
  key: "",
  enabled: true,
  text: "",
  channels: [],
  sound: "",
  cooldownSeconds: 0,
  discord: false,
};

export const EMPTY_ONBOARDING_STEP: OnboardingStep = { delaySeconds: 0, text: "", channels: [] };

export const EMPTY_CONFIG: AnnouncerConfig = {
  intervalSeconds: 300,
  defaultOrder: "SEQUENTIAL",
  placeholdersEnabled: true,
  quietHours: "",
  discordWebhookUrl: "",
  discordUsername: "Serwer",
  discordAvatarUrl: "",
  groups: [],
  events: [],
  onboardingEnabled: false,
  onboarding: [],
};

// ------------------------------------------------------------------ parsowanie

function str(v: unknown, def = ""): string {
  return v == null ? def : String(v);
}
function num(v: unknown, def: number): number {
  return typeof v === "number" ? v : def;
}
function bool(v: unknown, def: boolean): boolean {
  return v == null ? def : v === true || v === "true";
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => x != null).map(String) : [];
}
function channelList(v: unknown): ChannelName[] {
  return strList(v)
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ChannelName => (ALL_CHANNELS as string[]).includes(s));
}
function ordering(v: unknown, def: OrderingName): OrderingName {
  const s = str(v).trim().toUpperCase();
  return (ALL_ORDERINGS as string[]).includes(s) ? (s as OrderingName) : def;
}

/** Jedna wiadomość - goły string (tylko tekst) albo mapa z pełnym zestawem pól - patrz AnnMessage.parse w Javie. */
function parseMessage(raw: unknown, index: number): AnnMessage | null {
  if (typeof raw === "string") {
    return { ...EMPTY_MESSAGE, id: "adhoc", text: raw };
  }
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.text == null) return null;

  let claim: ClaimSpec | null = null;
  if (typeof m.claim === "object" && m.claim !== null) {
    const cm = m.claim as Record<string, unknown>;
    const commands = strList(cm.commands);
    if (commands.length > 0) {
      claim = {
        limit: num(cm.limit, 0),
        windowSeconds: num(cm["window-seconds"], 0),
        button: str(cm.button, "&a&l[ODBIERZ]"),
        already: str(cm.already, "&7Już odebrałeś tę nagrodę."),
        full: str(cm.full, "&cWszystkie nagrody zostały już rozdane!"),
        claimed: str(cm.claimed, "&aNagroda odebrana!"),
        commands,
      };
    }
  }

  return {
    id: str(m.id, `msg-${index}`),
    text: str(m.text),
    weight: Math.max(1, num(m.weight, 1)),
    enabled: bool(m.enabled, true),
    permission: str(m.permission),
    worlds: strList(m.worlds),
    minPlayers: Math.max(0, num(m["min-players"], 0)),
    condition: str(m.condition),
    channels: channelList(m.channels ?? (m.type != null ? [m.type] : undefined)),
    sound: m.sound == null ? null : str(m.sound),
    minimessage: bool(m.minimessage, false),
    center: bool(m.center, false),
    discord: m.discord == null ? null : bool(m.discord, false),
    titleFadeIn: num(m["title-fade-in"], 10),
    titleStay: num(m["title-stay"], 60),
    titleFadeOut: num(m["title-fade-out"], 10),
    bossbarColor: str(m["bossbar-color"], "BLUE").toUpperCase(),
    bossbarSeconds: Math.max(1, num(m["bossbar-seconds"], 8)),
    clickType: str(m.click).toUpperCase(),
    clickValue: str(m["click-value"]),
    hover: str(m.hover),
    claim,
  };
}

function parseSchedule(raw: unknown): ScheduleWindow {
  if (typeof raw !== "object" || raw === null) return EMPTY_SCHEDULE;
  const sm = raw as Record<string, unknown>;
  const days = strList(sm.days)
    .map((d) => d.trim().toUpperCase())
    .filter((d): d is DayName => (ALL_DAYS as readonly string[]).includes(d));
  return { days, timeRange: str(sm["time-range"]) };
}

function parseGroup(name: string, raw: unknown, defaultOrdering: OrderingName): AnnGroup {
  const m = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const messages: AnnMessage[] = [];
  if (Array.isArray(m.messages)) {
    m.messages.forEach((mm, i) => {
      const parsed = parseMessage(mm, i);
      if (parsed) messages.push(parsed);
    });
  }
  return {
    name,
    intervalSeconds: num(m.interval, 0),
    ordering: ordering(m.order, defaultOrdering),
    noRepeat: bool(m["no-repeat"], true),
    prefix: str(m.prefix),
    channels: channelList(m.channels),
    sound: str(m.sound),
    discord: bool(m.discord, false),
    frame: bool(m.frame, false),
    schedule: parseSchedule(m.schedule),
    messages,
  };
}

function parseEvent(key: string, raw: unknown): EventSpec {
  const m = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    key,
    enabled: bool(m.enabled, true),
    text: str(m.text),
    channels: channelList(m.channels),
    sound: str(m.sound),
    cooldownSeconds: Math.max(0, num(m["cooldown-seconds"], 0)),
    discord: bool(m.discord, false),
  };
}

function parseOnboardingStep(raw: unknown): OnboardingStep | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.text == null) return null;
  return { delaySeconds: Math.max(0, num(m["delay-seconds"], 0)), text: str(m.text), channels: channelList(m.channels) };
}

/** Odzwierciedla AnnouncerConfig.load(): płaska lista "messages" (stary format) staje się
    niejawną grupą "default", żeby nic się nie zgubiło przy otwarciu starszego pliku. */
export function parseAnnouncerConfig(text: string): AnnouncerConfig {
  if (!text.trim()) return EMPTY_CONFIG;
  const raw = (yaml.load(text) ?? {}) as Record<string, unknown>;

  const defaultOrdering = ordering(raw["default-order"], "SEQUENTIAL");
  const groups: AnnGroup[] = [];

  const flatMessages: AnnMessage[] = [];
  if (Array.isArray(raw.messages)) {
    raw.messages.forEach((m, i) => {
      const parsed = parseMessage(m, i);
      if (parsed) flatMessages.push(parsed);
    });
  }
  if (flatMessages.length > 0) {
    groups.push({ ...EMPTY_GROUP, name: "default", ordering: defaultOrdering, messages: flatMessages });
  }

  if (typeof raw.groups === "object" && raw.groups !== null) {
    for (const [key, val] of Object.entries(raw.groups as Record<string, unknown>)) {
      groups.push(parseGroup(key, val, defaultOrdering));
    }
  }

  const events: EventSpec[] = [];
  if (typeof raw.events === "object" && raw.events !== null) {
    for (const [key, val] of Object.entries(raw.events as Record<string, unknown>)) {
      events.push(parseEvent(key, val));
    }
  }

  const onboarding: OnboardingStep[] = [];
  const ob = (raw.onboarding ?? {}) as Record<string, unknown>;
  if (Array.isArray(ob.messages)) {
    ob.messages.forEach((m) => {
      const step = parseOnboardingStep(m);
      if (step) onboarding.push(step);
    });
  }

  return {
    intervalSeconds: Math.max(20, num(raw["interval-seconds"], 300)),
    defaultOrder: defaultOrdering,
    placeholdersEnabled: bool((raw.placeholders as Record<string, unknown> | undefined)?.enabled, true),
    quietHours: str(raw["quiet-hours"]),
    discordWebhookUrl: str((raw.discord as Record<string, unknown> | undefined)?.["webhook-url"]),
    discordUsername: str((raw.discord as Record<string, unknown> | undefined)?.username, "Serwer"),
    discordAvatarUrl: str((raw.discord as Record<string, unknown> | undefined)?.["avatar-url"]),
    groups,
    events,
    onboardingEnabled: bool(ob.enabled, false),
    onboarding,
  };
}

// ------------------------------------------------------------------ serializacja

function messageToYaml(m: AnnMessage): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: m.id,
    text: m.text,
    weight: m.weight,
    enabled: m.enabled,
    permission: m.permission,
    worlds: m.worlds,
    "min-players": m.minPlayers,
    condition: m.condition,
    channels: m.channels,
    minimessage: m.minimessage,
    center: m.center,
    "title-fade-in": m.titleFadeIn,
    "title-stay": m.titleStay,
    "title-fade-out": m.titleFadeOut,
    "bossbar-color": m.bossbarColor,
    "bossbar-seconds": m.bossbarSeconds,
    click: m.clickType,
    "click-value": m.clickValue,
    hover: m.hover,
  };
  // sound/discord: brak klucza = "dziedzicz z grupy" (patrz AnnMessage w Javie) - stąd
  // dopisywane TYLKO gdy user jawnie ustawił nadpisanie, nie zawsze.
  if (m.sound !== null) out.sound = m.sound;
  if (m.discord !== null) out.discord = m.discord;
  if (m.claim) {
    out.claim = {
      limit: m.claim.limit,
      "window-seconds": m.claim.windowSeconds,
      button: m.claim.button,
      already: m.claim.already,
      full: m.claim.full,
      claimed: m.claim.claimed,
      commands: m.claim.commands,
    };
  }
  return out;
}

function groupToYaml(g: AnnGroup): Record<string, unknown> {
  return {
    interval: g.intervalSeconds,
    order: g.ordering,
    "no-repeat": g.noRepeat,
    prefix: g.prefix,
    channels: g.channels,
    sound: g.sound,
    discord: g.discord,
    frame: g.frame,
    schedule: { days: g.schedule.days, "time-range": g.schedule.timeRange },
    messages: g.messages.map(messageToYaml),
  };
}

function eventToYaml(e: EventSpec): Record<string, unknown> {
  return {
    enabled: e.enabled,
    text: e.text,
    channels: e.channels,
    sound: e.sound,
    "cooldown-seconds": e.cooldownSeconds,
    discord: e.discord,
  };
}

/** Odwrotność parseAnnouncerConfig - zawsze pisze WSZYSTKO przez "groups:" (nawet grupę
    "default" odziedziczoną ze starego, płaskiego "messages:"), a top-level "messages:"
    zostawia pustą listę. Inaczej AnnouncerConfig.load() przy następnym wczytaniu
    doklejałby starą płaską listę jako DRUGĄ, zduplikowaną grupę "default". */
export function serializeAnnouncerConfig(config: AnnouncerConfig): string {
  const groupsYaml: Record<string, unknown> = {};
  for (const g of config.groups) {
    groupsYaml[g.name] = groupToYaml(g);
  }
  const eventsYaml: Record<string, unknown> = {};
  for (const e of config.events) {
    eventsYaml[e.key] = eventToYaml(e);
  }

  const doc = {
    "interval-seconds": config.intervalSeconds,
    "default-order": config.defaultOrder,
    placeholders: { enabled: config.placeholdersEnabled },
    "quiet-hours": config.quietHours,
    discord: {
      "webhook-url": config.discordWebhookUrl,
      username: config.discordUsername,
      "avatar-url": config.discordAvatarUrl,
    },
    messages: [],
    groups: groupsYaml,
    events: eventsYaml,
    onboarding: {
      enabled: config.onboardingEnabled,
      messages: config.onboarding.map((s) => ({ "delay-seconds": s.delaySeconds, text: s.text, channels: s.channels })),
    },
  };

  return yaml.dump(doc, { lineWidth: -1 });
}
