import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { AppCtx } from './lib/app-context';
import { ReminderBanner, RestTimer, TabBar, Toast } from './components/chrome';
import Today from './screens/Today';
import Food from './screens/Food';
import Train from './screens/Train';
import Progress from './screens/Progress';
import More from './screens/More';
import { dueBetween, isOccurrenceDone, reminderContent } from './lib/reminders';
import { buzz, chime, showSystemNotification, unlockAudio } from './lib/notify';
import * as ops from './lib/ops';
import { dayKey, uid } from './lib/time';
import { useBotSync } from './lib/sync';

const LAST_CHECK = 'fuel-lift:lastCheck';
const FIRED = 'fuel-lift:fired';
const TIMER = 'fuel-lift:timer';
const GRACE_MS = 45 * 60 * 1000; // reminders missed while the app was closed still show if < 45 min old

const readJSON = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};

function initialTab() {
  const q = new URLSearchParams(location.search);
  const go = q.get('go');
  if (['today', 'food', 'train', 'progress', 'more'].includes(go)) return go;
  return sessionStorage.getItem('fuel-lift:tab') || 'today';
}

function Shell() {
  const { state, mutate, latest, today } = useStore();
  const [tab, setTab] = useState(initialTab);
  const [moreView, setMoreView] = useState('main');
  const [toastMsg, setToastMsg] = useState(null);
  const [banners, setBanners] = useState([]);
  const [timer, setTimer] = useState(() => {
    const t = readJSON(TIMER, null);
    return t && t.endAt > Date.now() - 5000 ? t : null;
  });

  // ---------- theme ----------
  const theme = state.settings.theme;
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.setAttribute('data-theme', t);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f3f5f8' : '#0b0f14');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // iOS/Safari only allow audio after a user gesture.
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    return () => window.removeEventListener('pointerdown', h);
  }, []);

  const go = useCallback((t, sub) => {
    setTab(t);
    if (t === 'more') setMoreView(sub || 'main');
    sessionStorage.setItem('fuel-lift:tab', t);
    window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((text, action, ms) => setToastMsg({ id: uid(), text, action, ms }), []);
  const clearToast = useCallback(() => setToastMsg(null), []);

  const startRest = useCallback((sec, label, total) => {
    const t = { endAt: Date.now() + sec * 1000, total: Math.max(sec, total || sec), label: label || '' };
    setTimer(t);
    localStorage.setItem(TIMER, JSON.stringify(t));
  }, []);
  const stopRest = useCallback(() => {
    setTimer(null);
    localStorage.removeItem(TIMER);
  }, []);

  // ---------- reminder engine ----------
  const fire = useCallback(
    (occs, { forceSystem = false } = {}) => {
      const s = latest.current;
      // Telegram handles reminders when connected; the app stays quiet to avoid double pings.
      const viaTelegram = s.meta.tg?.paired && s.meta.tg?.reminders !== false;
      const items = [];
      for (const o of occs) {
        if (viaTelegram && !o.test) continue;
        const rem = s.reminders.find((r) => r.id === o.id);
        if (!rem) continue;
        if (!o.test && isOccurrenceDone(rem, { ...o, okey: o.baseKey || o.okey }, s)) continue; // already logged: stay quiet
        const c = reminderContent(rem, s);
        items.push({ ...o, title: c.title, body: c.body, ask: c.ask, missed: Date.now() - o.at > 3 * 60e3 });
      }
      if (!items.length) return;
      setBanners((b) => [...b.filter((x) => !items.some((i) => i.okey === x.okey)), ...items].slice(-6));
      const foreground = document.visibilityState === 'visible' && document.hasFocus();
      if (foreground) {
        if (s.settings.sound) chime();
        if (s.settings.vibrate) buzz();
      }
      if (!foreground || forceSystem) {
        for (const i of items) showSystemNotification(i.title, i.body, { key: i.okey, url: `./?r=${encodeURIComponent(i.okey)}` });
      }
    },
    [latest]
  );

  useEffect(() => {
    const check = () => {
      const s = latest.current;
      const now = Date.now();
      let last = Number(localStorage.getItem(LAST_CHECK)) || now;
      if (now - last > 12 * 3600e3) last = now - 12 * 3600e3;
      const fired = new Set(readJSON(FIRED, []));
      const due = dueBetween(s.reminders, last, now, s.settings.dayStartHour);
      const snoozed = (s.meta.snoozes || [])
        .filter((z) => z.at > last && z.at <= now)
        .map((z) => ({ id: z.id, okey: `${z.okey}#${z.at}`, baseKey: z.okey, dayKey: z.okey.split('@')[1], at: z.at }));
      const fresh = [...due, ...snoozed].filter((o) => !fired.has(o.okey) && now - o.at <= GRACE_MS);
      fresh.forEach((o) => fired.add(o.okey));
      localStorage.setItem(FIRED, JSON.stringify([...fired].slice(-300)));
      localStorage.setItem(LAST_CHECK, String(now));
      if (fresh.length) fire(fresh);
    };
    check();
    const id = setInterval(check, 15000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [fire, latest]);

  // Tapping a system notification focuses the app; make sure its banner is on top.
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type !== 'notification-click' || !e.data.key) return;
      setBanners((b) => {
        const i = b.findIndex((x) => x.okey === e.data.key);
        if (i < 0) return b;
        return [...b.slice(0, i), ...b.slice(i + 1), b[i]];
      });
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  useBotSync({ state, mutate, today, latest, toast });

  const dismissBanner = useCallback((okey) => setBanners((b) => b.filter((x) => x.okey !== okey)), []);

  const actOnBanner = useCallback(
    (b, what) => {
      const rem = latest.current.reminders.find((r) => r.id === b.id);
      const key = b.dayKey;
      const base = b.baseKey || b.okey;
      if (what === 'log' && rem) {
        const r = rem.dynamic === 'water' ? { ...rem, actions: { ...rem.actions, waterMl: b.ask || rem.actions.waterMl } } : rem;
        mutate((d) => ops.runReminderActions(d, key, r, base));
        toast('Logged. Nice work.');
      } else if (what === 'done') {
        mutate((d) => ops.markDone(d, key, base));
      } else if (what === 'snooze') {
        mutate((d) => ops.snooze(d, b.id, base, 10));
        toast('Snoozed for 10 minutes');
      } else if (what === 'train') {
        mutate((d) => ops.markDone(d, key, base));
        go('train');
      }
      dismissBanner(b.okey);
    },
    [mutate, toast, go, dismissBanner, latest]
  );

  const testReminder = useCallback(
    (remId) => {
      const s = latest.current;
      const rem = s.reminders.find((r) => r.id === remId) || s.reminders[0];
      const key = dayKey(new Date(), s.settings.dayStartHour);
      fire([{ id: rem.id, okey: `${rem.id}@${key}@test-${Date.now()}`, dayKey: key, at: Date.now(), test: true }], { forceSystem: true });
    },
    [fire, latest]
  );

  const app = useMemo(
    () => ({ tab, go, moreView, setMoreView, toast, toastMsg, clearToast, timer, startRest, stopRest, banners, dismissBanner, actOnBanner, testReminder }),
    [tab, go, moreView, toast, toastMsg, clearToast, timer, startRest, stopRest, banners, dismissBanner, actOnBanner, testReminder]
  );

  const Screen = { today: Today, food: Food, train: Train, progress: Progress, more: More }[tab] || Today;

  return (
    <AppCtx.Provider value={app}>
      <div className={timer ? 'pb-[calc(env(safe-area-inset-bottom)+200px)]' : 'pb-[calc(env(safe-area-inset-bottom)+84px)]'}>
        <div className="mx-auto min-h-dvh max-w-lg">
          <Screen />
        </div>
      </div>
      <ReminderBanner />
      <RestTimer />
      <Toast />
      <TabBar />
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
