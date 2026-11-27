// Notifications, sound and vibration helpers.

const ICON = new URL('icons/icon-192.png', document.baseURI).href;
const BADGE = new URL('icons/badge-96.png', document.baseURI).href;

export const notifSupported = () => 'Notification' in window;
export const notifPermission = () => (notifSupported() ? Notification.permission : 'unsupported');

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export async function requestPermission() {
  if (!notifSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a system notification. Prefers the service worker (required on Android). */
export async function showSystemNotification(title, body, data = {}) {
  if (!notifSupported() || Notification.permission !== 'granted') return false;
  const options = {
    body,
    icon: ICON,
    badge: BADGE,
    tag: data.key || title,
    renotify: true,
    vibrate: [200, 100, 200],
    data,
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch (e) {
    console.warn('SW notification failed', e);
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ---- Sound: a soft two-tone chime generated with Web Audio (no audio files needed) ----
let ctx = null;
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* ignore */
  }
}

export function chime(kind = 'reminder') {
  try {
    unlockAudio();
    if (!ctx) return;
    const notes = kind === 'timer' ? [880, 880, 1175] : [659, 988];
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * (kind === 'timer' ? 0.22 : 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch {
    /* ignore */
  }
}

export function buzz(pattern = [200, 100, 200]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
