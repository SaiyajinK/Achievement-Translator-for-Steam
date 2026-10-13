import { ICON_HOVER, ICON_NORMAL } from './icons';
import { STEAM_LANGUAGES, MY_TAB_NAMES, buttonLabel, originalButtonLabel, getLanguage, normalizeText, type SteamLanguage } from './locales';

type TranslationResult = { ok: boolean; detected?: string; text?: string; error?: string };
type ApiAchievement = { strID: string; strName: string; strDescription: string; flAchieved?: number; bAchieved?: boolean };
type AppAchievementResponse = { data?: { rgAchievements?: ApiAchievement[] } };
type SteamWindow = Window & {
  SteamClient?: { Apps?: { GetMyAchievementsForApp?: (appId: string) => Promise<AppAchievementResponse> }; Settings?: { GetCurrentLanguage?: () => Promise<string> } };
  appStore?: { m_mapApps?: unknown; m_rgApps?: unknown };
  g_strLanguage?: string;
};
type TabKind = 'progress' | 'my' | 'global';
type AchievementCopy = { id: string; name: string; description: string; translatedName: string; translatedDescription: string; nameReady: boolean; descriptionReady: boolean };
type GameCache = { appId: string; gameName: string; language: SteamLanguage; entries: AchievementCopy[]; complete: Record<TabKind, boolean>; byID: Map<string, AchievementCopy>; byName: Map<string, AchievementCopy>; showTranslated: Record<TabKind, boolean> };
type StoredCache = { version: 1; appId: string; language: SteamLanguage; gameName: string; complete: Partial<Record<TabKind, boolean>>; entries: AchievementCopy[] };
type CacheResponse = { ok: boolean; data?: string; error?: string; path?: string };

declare const backend: {
  detectAchievementLanguage(text: string, target: string): Promise<TranslationResult>;
  translateAchievementText(text: string, target: string, source: string): Promise<TranslationResult>;
  loadAchievementCache(appId: string, language: string): Promise<CacheResponse>;
  saveAchievementCache(appId: string, language: string, jsonPayload: string): Promise<CacheResponse>;
};
declare const SteamClient: SteamWindow['SteamClient'] | undefined;
declare const frontend: { getAchievementClientLanguage?: () => Promise<string> } | undefined;

const BUTTON_ID = 'at-achievement-translate';
const CSS_ID = 'at-achievement-style';
const LIBRARY_SELECTOR = '[class~="AchievementsOverlayContainer"] [class~="AchievementsPageContainer"]';
// The in-game overlay is a separate Steam window with a different DOM hierarchy.
// Only accept it if it contains the achievements tabs; other overlay dialogs are ignored.
const GAME_OVERLAY_SELECTOR = '[class~="OverlayPopupBody"]';
const TAB_ROW_SELECTOR = '[class~="AchievementTabs"] [role="tablist"]';
const TAB_SELECTOR = '[class~="AchievementTabs"] [role="tablist"] [role="tab"]';
const SESSION_CACHE = new Map<string, GameCache>(); // Fast in-memory mirror of backend JSON files.
const APP_ID_CACHE = new Map<string, string>();
const LOAD_REQUESTS = new Map<string, Promise<GameCache | undefined>>();
// Remember whether translation is necessary for each game, language and tab.
const TAB_LANGUAGE_STATUS = new Map<string, 'same' | 'different'>();
// A mounted React marker provides the actual document of an in-game overlay.
// FocusNavController does not expose this popup on all Steam builds.
const REACT_OVERLAY_APPIDS = new WeakMap<Document, string>();
let mountedOverlayDocument: Document | null = null;

let activeDocument: Document | null = null;
let activeGame = '';
let activeTab: TabKind | null = null;
let language: SteamLanguage | null = null;
let cachedLanguage: SteamLanguage | null = null;
let button: HTMLButtonElement | null = null;
let currentPromise: Promise<void> | null = null;
let inProgress = false;
let progressDone = 0;
let progressTotal = 0;
let detectionVersion = 0;
let observer: MutationObserver | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let monitorTimer: ReturnType<typeof setInterval> | null = null;

function steamWindow(): SteamWindow | null { return (activeDocument?.defaultView || null) as SteamWindow | null; }
function overlay(): HTMLElement | null {
  if (!activeDocument) return null;
  const library = activeDocument.querySelector<HTMLElement>(LIBRARY_SELECTOR);
  if (library) return library;
  const game = activeDocument.querySelector<HTMLElement>(GAME_OVERLAY_SELECTOR);
  return game?.querySelector(TAB_ROW_SELECTOR + ' [role="tab"]') ? game : null;
}
function isGameOverlay(): boolean { return !!overlay()?.matches(GAME_OVERLAY_SELECTOR); }
function sameLanguage(a: string, b: string): boolean {
  const x = a.toLowerCase().replace('_','-');
  const y = b.toLowerCase().replace('_','-');
  if (!x || x === 'und' || !y) return false;
  return x === y || (x.startsWith('es') && y.startsWith('es')) ||
    (x.startsWith('pt') && y.startsWith('pt')) || (['nb','no'].includes(x) && ['nb','no'].includes(y));
}
function keyOf(appId: string, lang: SteamLanguage): string { return appId + '\u001f' + lang; }
function normalized(value: string): string { return normalizeText(value).normalize('NFKC'); }

function firstTab(): HTMLElement | null {
  const root = overlay();
  if (!root) return null;
  const tabs = [...root.querySelectorAll<HTMLElement>(TAB_SELECTOR)];
  if (isGameOverlay()) return tabs.find(tab => /progress$/i.test(tab.id)) || tabs[0] || null;
  return tabs.find(tab => /achievements$/i.test(tab.id)) ||
    tabs.find(tab => MY_TAB_NAMES.has(normalizeText(tab.textContent || ''))) || tabs[0] || null;
}
function installCSS(): void {
  if (!activeDocument || activeDocument.getElementById(CSS_ID)) return;
  const style = activeDocument.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
    #${BUTTON_ID} {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-sizing: border-box;
      flex: 0 0 auto;
      white-space: nowrap;
      vertical-align: middle;
      cursor: pointer;
      font-weight: bold;
      font-size: 12px;
      line-height: 21px;
      letter-spacing: .5px;
      text-transform: uppercase;
      background-color: rgba(0, 0, 0, 0);
      color: #dcdedf;
      padding: 6px 16px;
      border: none;
      font-family: "Motiva Sans", Helvetica, sans-serif;
      border-radius: 64px;
      height: 34px;
    }
    #${BUTTON_ID}:hover:not(:disabled) {
      background: rgba(255, 255, 255, .12);
      color: #fff;
      border-radius: 64px;
    }
    #${BUTTON_ID}:active:not(:disabled) {
      background: rgba(255, 255, 255, .12);
      color: #fff;
      border-radius: 64px;
    }
    #${BUTTON_ID} img { width:21px;height:21px;object-fit:contain;flex:0 0 21px; filter:brightness(0) invert(1) !important }
    /* Center the four controls in the in-game overlay only. Keep library layout unchanged. */
    [data-at-game-overlay-tabs="yes"] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100%;
    }
    [data-at-game-overlay-tabs="yes"] > [class~="TabRowSpacer"] {
      flex: 0 0 0px !important;
      width: 0 !important;
    }
    #${BUTTON_ID}:disabled { opacity:.38;cursor:default }
    #${BUTTON_ID}[data-busy="yes"] { cursor:progress }
    #${BUTTON_ID}[data-busy="yes"] img { animation:at-achievement-pulse .8s ease-in-out infinite alternate }
    @keyframes at-achievement-pulse {from{opacity:.3}to{opacity:1}}`;
  activeDocument.head.appendChild(style);
}
function currentCache(): GameCache | undefined {
  if (!language) return undefined;
  const id = getAppId();
  if (id) return SESSION_CACHE.get(keyOf(id, language));
  const name = normalized(gameName());
  return [...SESSION_CACHE.values()].find(
    cache => cache.language === language && normalized(cache.gameName) === name,
  );
}
function detectionKey(appId: string, lang: SteamLanguage, tab: TabKind): string {
  return `${keyOf(appId, lang)}\u001e${tab}`;
}
function buttonNeedsDetection(): boolean {
  const tab = selectedTab();
  if (!tab || !language) return true;
  const cache = currentCache();
  // A finished translation can always be displayed or restored from cache.
  if (cache?.complete[tab] || cache?.showTranslated[tab]) return false;
  const appId = getAppId();
  if (!appId) return true;
  // While checking a newly selected tab, do not briefly enable the button.
  return TAB_LANGUAGE_STATUS.get(detectionKey(appId, language, tab)) !== 'different';
}
function refreshButton(): void { setButton(buttonNeedsDetection()); }

function setButton(disabled: boolean, reason?: string): void {
  if (!button) return;
  const cache = currentCache();
  const tab = selectedTab();
  const canToggle = !!(cache && tab && cache.showTranslated[tab]);
  const label = language
    ? (canToggle ? originalButtonLabel(language) : buttonLabel(language))
    : 'Translate achievements';
  // A fully translated list is never disabled: the next click restores originals.
  // Preserve the initial same-language disabled state from language detection.
  button.disabled = inProgress || !language || (disabled && !canToggle);
  button.title = reason || label;
  button.setAttribute('aria-label', label);
  const caption = button.querySelector('span');
  if (caption) caption.textContent = inProgress
    ? `${language ? buttonLabel(language) : label} (${progressTotal ? `${progressDone}/${progressTotal}` : '…'})`
    : label;
  button.dataset.busy = inProgress ? 'yes' : 'no';
}
function alignGameOverlayTabs(): void {
  if (!isGameOverlay()) return;
  const root = overlay();
  const first = firstTab();
  const strip = first?.parentElement;
  if (root && strip && root.contains(strip)) strip.dataset.atGameOverlayTabs = 'yes';
}
function installButton(): void {
  if (!activeDocument || !language) return;
  const tab = firstTab();
  if (!tab?.parentElement) return;
  // The shared frontend and the popup preload may both observe this document.
  // Never create a second button if another context already inserted one.
  if (activeDocument.getElementById(BUTTON_ID) && !button?.isConnected) {
    alignGameOverlayTabs();
    return;
  }
  if (button?.isConnected) {
    if (button.nextElementSibling !== tab) tab.before(button);
    alignGameOverlayTabs();
    return;
  }
  installCSS();
  button = activeDocument.createElement('button');
  button.type = 'button';
  button.id = BUTTON_ID;
  const icon = activeDocument.createElement('img');
  icon.alt = '';
  icon.draggable = false;
  icon.src = ICON_NORMAL;
  const label = activeDocument.createElement('span');
  button.append(icon, label);
  button.addEventListener('mouseenter', () => { if (button && !button.disabled) icon.src = ICON_HOVER; });
  button.addEventListener('mouseleave', () => { icon.src = ICON_NORMAL; });
  button.addEventListener('click', () => { if (!button?.disabled) void translateSelected(); });
  tab.before(button);
  alignGameOverlayTabs();
  refreshButton();
}

function gameName(): string {
  const root = overlay();
  if (!root) return '';
  const title = root.querySelector<HTMLElement>('[class~="GameName"], [class*="GameName"], [class~="AppName"]');
  if (title?.textContent?.trim()) return title.textContent.trim();
  const header = root.querySelector<HTMLElement>('[class*="HeaderContainer"], [class*="HeaderWrapper"]');
  return (header?.innerText || root.innerText || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
}
function appIdFromReact(root: HTMLElement): string {
  // Steam stores the current game in React props on some client builds.
  // Read-only traversal; never modify React or Steam state.
  const key = Object.keys(root).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  if (!key) return '';
  let fiber = (root as unknown as Record<string, unknown>)[key] as
    { return?: unknown; memoizedProps?: Record<string,unknown>; pendingProps?: Record<string,unknown> } | null;
  for (let depth = 0; fiber && depth < 30; depth++) {
    for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
      if (!props || typeof props !== 'object') continue;
      for (const object of [props, ...['app', 'game', 'gameInfo', 'details', 'data', 'appInfo', 'achievementInfo']
        .map(k => props[k]).filter(v => v && typeof v === 'object')]) {
        const values = object as Record<string, unknown>;
        for (const prop of ['appid', 'appID', 'appId', 'nAppID', 'unAppID']) {
          const id = values[prop];
          if ((typeof id === 'string' || typeof id === 'number') && /^\d{1,12}$/.test(String(id)))
            return String(id);
        }
      }
    }
    fiber = fiber.return as typeof fiber;
  }
  return '';
}
function appIdFromDOM(name: string): string {
  const doc = activeDocument;
  if (!doc) return '';
  const root = overlay();
  if (!root) return '';
  // Prefer an explicit app identifier attached to the achievements popup.
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('[data-appid], [data-app-id], [data-gameid]')]) {
    const id = element.getAttribute('data-appid') || element.getAttribute('data-app-id') || element.getAttribute('data-gameid');
    if (id && /^\d{1,12}$/.test(id)) return id;
  }
  // Overlay popups often store the AppID in the tab/page's React props,
  // not on the outer body. Inspect only the achievements subtree.
  const reactCandidates = [root, ...root.querySelectorAll<HTMLElement>(
    '[class~="AchievementTabs"], [class~="GamepadTabbedPage"], [class~="AchievementList"], [class~="OverlayPopup"]')];
  for (const candidate of reactCandidates) {
    const reactId = appIdFromReact(candidate);
    if (reactId) return reactId;
  }
  // Steam achievement and game icons commonly contain /apps/<AppID>/ in their URL.
  // This is only used to identify the game, never to identify achievement rows.
  for (const img of root.querySelectorAll<HTMLImageElement>('img[src]')) {
    const match = img.src.match(/\/(?:apps|app)\/(\d{1,12})\//i);
    if (match) return match[1];
  }
  const path = doc.location.pathname + doc.location.hash;
  const pathID = path.match(/(?:\/app\/|\/games\/details\/|\/stats\/)(\d{1,12})(?:\/|$)/);
  if (pathID) return pathID[1];
  // The selected library item often carries Steam's appid as data-appid.
  for (const item of doc.querySelectorAll<HTMLElement>('[data-appid], [data-app-id]')) {
    if (!name || !normalized(item.textContent || '').includes(normalized(name))) continue;
    const id = item.dataset.appid || item.dataset.appId;
    if (id && /^\d{1,12}$/.test(id)) return id;
  }
  return '';
}
function asEntries(obj: unknown): [string, unknown][] {
  if (!obj || typeof obj !== 'object') return [];
  if (obj instanceof Map) return [...obj.entries()].map(([id, value]) => [String(id), value]);
  if (Array.isArray(obj)) return obj.map((value, index) => [String(index), value]);
  return Object.entries(obj);
}
function appIdFromStore(name: string): string {
  if (!name) return '';
  const target = normalized(name);
  const win = steamWindow() as SteamWindow & { appStore?: { m_mapApps?: unknown; m_rgApps?: unknown } };
  const sharedStore = (globalThis as typeof globalThis & { appStore?: typeof win.appStore }).appStore;
  for (const store of [win?.appStore, sharedStore]) {
    for (const [key, info] of asEntries(store?.m_mapApps || store?.m_rgApps)) {
      if (!info || typeof info !== 'object') continue;
      const obj = info as Record<string,string | number>;
      const nameCandidate = String(obj.display_name || obj.strDisplayName || obj.strName || obj.name || '');
      if (normalized(nameCandidate) !== target) continue;
      const id = String(obj.appid || obj.appID || obj.nAppID || key);
      if (/^\d{1,12}$/.test(id)) return id;
    }
  }
  return '';
}
function getAppId(): string {
  const reactId = activeDocument ? REACT_OVERLAY_APPIDS.get(activeDocument) : undefined;
  if (reactId && isGameOverlay()) return reactId;
  const name = gameName();
  // Overlay achievements may have no visible game name. An AppID can still be
  // found from React props, icon URLs or data attributes.

  // The in-game overlay header often says only "Achievements" or "Succès".
  // Never reuse an AppID keyed by that generic label: it could belong to
  // a different game after the user switches games.
  const id = isGameOverlay()
    ? appIdFromDOM(name)
    : appIdFromDOM(name) || APP_ID_CACHE.get(normalized(name)) || appIdFromStore(name);
  if (id && !isGameOverlay() && name) APP_ID_CACHE.set(normalized(name), id);
  return id || '';
}
async function getAchievements(appId: string): Promise<ApiAchievement[]> {
  let openerApps: { GetMyAchievementsForApp?: (appId: string) => Promise<AppAchievementResponse> } | undefined;
  try { openerApps = (steamWindow()?.opener as SteamWindow | null)?.SteamClient?.Apps; } catch { /* cross-origin */ }
  const api = steamWindow()?.SteamClient?.Apps || (typeof SteamClient !== 'undefined' ? SteamClient?.Apps : undefined) || openerApps;
  if (!api?.GetMyAchievementsForApp) throw new Error('SteamClient.Apps.GetMyAchievementsForApp unavailable');
  const response = await api.GetMyAchievementsForApp(appId);
  const entries = response?.data?.rgAchievements;
  if (!Array.isArray(entries) || !entries.length) throw new Error('Steam achievement API returned no entries');
  return entries.filter(item => item && typeof item.strID === 'string' && typeof item.strName === 'string');
}
/** Never modify the inactive tab's DOM, even if Steam keeps it mounted. */
function selectedTab(): TabKind | null {
  const tab = overlay()?.querySelector<HTMLElement>(TAB_SELECTOR + '[aria-selected="true"]');
  if (!tab) return null;
  if (/global$/i.test(tab.id)) return 'global';
  if (/progress$/i.test(tab.id)) return 'progress';
  return 'my';
}
function captureRows(tab: TabKind): HTMLElement[] {
  const root = overlay();
  if (!root || selectedTab() !== tab) return [];
  const selector = tab === 'global'
    ? '[class~="GlobalAchievementListItem"]'
    : tab === 'my' ? '[class~="AchievementListItemBase"]'
    : '[class~="AchievementListItemBase"], [class~="GlobalAchievementListItem"], [class*="AchievementListItem"]';
  const activeTab = root.querySelector<HTMLElement>('[class*="AchievementTabs"] [role="tablist"] [role="tab"][aria-selected="true"]');
  const panelId = activeTab?.getAttribute('aria-controls');
  const panel = panelId ? activeDocument?.getElementById(panelId) : null;
  return [...(panel || root).querySelectorAll<HTMLElement>(selector)];
}
function rowFields(row: HTMLElement): { name?: HTMLElement; desc?: HTMLElement } {
  const name = row.querySelector<HTMLElement>('[class~="Title"], [class~="AchievementTitle"]');
  const desc = row.querySelector<HTMLElement>('[class~="Description"], [class~="AchievementDescription"]');
  if (name) return { name, desc: desc || undefined };
  // The personal achievements tab in older Steam builds lacks semantic classes.
  // Take only the first two text nodes, skipping metadata, exactly as in 0.1.5.
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  const elements: HTMLElement[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent?.trim() || '';
    if (!text || text.length > 450 || /%|\b\d{1,2}:\d{2}\b|\b(?:unlocked|débloqué|freigeschaltet|desbloqueado|sbloccato|разблокировано)\b/i.test(text)) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('button,script,style,noscript')) continue;
    elements.push(parent);
    if (elements.length >= 2) break;
  }
  return { name: elements[0], desc: elements[1] };
}
function replaceLeafText(element: HTMLElement, original: string, replacement: string): void {
  if (original === replacement) return;
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const content = text.nodeValue || '';
    if (content.trim() === original) {
      text.nodeValue = content.replace(original, replacement);
      return;
    }
  }
  // Do not destroy React/Steam markup if a title is split across several nodes.
}
function applyCache(cache: GameCache, tab: TabKind): void {
  for (const root of captureRows(tab)) {
    const { name, desc } = rowFields(root);
    const current = name?.textContent?.trim() || '';
    if (!current) continue;
    const record = cache.byID.get(root.id) || cache.byName.get(normalized(current));
    if (!record) continue;
    if (name && current !== record.translatedName && (current === record.name || normalized(current) === normalized(record.name))) {
      replaceLeafText(name, record.name, record.translatedName);
    }
    const shownDescription = desc?.textContent?.trim() || '';
    if (desc && record.description && shownDescription === record.description) {
      replaceLeafText(desc, record.description, record.translatedDescription);
    }
  }
}
function restoreCache(cache: GameCache, tab: TabKind): void {
  for (const root of captureRows(tab)) {
    const { name, desc } = rowFields(root);
    const current = name?.textContent?.trim() || '';
    if (!current) continue;
    const record = cache.byID.get(root.id) || cache.byName.get(normalized(current));
    if (!record) continue;
    if (name && current === record.translatedName && record.translatedName !== record.name) {
      replaceLeafText(name, record.translatedName, record.name);
    }
    const displayedDescription = desc?.textContent?.trim() || '';
    if (desc && record.translatedDescription !== record.description &&
        displayedDescription === record.translatedDescription) {
      replaceLeafText(desc, record.translatedDescription, record.description);
    }
  }
}
function makeLookup(cache: GameCache): void {
  cache.byID.clear();
  cache.byName.clear();
  for (const entry of cache.entries) {
    cache.byID.set(entry.id, entry);
    cache.byName.set(normalized(entry.name), entry);
    cache.byName.set(normalized(entry.translatedName), entry);
  }
}
function makeEmptyCache(appId: string, lang: SteamLanguage): GameCache {
  return { appId, gameName: gameName(), language: lang, entries: [],
    complete: { progress: false, my: false, global: false }, showTranslated: { progress: false, my: false, global: false },
    byID: new Map(), byName: new Map() };
}
/** Load the JSON once per game/language, only from the plugin backend. */
function ensureCache(appId: string, lang: SteamLanguage): Promise<GameCache | undefined> {
  const key = keyOf(appId, lang);
  const existing = LOAD_REQUESTS.get(key);
  if (existing) return existing;
  const load = (async () => {
    let cache = SESSION_CACHE.get(key);
    if (cache) return cache;
    cache = makeEmptyCache(appId, lang);
    try {
      const result = await backend.loadAchievementCache(appId, lang);
      if (result?.ok && result.data) {
        const stored = JSON.parse(result.data) as StoredCache;
        if (stored.version === 1 && stored.appId === appId && stored.language === lang && Array.isArray(stored.entries)) {
          cache.gameName = typeof stored.gameName === 'string' ? stored.gameName : gameName();
          cache.entries = stored.entries.filter(entry =>
            entry && typeof entry.id === 'string' && typeof entry.name === 'string' &&
            typeof entry.description === 'string' && typeof entry.translatedName === 'string' &&
            typeof entry.translatedDescription === 'string' && typeof entry.nameReady === 'boolean' &&
            typeof entry.descriptionReady === 'boolean');
          cache.complete.progress = stored.complete?.progress === true;
          cache.complete.my = stored.complete?.my === true;
          cache.complete.global = stored.complete?.global === true;
          makeLookup(cache);
        }
      } else if (result?.ok === false) {
        console.warn('[Achievement Translator] Disk cache unavailable:', result.error);
      }
    } catch (error) {
      console.warn('[Achievement Translator] Could not read persistent cache:', error);
    }
    SESSION_CACHE.set(key, cache);
    return cache;
  })();
  LOAD_REQUESTS.set(key, load);
  return load;
}
async function saveCache(cache: GameCache): Promise<void> {
  const payload: StoredCache = { version: 1, appId: cache.appId, language: cache.language,
    gameName: cache.gameName, complete: cache.complete, entries: cache.entries };
  try {
    const result = await backend.saveAchievementCache(cache.appId, cache.language, JSON.stringify(payload));
    if (!result?.ok) console.warn('[Achievement Translator] Cache save failed:', result?.error);
    else if (result.path) console.info('[Achievement Translator] Cache stored:', result.path);
  } catch (error) { console.warn('[Achievement Translator] Cache save failed:', error); }
}
function drawFromCache(): void {
  const cache = currentCache();
  const tab = selectedTab();
  if (!cache || !tab) return;
  if (cache.showTranslated[tab]) applyCache(cache, tab);
  else restoreCache(cache, tab);
}
function tabAchievements(all: ApiAchievement[], tab: TabKind): ApiAchievement[] {
  if (tab === 'global') return all;
  const rows = captureRows(tab);
  // "In progress" is a curated subset of achievements, not all locked achievements.
  // Translate only the items shown in that selected tab.
  if (tab === 'progress') {
    const ids = new Set(rows.map(r => r.id).filter(Boolean));
    const names = new Set(rows.map(r => normalized(rowFields(r).name?.textContent || '')).filter(Boolean));
    return all.filter(a => ids.has(a.strID) || names.has(normalized(a.strName)));
  }
  const hasUnlockFlag = all.some(a => typeof a.flAchieved === 'number' || typeof a.bAchieved === 'boolean');
  if (hasUnlockFlag) return all.filter(a => Number(a.flAchieved || 0) > 0 || a.bAchieved === true);
  // Older Steam API responses may omit unlock flags: restrict to DOM rows.
  const ids = new Set(rows.map(r => r.id).filter(Boolean));
  const names = new Set(rows.map(r => normalized(rowFields(r).name?.textContent || '')).filter(Boolean));
  return all.filter(a => ids.has(a.strID) || names.has(normalized(a.strName)));
}
async function detectNeed(game: string, version: number): Promise<void> {
  if (!language || inProgress) return;
  const appId = getAppId();
  const tab = selectedTab();
  if (!appId || !tab) return;
  const lang = language;
  const key = detectionKey(appId, lang, tab);
  // Persistent translations are reloaded in the background, without HTTP requests.
  const cache = await ensureCache(appId, lang);
  if (version !== detectionVersion || game !== activeGame || selectedTab() !== tab || inProgress) return;
  if (cache?.complete[tab]) {
    TAB_LANGUAGE_STATUS.set(key, 'different');
    refreshButton();
    return;
  }
  const known = TAB_LANGUAGE_STATUS.get(key);
  if (known) { refreshButton(); return; }
  try {
    const items = tabAchievements(await getAchievements(appId), tab);
    if (!items.length) return;
    const chunks = Array.from({ length: 4 }, (_, n) =>
      items.filter((_, i) => i % 4 === n).map(a => a.strName + '. ' + a.strDescription).join('. ').slice(0, 2600)).filter(Boolean);
    const result = await Promise.all(chunks.map(text => backend.detectAchievementLanguage(text, STEAM_LANGUAGES[lang].code)));
    if (version !== detectionVersion || game !== activeGame || selectedTab() !== tab || inProgress) return;
    const same = result.every(r => r.ok && sameLanguage(r.detected || '', STEAM_LANGUAGES[lang].code));
    TAB_LANGUAGE_STATUS.set(key, same ? 'same' : 'different');
    refreshButton();
  } catch (error) {
    console.warn('[Achievement Translator] Language detection unavailable:', error);
    if (version === detectionVersion && game === activeGame && selectedTab() === tab && !inProgress) {
      // If detection fails, preserve the manual translation action.
      TAB_LANGUAGE_STATUS.set(key, 'different');
      refreshButton();
    }
  }
}

async function translateItem(text: string, target: string): Promise<string> {
  if (!text.trim()) return '';
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await backend.translateAchievementText(text, target, 'auto');
      if (result?.ok && typeof result.text === 'string' && result.text.trim()) return result.text.trim();
      throw new Error(result?.error || 'Empty translation');
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  console.warn('[Achievement Translator] Failed translating:', text, lastError);
  throw lastError;
}

/** Send up to 4 texts in a single request. Check *every* marker and fall back to
 * individual translation if the remote provider changes/removes delimiters.
 * Never cache a guessed alignment. */
async function translateBatch(texts: string[], target: string): Promise<string[]> {
  if (texts.length === 1) return [await translateItem(texts[0], target)];
  const combined = texts.map((value, i) => `[[AT${i}]] ${value}`).join('\n');
  try {
    const result = await backend.translateAchievementText(combined, target, 'auto');
    if (result?.ok && typeof result.text === 'string') {
      const segments = result.text.split(/\[\[\s*AT\s*(\d+)\s*\]\]/i);
      const parsed = new Map<number, string>();
      for (let i = 1; i + 1 < segments.length; i += 2) {
        const position = Number(segments[i]);
        const value = segments[i + 1].trim();
        if (!Number.isInteger(position) || position < 0 || position >= texts.length || !value || parsed.has(position)) {
          throw new Error('Translation batch markers invalid');
        }
        parsed.set(position, value);
      }
      if (parsed.size !== texts.length || segments[0].trim()) throw new Error('Translation batch markers missing');
      return texts.map((_, i) => parsed.get(i)!);
    }
  } catch { /* The provider may alter the markers. Retain correctness first. */ }
  return Promise.all(texts.map(text => translateItem(text, target)));
}

type TranslationJob = { entry: AchievementCopy; field: 'translatedName' | 'translatedDescription'; source: string };
/** Consolidate repeated identical texts across achievements, including titles and
 * descriptions. Fallback entries are translated individually if a batch is bad. */
function groupJobs(jobs: TranslationJob[]): TranslationJob[][] {
  const grouped: TranslationJob[][] = [];
  let group: TranslationJob[] = [];
  let size = 0;
  for (const job of jobs) {
    if (group.length && (group.length >= 4 || size + job.source.length > 1100)) {
      grouped.push(group);
      group = [];
      size = 0;
    }
    group.push(job);
    size += job.source.length;
  }
  if (group.length) grouped.push(group);
  return grouped;
}

async function translateSelected(): Promise<void> {
  if (currentPromise || !language || !button) return;
  const tab = selectedTab();
  if (!tab) return;
  const appId = getAppId();
  if (!appId) {
    console.error('[Achievement Translator] AppID unavailable for:', gameName());
    button.title = 'AppID unavailable — see Steam DevTools console';
    return;
  }
  const gameToken = activeGame;
  const lang = language;
  const target = STEAM_LANGUAGES[lang].code;
  const work = async () => {
    inProgress = true;
    progressDone = 0;
    progressTotal = 0;
    ++detectionVersion;
    setButton(true);
    try {
      const cache = await ensureCache(appId, lang);
      if (!cache) throw new Error('Cache unavailable');
      // Toggle only the SELECTED tab. Other tab remains untouched.
      if (cache.showTranslated[tab]) {
        cache.showTranslated[tab] = false;
        if (gameToken === activeGame && selectedTab() === tab) restoreCache(cache, tab);
        return;
      }
      // Complete persistent cache: instant display, even after restarting Steam.
      if (cache.complete[tab]) {
        cache.showTranslated[tab] = true;
        if (gameToken === activeGame && selectedTab() === tab) applyCache(cache, tab);
        return;
      }
      const achievements = tabAchievements(await getAchievements(appId), tab);
      if (!achievements.length) throw new Error('No achievements for selected tab');
      const entriesByID = new Map(cache.entries.map(entry => [entry.id, entry]));
      const jobs: Array<{ entry: AchievementCopy; field: 'translatedName' | 'translatedDescription'; source: string }> = [];
      for (const item of achievements) {
        let entry = entriesByID.get(item.strID);
        if (!entry || entry.name !== item.strName || entry.description !== (item.strDescription || '')) {
          entry = { id: item.strID, name: item.strName, description: item.strDescription || '',
            translatedName: item.strName, translatedDescription: item.strDescription || '',
            nameReady: false, descriptionReady: !item.strDescription };
          entriesByID.set(entry.id, entry);
        }
        if (!entry.nameReady && entry.name) jobs.push({ entry, field: 'translatedName', source: entry.name });
        if (!entry.descriptionReady && entry.description) jobs.push({ entry, field: 'translatedDescription', source: entry.description });
      }
      cache.entries = [...entriesByID.values()];
      // Translate duplicate source strings only once, while counting a success
      // as done when its title AND description are available.
      const distinct = new Map<string, TranslationJob[]>();
      for (const job of jobs) {
        const listeners = distinct.get(job.source) || [];
        listeners.push(job);
        distinct.set(job.source, listeners);
      }
      const batches = groupJobs([...distinct.values()].map(items => items[0]));
      progressTotal = achievements.length;
      const updateProgress = () => {
        progressDone = achievements.filter(item => {
          const entry = entriesByID.get(item.strID);
          return !!entry?.nameReady && !!entry.descriptionReady;
        }).length;
        if (gameToken === activeGame && selectedTab() === tab) setButton(true);
      };
      updateProgress();
      let nextBatch = 0;
      let failures = 0;
      const worker = async () => {
        for (;;) {
          const index = nextBatch++;
          if (index >= batches.length) return;
          const batch = batches[index];
          try {
            const results = await translateBatch(batch.map(job => job.source), target);
            for (let n = 0; n < batch.length; n++) {
              for (const job of distinct.get(batch[n].source) || []) {
                job.entry[job.field] = results[n];
                if (job.field === 'translatedName') job.entry.nameReady = true;
                else job.entry.descriptionReady = true;
              }
            }
          } catch (error) {
            failures += batch.length;
            console.warn('[Achievement Translator] Failed batch:', error);
          }
          updateProgress();
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()));
      cache.complete[tab] = achievements.every(item => {
        const entry = entriesByID.get(item.strID);
        return entry?.nameReady && entry.descriptionReady;
      });
      makeLookup(cache);
      // Save successful entries even if some requests failed; only absent fields
      // will be translated on the next click. Writes are handled by the Lua backend.
      await saveCache(cache);
      cache.showTranslated[tab] = true;
      if (gameToken === activeGame && selectedTab() === tab) applyCache(cache, tab);
      if (failures) console.warn(`[Achievement Translator] ${failures}/${jobs.length} requests failed, successful entries saved.`);
      else console.info(`[Achievement Translator] ${tab}: ${achievements.length} achievements cached for AppID ${appId}.`);
    } catch (error) {
      console.error('[Achievement Translator] Selected tab translation failed:', error);
    } finally {
      inProgress = false;
      progressDone = 0;
      progressTotal = 0;
      currentPromise = null;
      refreshButton();
    }
  };
  currentPromise = work();
  await currentPromise;
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 30);
}
function refresh(): void {
  if (!overlay() || !language) return;
  installButton();
  const id = getAppId();
  const token = id || gameName();
  const tab = selectedTab();
  if (token !== activeGame || tab !== activeTab) {
    activeGame = token;
    activeTab = tab;
    ++detectionVersion;
    const version = detectionVersion;
    // Keep the button disabled while this tab's language is unknown.
    refreshButton();
    if (id) void ensureCache(id, language).then(() => {
      if (activeGame === token && activeTab === tab) {
        drawFromCache();
        refreshButton();
      }
    });
    void detectNeed(token, version);
  }
  drawFromCache();
  refreshButton();
}

async function steamLanguage(): Promise<SteamLanguage | null> {
  try { const code = await SteamClient?.Settings?.GetCurrentLanguage?.(); const lang = getLanguage(code); if (lang) return lang; } catch { /* fallback */ }
  try {
    const method = frontend?.getAchievementClientLanguage;
    if (method) { const lang = getLanguage(await method()); if (lang) return lang; }
  } catch { /* fallback */ }
  const win = steamWindow();
  const code = new URLSearchParams(activeDocument?.location.search || '').get('LANGUAGE');
  return getLanguage(code) || getLanguage(win?.g_strLanguage) || getLanguage(activeDocument?.documentElement.lang);
}
/** Called by the React JSX hook when its DOM marker mounts inside the overlay. */
export function registerReactOverlayDocument(doc: Document, appId: string): void {
  const id = String(appId || '');
  if (!/^\d{1,12}$/.test(id)) {
    console.warn('[Achievement Translator] React overlay mounted without a valid AppID.');
    return;
  }
  if (!doc?.body?.classList?.contains('OverlayPopupBody')) return;
  REACT_OVERLAY_APPIDS.set(doc, id);
  mountedOverlayDocument = doc;
  attach(doc);
  console.debug('[Achievement Translator] React overlay connected, AppID:', id);
}

/** Never keep a detached popup pinned after its React tree unmounts. */
export function unregisterReactOverlayDocument(doc: Document): void {
  if (mountedOverlayDocument === doc) mountedOverlayDocument = null;
}

function findDocument(): Document | null {
  const isAchievementsPopup = (doc: Document): boolean => {
    const body = doc.querySelector(GAME_OVERLAY_SELECTOR);
    return !!body?.querySelector(TAB_ROW_SELECTOR + ' [role="tab"]');
  };
  const isLibraryAchievements = (doc: Document): boolean => !!doc.querySelector(LIBRARY_SELECTOR);
  // This document is obtained from the mounted React overlay, NOT from
  // FocusNavController. Favor it over any library success window.
  if (mountedOverlayDocument?.body?.classList?.contains('OverlayPopupBody') &&
      isAchievementsPopup(mountedOverlayDocument)) return mountedOverlayDocument;
  const candidates: Document[] = [];
  if (typeof document !== 'undefined') candidates.push(document);
  const nav = (globalThis as typeof globalThis & {
    FocusNavController?: { m_rgAllContexts?: Array<{ m_activeWindow?: Window }> }
  }).FocusNavController;
  for (const ctx of nav?.m_rgAllContexts || []) {
    try {
      const doc = ctx.m_activeWindow?.document;
      if (doc?.body && !candidates.includes(doc)) candidates.push(doc);
    } catch { /* detached window */ }
  }
  // The game overlay can open while the library popup remains in the background.
  return candidates.find(isAchievementsPopup) || candidates.find(isLibraryAchievements) || null;
}
function attach(doc: Document): void {
  if (activeDocument === doc && observer) return;
  observer?.disconnect();
  if (button?.isConnected) button.remove();
  activeDocument = doc;
  button = null;
  activeGame = '';
  activeTab = null;
  language = cachedLanguage || getLanguage(new URLSearchParams(doc.location.search).get('LANGUAGE'));
  observer = new MutationObserver(scheduleRefresh);
  observer.observe(doc.body, { childList: true, subtree: true });
  if (language) refresh();
  else void steamLanguage().then(lang => { if (activeDocument !== doc) return; language = lang; if (lang) refresh(); });
}
export async function startAchievementTranslator(): Promise<void> {
  if (monitorTimer) return;
  const tick = () => { const doc = findDocument(); if (doc) attach(doc); };
  void steamLanguage().then(lang => { if (lang) cachedLanguage = lang; });
  tick();
  monitorTimer = setInterval(tick, 100);
}
