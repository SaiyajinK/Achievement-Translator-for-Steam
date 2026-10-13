import { startAchievementTranslator } from '../frontend/achievements';

// Some Steam achievement screens are hosted in an embedded Community webview.
// Do not initialize observers on the store or unrelated community pages.
export default async function main(): Promise<void> {
  // Steam's in-game achievement overlay is a separate about:blank popup.
  // Its body mounts after this preload script runs; start a lightweight DOM
  // observer there as well as in existing achievement browser views.
  if (!/\/(?:stats|achievements)(?:\/|$)/i.test(location.pathname) &&
      location.protocol !== 'about:' && location.hostname !== 'steamloopback.host') return;
  if (!document.body) {
    await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  }
  await startAchievementTranslator();
}
