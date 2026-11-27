import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register the service worker (production builds only) so the app installs and runs offline.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

// Installed apps on Android stay in memory for hours. When the app comes back to the
// foreground, check whether a newer build is live and reload into it (state is saved first).
const loadedBundle = [...document.scripts].map((s) => s.src).find((src) => /assets\/index-[^/]+\.js/.test(src)) || '';
let lastCheck = 0;
async function checkForUpdate() {
  if (!import.meta.env.PROD || Date.now() - lastCheck < 60e3) return;
  lastCheck = Date.now();
  try {
    const html = await fetch(`./?_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    const live = html.match(/assets\/index-[^"']+\.js/)?.[0];
    // Reload at most once per live version, so a CDN serving mixed versions can't cause a loop.
    if (live && loadedBundle && !loadedBundle.includes(live) && sessionStorage.getItem('fuel-lift:reloadedFor') !== live) {
      sessionStorage.setItem('fuel-lift:reloadedFor', live);
      navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
      setTimeout(() => location.reload(), 300);
    }
  } catch {
    /* offline: try again next time */
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkForUpdate());
setInterval(checkForUpdate, 15 * 60e3);
setTimeout(checkForUpdate, 5000);

// Capture the install prompt (Chrome/Android) so Settings can offer an "Install app" button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  window.dispatchEvent(new Event('installable'));
});

// Ask the browser not to evict our localStorage under storage pressure.
navigator.storage?.persist?.().catch(() => {});
