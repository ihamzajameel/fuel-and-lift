// App chrome: tab bar, reminder banner, rest timer, toast.
import { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  ChartLine,
  Check,
  Clock,
  Coffee,
  Droplet,
  Dumbbell,
  Egg,
  House,
  Moon,
  Nut,
  Pill,
  Ruler,
  Salad,
  Settings,
  Timer,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../lib/app-context';
import { useStore } from '../lib/store';
import { cx } from './ui';
import { fmtDuration, fmtTime } from '../lib/time';
import { describeActions } from '../lib/reminders';
import { buzz, chime, showSystemNotification } from '../lib/notify';

export const REMINDER_ICONS = { coffee: Coffee, droplet: Droplet, salad: Salad, egg: Egg, zap: Zap, dumbbell: Dumbbell, utensils: Utensils, moon: Moon, pill: Pill, nut: Nut, ruler: Ruler, bell: BellRing };
export const reminderIcon = (name) => REMINDER_ICONS[name] || BellRing;

const TABS = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'food', label: 'Food', icon: Utensils },
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: ChartLine },
  { id: 'more', label: 'More', icon: Settings },
];

export function TabBar() {
  const { tab, go } = useApp();
  const { state } = useStore();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/95 backdrop-blur-md pb-safe" aria-label="Main">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const active = tab === t.id;
          const live = t.id === 'train' && state.activeSession;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              aria-current={active ? 'page' : undefined}
              className={cx('relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-muted')}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
              <span className="relative">
                <t.icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
                {live && <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-lift" />}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function ReminderBanner() {
  const { banners, dismissBanner, actOnBanner } = useApp();
  const { state } = useStore();
  const b = banners[banners.length - 1];
  if (!b) return null;
  const rem = state.reminders.find((r) => r.id === b.id);
  if (!rem) return null;
  const Icon = reminderIcon(rem.icon);
  const parts = describeActions(rem, state.presets).map((p) => (rem.dynamic === 'water' && /ml water/.test(p) ? `${b.ask || 250} ml water` : p));
  const opensTrain = rem.actions?.openTab === 'train';
  return (
    <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-40 px-3">
      <div
        key={b.okey}
        role="alert"
        className="anim-slide-down pointer-events-auto mx-auto mt-2 max-w-lg rounded-2xl border border-accent/40 bg-surface-2 p-3.5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <Icon size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">
              {b.missed ? `Missed at ${fmtTime(b.at)}` : fmtTime(b.at)}
              {banners.length > 1 && ` · ${banners.length - 1} more`}
            </p>
            <p className="font-semibold leading-snug">{b.title}</p>
            <p className="mt-0.5 text-sm leading-snug text-muted">{b.body}</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismissBanner(b.okey)} className="-mt-1 -mr-1 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-3">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {opensTrain ? (
            <button type="button" onClick={() => actOnBanner(b, 'train')} className="press inline-flex h-10 items-center gap-1.5 rounded-xl bg-lift px-3.5 text-sm font-semibold text-on-accent">
              <Dumbbell size={16} /> Open workout
            </button>
          ) : parts.length ? (
            <button type="button" onClick={() => actOnBanner(b, 'log')} className="press inline-flex h-10 max-w-full items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-semibold text-on-accent">
              <Check size={16} className="shrink-0" /> <span className="truncate">Log {parts.join(' + ')}</span>
            </button>
          ) : null}
          <button type="button" onClick={() => actOnBanner(b, 'done')} className="press h-10 rounded-xl border border-line bg-surface-3 px-3.5 text-sm font-medium">
            Done
          </button>
          <button type="button" onClick={() => actOnBanner(b, 'snooze')} className="press inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface-3 px-3.5 text-sm font-medium">
            <Clock size={15} /> 10 min
          </button>
        </div>
      </div>
    </div>
  );
}

export function RestTimer() {
  const { timer, startRest, stopRest } = useApp();
  const { state } = useStore();
  const [now, setNow] = useState(Date.now());
  const firedFor = useRef(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);

  const remaining = timer ? Math.max(0, (timer.endAt - now) / 1000) : 0;
  const finished = timer && remaining <= 0;

  useEffect(() => {
    if (!finished || firedFor.current === timer.endAt) return;
    firedFor.current = timer.endAt;
    if (state.settings.sound) chime('timer');
    if (state.settings.vibrate) buzz([300, 120, 300, 120, 400]);
    if (document.visibilityState !== 'visible') showSystemNotification('Rest over', timer.label ? `Next set: ${timer.label}` : 'Time for your next set', { key: 'rest' });
    const t = setTimeout(() => stopRest(), 6000);
    return () => clearTimeout(t);
  }, [finished, timer, state.settings.sound, state.settings.vibrate, stopRest]);

  if (!timer) return null;
  const pct = Math.min(100, (1 - remaining / timer.total) * 100);
  const adjust = (delta) => startRest(Math.max(5, Math.round(remaining + delta)), timer.label, timer.total + delta);

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-30 px-3 pb-2">
      <div className={cx('anim-slide-up mx-auto max-w-lg overflow-hidden rounded-2xl border shadow-2xl shadow-black/40', finished ? 'border-accent bg-accent/15' : 'border-line bg-surface-2')}>
        <div className="h-1 bg-surface-3">
          <div className={cx('h-full transition-[width] duration-300', finished ? 'bg-accent' : 'bg-lift')} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 p-2.5">
          <Timer size={20} className={finished ? 'text-accent' : 'text-lift'} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="tnum text-2xl leading-none font-bold" aria-live="polite">
              {finished ? 'Go!' : fmtDuration(remaining)}
            </p>
            <p className="truncate text-xs text-muted">{finished ? 'Rest over, next set' : timer.label || 'Rest'}</p>
          </div>
          {!finished && (
            <>
              <button type="button" onClick={() => adjust(-15)} className="press h-10 rounded-lg bg-surface-3 px-2.5 text-sm font-semibold tnum">
                −15
              </button>
              <button type="button" onClick={() => adjust(15)} className="press h-10 rounded-lg bg-surface-3 px-2.5 text-sm font-semibold tnum">
                +15
              </button>
            </>
          )}
          <button type="button" onClick={stopRest} className="press h-10 rounded-lg bg-surface-3 px-3 text-sm font-semibold">
            {finished ? 'OK' : 'Skip'}
          </button>
        </div>
        {!finished && (
          <div className="flex gap-1.5 px-2.5 pb-2.5">
            {[60, 90, 120].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => startRest(s, timer.label)}
                className={cx('press h-8 flex-1 rounded-lg text-xs font-semibold', timer.total === s ? 'bg-lift/20 text-fg' : 'bg-surface-3 text-muted')}
              >
                {s}s
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Toast() {
  const { toastMsg, clearToast, timer } = useApp();
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(clearToast, toastMsg.ms || 3500);
    return () => clearTimeout(t);
  }, [toastMsg, clearToast]);
  if (!toastMsg) return null;
  return (
    <div
      className={cx('pointer-events-none fixed inset-x-0 z-40 px-4', timer ? 'bottom-[calc(env(safe-area-inset-bottom)+200px)]' : 'bottom-[calc(env(safe-area-inset-bottom)+76px)]')}
      role="status"
    >
      <div key={toastMsg.id} className="anim-slide-up pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface-3 px-4 py-3 shadow-xl">
        <Check size={18} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 text-sm">{toastMsg.text}</span>
        {toastMsg.action && (
          <button
            type="button"
            onClick={() => {
              toastMsg.action.run();
              clearToast();
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent"
          >
            {toastMsg.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
