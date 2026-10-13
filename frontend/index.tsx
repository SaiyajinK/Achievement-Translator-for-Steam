import { definePlugin } from 'millennium';
import { startAchievementTranslator } from './achievements';
import { getLanguage } from './locales';
import { settingsDescription } from './settings-locales';
import { installAchievementOverlayReactHook } from './react-overlay-hook';

const STYLE_ID = 'at-millennium-sidebar-description-style';

/** @ffi — used in Steam community webviews to obtain the ACTUAL client language. */
export async function getAchievementClientLanguage(): Promise<string> {
  try {
    return await SteamClient.Settings.GetCurrentLanguage();
  } catch {
    return '';
  }
}

declare const SteamClient: { Settings: { GetCurrentLanguage(): Promise<string> } };

/** The Millennium settings sidebar is React-managed; update its text after mounting. */
function LocalizedDescription() {
  return <div ref={(element) => {
    if (!element) return;
    // Dedicated rule for Millennium's plugin-description area only.
    const doc = element.ownerDocument;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = '.MillenniumDesktopSidebar_EditorContent { font-size: 13px !important; }';
      doc.head.appendChild(style);
    }
    void getAchievementClientLanguage().then(raw => {
      const language = getLanguage(raw) || 'english';
      if (element.isConnected) element.textContent = settingsDescription(language);
    });
  }}>{settingsDescription('english')}</div>;
}

export default definePlugin(() => {
  // Capture the actual in-game overlay document from its mounted React tree.
  // The existing DOM monitoring remains for the library achievement popup.
  installAchievementOverlayReactHook();
  void startAchievementTranslator();

  return {
    title: 'Achievement Translator',
    icon: <></>, // No custom image in Millennium settings; icons are for the achievement button only.
    content: <LocalizedDescription />,
  };
});
