/**
 * Handles the achievements popup lifecycle in Steam's in-game overlay.
 */
import { beforePatch, findModuleByExport } from 'millennium';
import { registerReactOverlayDocument, unregisterReactOverlayDocument } from './achievements';

type TabDescriptor = {
  id?: string;
  content?: { props?: { appid?: string | number; appId?: string | number } };
};
type TabsProps = {
  tabs?: TabDescriptor[];
  onShowTab?: (id: string) => void;
  autoFocusContents?: boolean;
  [key: string]: unknown;
};
type JsxArgs = [type: unknown, props: TabsProps | null, key?: unknown];
type JsxRuntime = {
  jsx: (...args: JsxArgs) => unknown;
  jsxs: (...args: JsxArgs) => unknown;
};
type ReactFactory = {
  Fragment: unknown;
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
};

function isInGameAchievementsTabs(props: TabsProps | null): props is TabsProps & { tabs: TabDescriptor[] } {
  if (!props || !Array.isArray(props.tabs) || typeof props.onShowTab !== 'function' ||
      props.autoFocusContents === undefined) return false;
  const ids = new Set(props.tabs.map(tab => tab?.id));
  // The library has no In Progress tab, but the in-game overlay does.
  return ids.has('inprogress') && ids.has('achievements') && ids.has('global');
}

function gameAppId(tabs: TabDescriptor[]): string {
  for (const tab of tabs) {
    const id = tab?.content?.props?.appid ?? tab?.content?.props?.appId;
    if ((typeof id === 'number' || typeof id === 'string') && /^\d{1,12}$/.test(String(id))) {
      return String(id);
    }
  }
  return '';
}

const wrapperCache = new WeakMap<object, (props: TabsProps) => unknown>();

function createWrapper(original: object, react: ReactFactory): (props: TabsProps) => unknown {
  const existing = wrapperCache.get(original);
  if (existing) return existing;

  const Wrapper = (props: TabsProps): unknown => {
    const appId = gameAppId(props.tabs || []);
    let registered: Document | null = null;
    const markerRef = (element: HTMLSpanElement | null): void => {
      if (!element) {
        if (registered) unregisterReactOverlayDocument(registered);
        registered = null;
        return;
      }
      const doc = element.ownerDocument;
      if (!doc.body?.classList?.contains('OverlayPopupBody')) return;
      registered = doc;
      registerReactOverlayDocument(doc, appId);
    };

    // Original element keeps its type/props. The marker is visually hidden.
    // It exists only to acquire the correct ownerDocument after React mounts.
    return react.createElement(react.Fragment, null,
      react.createElement(original, props),
      react.createElement('span', {
        'data-achievement-translator-overlay-marker': '1',
        'aria-hidden': true,
        style: { display: 'none' },
        ref: markerRef,
      }),
    );
  };
  wrapperCache.set(original, Wrapper);
  return Wrapper;
}

let installed = false;

export function installAchievementOverlayReactHook(): void {
  if (installed) return;

  const runtime = findModuleByExport((value: unknown, key: string) =>
    (key === 'jsx' || key === 'jsxs') && typeof value === 'function') as JsxRuntime | undefined;
  const react = findModuleByExport((value: unknown, key: string) =>
    key === 'createElement' && typeof value === 'function') as ReactFactory | undefined;

  if (!runtime || typeof runtime.jsx !== 'function' || typeof runtime.jsxs !== 'function' ||
      !react || typeof react.createElement !== 'function' || !react.Fragment) {
    console.warn('[Achievement Translator] Steam React JSX hook unavailable; library mode remains available.');
    return;
  }

  const intercept = (args: JsxArgs): void => {
    try {
      if (!isInGameAchievementsTabs(args[1])) return;
      const type = args[0];
      if ((typeof type !== 'function' && (typeof type !== 'object' || type === null))) return;
      // The patch replaces the component type, NOT Steam's tab descriptors.
      args[0] = createWrapper(type, react);
    } catch (error) {
      console.error('[Achievement Translator] Failed to inspect Steam achievements tabs:', error);
    }
  };

  const previous = new Map<'jsx' | 'jsxs', unknown>();
  const patch = (key: 'jsx' | 'jsxs'): void => {
    try {
      const original = runtime[key];
      beforePatch(runtime, key, intercept);
      previous.set(key, original);
    } catch (error) {
      console.error(`[Achievement Translator] Could not patch React ${key}:`, error);
    }
  };

  patch('jsx');
  patch('jsxs');
  installed = true;
  console.info('[Achievement Translator] Steam React overlay hook installed.');
  // Steam may restore jsx/jsxs when a game launches for the first time.
  // Only repatch when the exact previous (unpatched) function is restored.
  setInterval(() => {
    for (const key of ['jsx', 'jsxs'] as const) {
      if (!previous.has(key) || runtime[key] === previous.get(key)) patch(key);
    }
  }, 1000);
}
